import { createEmbedding, supabase } from "../db/client";
import type { ChunkMatch } from "../types/schema";
import {
  analyzeRetrievalQuery,
  isClearlyWrongCategory,
  isRetrievalBoilerplate,
  lexicalCoverage,
  matchesPrimarySubject,
  type RetrievalQueryAnalysis,
} from "./queryAnalysis";

function escapePostgrestPattern(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function rerankScore(
  chunk: ChunkMatch,
  analysis: RetrievalQueryAnalysis,
  reciprocalRankScore: number,
): number {
  const title = chunk.source_title.toLowerCase();
  const section = (chunk.section_title ?? "").toLowerCase();
  const text = chunk.chunk_text.toLowerCase();
  const haystack = `${title} ${section} ${text}`;
  const termHits = analysis.expandedTerms.filter((term) => haystack.includes(term)).length;
  const headingHits = analysis.expandedTerms.filter((term) => `${title} ${section}`.includes(term)).length;
  const exactPhraseHits = analysis.phrases.filter((phrase) => haystack.includes(phrase)).length;
  const exactHeadingEntity = analysis.entityCandidates.some(
    (entity) => entity.includes(" ") && `${title} ${section}`.includes(entity),
  );
  const coverage = lexicalCoverage(haystack, analysis);

  let penalty = 0;
  if (isRetrievalBoilerplate(`${title} ${section} ${text}`)) penalty += 0.45;
  if (termHits === 0) penalty += 0.25;
  if (chunk.chunk_text.length > 9_000) penalty += 0.08;
  if (analysis.floor && !new RegExp(`\\b${analysis.floor}\\b`).test(haystack)) penalty += 0.06;

  return (
    reciprocalRankScore +
    (chunk.similarity ?? 0) * 0.42 +
    coverage * 0.18 +
    Math.min(0.12, termHits * 0.025) +
    Math.min(0.14, headingHits * 0.045) +
    Math.min(0.2, exactPhraseHits * 0.1) +
    (exactHeadingEntity ? 0.2 : 0) -
    penalty
  );
}

async function keywordFallback(
  query: string,
  limit: number,
  analysis = analyzeRetrievalQuery(query),
): Promise<ChunkMatch[]> {
  const terms = [...analysis.phrases, ...analysis.expandedTerms].slice(0, 12);
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

export async function searchChunks(
  query: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<ChunkMatch[]> {
  signal?.throwIfAborted();
  const analysis = analyzeRetrievalQuery(query);
  const keywordPromise = keywordFallback(query, limit * 2, analysis).catch((error) => {
    console.error("Keyword retrieval failed:", error);
    return [] as ChunkMatch[];
  });
  const vectorPromise = createEmbedding(query, signal)
    .then((embedding) => {
      let request = supabase.rpc("match_chunks", {
        query_embedding: `[${embedding.join(",")}]`,
        match_count: limit * 2,
        similarity_threshold: 0.34,
      });
      if (signal) request = request.abortSignal(signal);
      return request;
    })
    .then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []) as ChunkMatch[];
    })
    .catch((error) => {
      if (signal?.aborted) throw error;
      console.error("Vector retrieval failed:", error);
      return [] as ChunkMatch[];
    });

  const [keywordMatches, vectorMatches] = await Promise.all([keywordPromise, vectorPromise]);

  const merged = new Map<string, { chunk: ChunkMatch; reciprocalRankScore: number }>();
  const addRanked = (chunks: ChunkMatch[], weight: number) => {
    chunks.forEach((chunk, index) => {
      const rankScore = weight / (60 + index + 1);
      const existing = merged.get(chunk.id);
      const preferred =
        existing && (existing.chunk.similarity ?? 0) > (chunk.similarity ?? 0)
          ? existing.chunk
          : chunk;
      merged.set(chunk.id, {
        chunk: preferred,
        reciprocalRankScore: (existing?.reciprocalRankScore ?? 0) + rankScore,
      });
    });
  };
  addRanked(keywordMatches, 1.1);
  addRanked(vectorMatches, 1);

  const hasSpecificTerms = analysis.entityCandidates.length > 0;
  const ranked = [...merged.values()]
    .map(({ chunk, reciprocalRankScore }) => ({
      chunk,
      score: rerankScore(chunk, analysis, reciprocalRankScore),
      coverage: lexicalCoverage(
        `${chunk.source_title} ${chunk.section_title ?? ""} ${chunk.chunk_text}`,
        analysis,
      ),
    }))
    .filter(({ chunk, score, coverage }) => {
      if (isRetrievalBoilerplate(chunk.chunk_text)) return false;
      if (
        isClearlyWrongCategory(
          `${chunk.source_title} ${chunk.section_title ?? ""}`,
          analysis.category,
        )
      ) {
        return false;
      }
      if (
        ["enemy", "boss", "fusion", "social_link", "request"].includes(analysis.category) &&
        !matchesPrimarySubject(
          `${chunk.source_title} ${chunk.section_title ?? ""} ${chunk.chunk_text}`,
          analysis,
        )
      ) {
        return false;
      }
      if (!hasSpecificTerms) return score >= 0.16;
      return coverage > 0 || (chunk.similarity ?? 0) >= 0.48;
    })
    .sort((a, b) => {
      const scoreDifference = b.score - a.score;
      if (scoreDifference !== 0) return scoreDifference;
      const aRank = a.chunk.source_credibility_rank ?? 99;
      const bRank = b.chunk.source_credibility_rank ?? 99;
      return aRank - bRank;
    });

  if (!ranked.length) {
    return vectorMatches
      .filter(
        (chunk) =>
          !isRetrievalBoilerplate(chunk.chunk_text) &&
          !isClearlyWrongCategory(
            `${chunk.source_title} ${chunk.section_title ?? ""}`,
            analysis.category,
          ) &&
          matchesPrimarySubject(
            `${chunk.source_title} ${chunk.section_title ?? ""} ${chunk.chunk_text}`,
            analysis,
          ),
      )
      .slice(0, Math.min(limit, 3));
  }

  return ranked
    .slice(0, limit)
    .map(({ chunk, score }) => ({ ...chunk, similarity: Math.max(0, Math.min(1, score)) }));
}
