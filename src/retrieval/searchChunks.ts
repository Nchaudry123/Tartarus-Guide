import { createEmbedding, supabase } from "../db/client.js";
import type { ChunkMatch } from "../types/schema.js";

export async function searchChunks(query: string, limit = 8): Promise<ChunkMatch[]> {
  const embedding = await createEmbedding(query);
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: `[${embedding.join(",")}]`,
    match_count: limit,
    similarity_threshold: 0.68,
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as ChunkMatch[];
}
