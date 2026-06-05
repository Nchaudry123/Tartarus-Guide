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
  const keywordMatches = await keywordFallback(query, limit);

  const embedding = await createEmbedding(query);
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: `[${embedding.join(",")}]`,
    match_count: limit,
    similarity_threshold: 0.38,
  });

  if (error) {
    throw error;
  }

  const merged = new Map<string, ChunkMatch>();
  for (const chunk of keywordMatches) merged.set(chunk.id, chunk);
  for (const chunk of ((data ?? []) as ChunkMatch[])) {
    const existing = merged.get(chunk.id);
    merged.set(chunk.id, existing && (existing.similarity ?? 0) > (chunk.similarity ?? 0) ? existing : chunk);
  }

  return [...merged.values()]
    .sort((a, b) => {
      const aRank = a.source_credibility_rank ?? 99;
      const bRank = b.source_credibility_rank ?? 99;
      return (b.similarity ?? 0) - (a.similarity ?? 0) || aRank - bRank;
    })
    .slice(0, limit);
}
