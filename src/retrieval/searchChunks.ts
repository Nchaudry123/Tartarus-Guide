import { createEmbedding, supabase } from "../db/client";
import type { ChunkMatch } from "../types/schema";

export async function searchChunks(query: string, limit = 8): Promise<ChunkMatch[]> {
  const embedding = await createEmbedding(query);
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: `[${embedding.join(",")}]`,
    match_count: limit,
    similarity_threshold: 0.55,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as ChunkMatch[];
}
