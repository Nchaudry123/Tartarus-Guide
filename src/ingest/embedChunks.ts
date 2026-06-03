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

export async function embedAndInsertChunks(chunks: TextChunk[]): Promise<number> {
  let inserted = 0;
  const sourceByUrl = new Map<string, SourceRecord>();

  for (const chunk of chunks) {
    let source = sourceByUrl.get(chunk.source.url);
    if (!source) {
      source = await upsertSource(chunk.source, chunk.pageTitle);
      sourceByUrl.set(chunk.source.url, source);
    }

    const { data: existing, error: existingError } = await supabase
      .from("chunks")
      .select("id")
      .eq("chunk_hash", chunk.hash)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }
    if (existing) {
      continue;
    }

    const embedding = await createEmbedding(chunk.text);
    const { error } = await supabase.from("chunks").insert({
      source_id: source.id,
      section_title: chunk.sectionTitle,
      chunk_text: chunk.text,
      chunk_hash: chunk.hash,
      token_count: chunk.tokenCount,
      embedding: embeddingToSqlVector(embedding),
    });

    if (error) {
      throw error;
    }
    inserted += 1;
  }

  return inserted;
}
