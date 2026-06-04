import { createEmbedding, supabase } from "../db/client";
import type { ChunkMatch } from "../types/schema";

function searchTerms(query: string): string[] {
  const stopWords = new Set([
    "about",
    "answer",
    "beat",
    "does",
    "enemy",
    "guide",
    "help",
    "persona",
    "reload",
    "strategy",
    "weak",
    "weakness",
    "what",
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

  return [...new Set([...phrases, ...unique])].slice(0, 5);
}

async function keywordFallback(query: string, limit: number): Promise<ChunkMatch[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];

  const filters = terms.flatMap((term) => [
    `chunk_text.ilike.%${term}%`,
    `section_title.ilike.%${term}%`,
  ]);

  const { data, error } = await supabase
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
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => {
    const item = row as Record<string, any>;
    const source = Array.isArray(item.sources) ? item.sources[0] : item.sources;
    return {
      id: item.id,
      source_id: item.source_id,
      section_title: item.section_title,
      chunk_text: item.chunk_text,
      token_count: item.token_count,
      similarity: 0.45,
      source_title: source.title,
      source_url: source.url,
      source_domain: source.domain,
      source_credibility_rank: source.credibility_rank,
    };
  }) as ChunkMatch[];
}

export async function searchChunks(query: string, limit = 8): Promise<ChunkMatch[]> {
  const embedding = await createEmbedding(query);
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: `[${embedding.join(",")}]`,
    match_count: limit,
    similarity_threshold: 0.45,
  });

  if (error) {
    throw error;
  }

  const chunks = (data ?? []) as ChunkMatch[];
  if (chunks.length) return chunks;

  return keywordFallback(query, limit);
}
