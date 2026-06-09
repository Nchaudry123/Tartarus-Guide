import { supabase } from "../db/client";
import type { ChunkMatch, FactMatch } from "../types/schema";
import { searchChunks } from "./searchChunks";
import { searchFacts } from "./searchFacts";

export type RetrievalContext = {
  query: string;
  queries: string[];
  facts: FactMatch[];
  chunks: ChunkMatch[];
  sources: Array<{ title: string; url: string; domain: string }>;
};

export type RetrievalPlan = {
  queries: string[];
  includeFacts?: boolean;
  includeChunks?: boolean;
  factLimit?: number;
  chunkLimit?: number;
};

function dedupeFacts(facts: FactMatch[]): FactMatch[] {
  const byKey = new Map<string, FactMatch>();
  for (const fact of facts) {
    const key = `${fact.entity.normalized_name}:${fact.fact_type}:${fact.value.toLowerCase()}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      fact.confidence > existing.confidence ||
      (fact.confidence === existing.confidence &&
        fact.source.credibility_rank < existing.source.credibility_rank)
    ) {
      byKey.set(key, fact);
    }
  }
  return [...byKey.values()];
}

function diversifyChunks(chunks: ChunkMatch[], limit: number): ChunkMatch[] {
  const unique = new Map<string, ChunkMatch>();
  for (const chunk of chunks) {
    const existing = unique.get(chunk.id);
    if (!existing || (chunk.similarity ?? 0) > (existing.similarity ?? 0)) {
      unique.set(chunk.id, chunk);
    }
  }

  const sorted = [...unique.values()].sort((a, b) => {
    const similarity = (b.similarity ?? 0) - (a.similarity ?? 0);
    if (similarity !== 0) return similarity;
    return (a.source_credibility_rank ?? 99) - (b.source_credibility_rank ?? 99);
  });

  const selected: ChunkMatch[] = [];
  const perSource = new Map<string, number>();
  const perDomain = new Map<string, number>();

  for (const chunk of sorted) {
    const sourceCount = perSource.get(chunk.source_url) ?? 0;
    const domainCount = perDomain.get(chunk.source_domain) ?? 0;
    if (sourceCount >= 2) continue;
    if (domainCount >= Math.ceil(limit * 0.75) && sorted.some((item) => item.source_domain !== chunk.source_domain)) {
      continue;
    }
    selected.push(chunk);
    perSource.set(chunk.source_url, sourceCount + 1);
    perDomain.set(chunk.source_domain, domainCount + 1);
    if (selected.length >= limit) break;
  }

  if (selected.length < limit) {
    for (const chunk of sorted) {
      if (selected.some((item) => item.id === chunk.id)) continue;
      selected.push(chunk);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

export async function buildPlannedContext(plan: RetrievalPlan): Promise<RetrievalContext> {
  const queries = [...new Set(plan.queries.map((query) => query.trim()).filter(Boolean))].slice(0, 2);
  if (!queries.length) throw new Error("Retrieval plan requires at least one query.");

  const includeFacts = plan.includeFacts ?? true;
  const includeChunks = plan.includeChunks ?? true;
  const factLimit = plan.factLimit ?? 14;
  const chunkLimit = plan.chunkLimit ?? 10;

  const results = await Promise.all(
    queries.map(async (query) => {
      const [facts, chunks] = await Promise.all([
        includeFacts ? searchFacts(query, factLimit) : Promise.resolve([]),
        includeChunks ? searchChunks(query, chunkLimit) : Promise.resolve([]),
      ]);
      return { facts, chunks };
    }),
  );

  const facts = dedupeFacts(results.flatMap((result) => result.facts))
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        a.source.credibility_rank - b.source.credibility_rank,
    )
    .slice(0, factLimit);
  const chunks = diversifyChunks(results.flatMap((result) => result.chunks), chunkLimit);

  const sourceMap = new Map<string, { title: string; url: string; domain: string }>();
  for (const fact of facts) {
    sourceMap.set(fact.source.url, {
      title: fact.source.title,
      url: fact.source.url,
      domain: fact.source.domain,
    });
  }
  for (const chunk of chunks) {
    sourceMap.set(chunk.source_url, {
      title: chunk.source_title,
      url: chunk.source_url,
      domain: chunk.source_domain,
    });
  }

  void supabase.from("retrieval_logs").insert({
    user_query: queries.join("\n---\n"),
    matched_entities: facts.map((fact) => fact.entity),
    matched_facts: facts,
    matched_chunks: chunks.map((chunk) => ({
      id: chunk.id,
      source_url: chunk.source_url,
      section_title: chunk.section_title,
      similarity: chunk.similarity,
    })),
  }).then(({ error }) => {
    if (error) console.error("Retrieval logging failed:", error);
  });

  return {
    query: queries[0],
    queries,
    facts,
    chunks,
    sources: [...sourceMap.values()],
  };
}

export async function buildContext(query: string): Promise<RetrievalContext> {
  return buildPlannedContext({ queries: [query] });
}

export function formatContext(context: RetrievalContext): string {
  const facts = context.facts
    .map(
      (fact, index) =>
        `[Fact ${index + 1}] ${fact.entity.name} (${fact.entity.type}) - ${fact.fact_type}: ${fact.value} (confidence ${fact.confidence}, source: ${fact.source.url})`,
    )
    .join("\n");

  const chunks = context.chunks
    .map(
      (chunk, index) =>
        `[Chunk ${index + 1}] ${chunk.source_title} / ${chunk.section_title ?? "Untitled"} (${chunk.source_url})\n${chunk.chunk_text}`,
    )
    .join("\n\n");

  return `Structured facts:\n${facts || "No structured facts found."}\n\nRetrieved chunks:\n${chunks || "No chunks found."}`;
}
