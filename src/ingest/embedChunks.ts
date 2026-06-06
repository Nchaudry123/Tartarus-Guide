import { supabase, createEmbedding, embeddingToSqlVector } from "../db/client";
import type { SourceInput, SourceRecord, TextChunk } from "../types/schema";

const domainForUrl = (url: string): string => new URL(url).hostname.replace(/^www\./, "");

export async function upsertSource(source: SourceInput, pageTitle?: string): Promise<SourceRecord> {
  const { data, error } = await supabase
    .from("sources")
    .upsert(
      {
        title: pageTitle || source.title,
        url: source.url,
        domain: domainForUrl(source.url),
        category: source.category,
        source_type: source.sourceType ?? "guide",
        credibility_rank: source.credibilityRank ?? 50,
        last_checked: new Date().toISOString(),
      },
      { onConflict: "url" },
    )
    .select("id,title,url,domain,category,source_type,credibility_rank")
    .single();

  if (error) {
    throw error;
  }
  return data as SourceRecord;
}

export async function embedAndInsertChunks(
  chunks: TextChunk[],
  options: { sync?: boolean } = {},
): Promise<{ inserted: number; deleted: number }> {
  let inserted = 0;
  let deleted = 0;
  let processed = 0;
  const chunksBySource = new Map<string, TextChunk[]>();
  for (const chunk of chunks) {
    const sourceChunks = chunksBySource.get(chunk.source.url) ?? [];
    sourceChunks.push(chunk);
    chunksBySource.set(chunk.source.url, sourceChunks);
  }

  for (const sourceChunks of chunksBySource.values()) {
    const first = sourceChunks[0];
    const source = await upsertSource(first.source, first.pageTitle);
    const { data: existing, error: existingError } = await supabase
      .from("chunks")
      .select("id,chunk_hash")
      .eq("source_id", source.id);
    if (existingError) throw existingError;

    const existingByHash = new Map((existing ?? []).map((row) => [row.chunk_hash, row.id]));
    for (const chunk of sourceChunks) {
      if (!existingByHash.has(chunk.hash)) {
        const embedding = await createEmbedding(chunk.text);
        const { error } = await supabase.from("chunks").insert({
          source_id: source.id,
          section_title: chunk.sectionTitle,
          chunk_text: chunk.text,
          chunk_hash: chunk.hash,
          token_count: chunk.tokenCount,
          embedding: embeddingToSqlVector(embedding),
        });
        if (error) throw error;
        inserted += 1;
      }
      processed += 1;
      if (processed % 25 === 0 || processed === chunks.length) {
        console.log(`Chunk sync progress: ${processed}/${chunks.length}, ${inserted} embedded.`);
      }
    }

    if (options.sync) {
      const currentHashes = new Set(sourceChunks.map((chunk) => chunk.hash));
      const staleIds = (existing ?? [])
        .filter((row) => !currentHashes.has(row.chunk_hash))
        .map((row) => row.id);
      if (staleIds.length > 0) {
        const { error } = await supabase.from("chunks").delete().in("id", staleIds);
        if (error) throw error;
        deleted += staleIds.length;
      }
    }
  }

  return { inserted, deleted };
}
