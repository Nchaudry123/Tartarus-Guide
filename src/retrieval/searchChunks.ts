import { createEmbedding, supabase } from "../db/client";
import type { ChunkMatch } from "../types/schema";

function escapePostgrestPattern(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function searchTerms(query: string): string[] {
  const stopWords = new Set([
    "about",
    "answer",
    "beat",
    "current",
    "does",
    "enemy",
    "feel",
    "feels",
    "guide",
    "help",
    "need",
    "persona",
    "reload",
    "strategy",
    "weak",
    "weakness",
    "what",
    "which",
    "with",
  ]);

  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !stopWords.has(term));

  const unique = [...new Set(terms)];
  const phrases = query
    .match(/[A-Z][a-z0-9']+(?:\s+[A-Z][a-z0-9']+)*/g)
    ?.map((phrase) => phrase.toLowerCase())
    .filter((phrase) => phrase.split(/\s+/).length > 1) ?? [];

  return [...new Set([...phrases, ...unique])].slice(0, 7);
}

function rerankScore(chunk: ChunkMatch, terms: string[]): number {
  const title = chunk.source_title.toLowerCase();
  const section = (chunk.section_title ?? "").toLowerCase();
  const text = chunk.chunk_text.toLowerCase();
  const haystack = `${title} ${section} ${text}`;
  const termHits = terms.filter((term) => haystack.includes(term)).length;
  const headingHits = terms.filter((term) => `${title} ${section}`.includes(term)).length;
  const exactPhraseHit = terms.some((term) => term.includes(" ") && haystack.includes(term));

  let penalty = 0;
  if (/about ign.*guide writers|find in guide|top guide sections/.test(`${title} ${section}`)) penalty += 0.22;
  if (/adclick\.g\.doubleclick|markdown content:|url source:/.test(text)) penalty += 0.3;
  if (termHits === 0) penalty += 0.18;

  return (
    (chunk.similarity ?? 0) +
    Math.min(0.2, termHits * 0.035) +
    Math.min(0.16, headingHits * 0.055) +
    (exactPhraseHit ? 0.12 : 0) -
    penalty
  );
}

async function keywordFallback(query: string, limit: number): Promise<ChunkMatch[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];

  const exactPhrases = terms.filter((term) => term.includes(" "));
  const filters = terms.flatMap((term) => [
    `chunk_text.ilike.%${escapePostgrestPattern(term)}%`,
    `section_title.ilike.%${escapePostgrestPattern(term)}%`,
  ]);

  let queryBuilder = supabase
    .from("chunks")
    .select(`
      id,
      source_id,
      section_title,
      chunk_text,
      token_count,
      sources!inner(title,url,domain,credibility_rank)
    `)
    .or(filters.join(","))
    .order("credibility_rank", { referencedTable: "sources", ascending: true })
    .order("created_at", { ascending: false })
    .limit(Math.max(limit, 12));

  const { data, error } = await queryBuilder;

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => {
    const item = row as Record<string, any>;
    const source = Array.isArray(item.sources) ? item.sources[0] : item.sources;
    const haystack = `${item.section_title ?? ""} ${item.chunk_text ?? ""} ${source.title ?? ""}`.toLowerCase();
    const exactBoost = exactPhrases.some((phrase) => haystack.includes(phrase)) ? 0.18 : 0;
    const termHits = terms.filter((term) => haystack.includes(term)).length;
    return {
      id: item.id,
      source_id: item.source_id,
      section_title: item.section_title,
      chunk_text: item.chunk_text,
      token_count: item.token_count,
      similarity: Math.min(0.72, 0.42 + exactBoost + termHits * 0.03),
      source_title: source.title,
      source_url: source.url,
      source_domain: source.domain,
      source_credibility_rank: source.credibility_rank,
    };
  })
    .sort((a, b) => {
      const aRank = a.source_credibility_rank ?? 99;
      const bRank = b.source_credibility_rank ?? 99;
      return (b.similarity ?? 0) - (a.similarity ?? 0) || aRank - bRank;
    })
    .slice(0, limit) as ChunkMatch[];
}

export async function searchChunks(query: string, limit = 8): Promise<ChunkMatch[]> {
  const terms = searchTerms(query);
  const keywordPromise = keywordFallback(query, limit).catch((error) => {
    console.error("Keyword retrieval failed:", error);
    return [] as ChunkMatch[];
  });
  const vectorPromise = createEmbedding(query)
    .then((embedding) =>
      supabase.rpc("match_chunks", {
        query_embedding: `[${embedding.join(",")}]`,
        match_count: limit,
        similarity_threshold: 0.38,
      }),
    )
    .then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []) as ChunkMatch[];
    })
    .catch((error) => {
      console.error("Vector retrieval failed:", error);
      return [] as ChunkMatch[];
    });

  const [keywordMatches, vectorMatches] = await Promise.all([keywordPromise, vectorPromise]);

  const merged = new Map<string, ChunkMatch>();
  for (const chunk of keywordMatches) merged.set(chunk.id, chunk);
  for (const chunk of vectorMatches) {
    const existing = merged.get(chunk.id);
    merged.set(chunk.id, existing && (existing.similarity ?? 0) > (chunk.similarity ?? 0) ? existing : chunk);
  }

  return [...merged.values()]
    .map((chunk) => ({ chunk, score: rerankScore(chunk, terms) }))
    .sort((a, b) => {
      const scoreDifference = b.score - a.score;
      if (scoreDifference !== 0) return scoreDifference;
      const aRank = a.chunk.source_credibility_rank ?? 99;
      const bRank = b.chunk.source_credibility_rank ?? 99;
      return aRank - bRank;
    })
    .slice(0, limit)
    .map(({ chunk, score }) => ({ ...chunk, similarity: Math.max(0, Math.min(1, score)) }));
}
