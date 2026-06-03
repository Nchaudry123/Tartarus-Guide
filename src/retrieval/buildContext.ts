import { supabase } from "../db/client";
import type { ChunkMatch, FactMatch } from "../types/schema";
import { searchChunks } from "./searchChunks";
import { searchFacts } from "./searchFacts";

export type RetrievalContext = {
  query: string;
  facts: FactMatch[];
  chunks: ChunkMatch[];
  sources: Array<{ title: string; url: string; domain: string }>;
};

export async function buildContext(query: string): Promise<RetrievalContext> {
  const facts = await searchFacts(query);
  const chunks = await searchChunks(query);

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

  await supabase.from("retrieval_logs").insert({
    user_query: query,
    matched_entities: facts.map((fact) => fact.entity),
    matched_facts: facts,
    matched_chunks: chunks.map((chunk) => ({
      id: chunk.id,
      source_url: chunk.source_url,
      section_title: chunk.section_title,
      similarity: chunk.similarity,
    })),
  });

  return {
    query,
    facts,
    chunks,
    sources: [...sourceMap.values()],
  };
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
