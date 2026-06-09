import "dotenv/config";
import { supabase } from "../db/client";
import type { SourceInput, TextChunk } from "../types/schema";
import { extractAndInsertFacts } from "./extractFacts";

const numberArg = (name: string, fallback: number): number => {
  const value = process.argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1];
  return value ? Number(value) : fallback;
};

const maxFactChunks = numberArg("--max-fact-chunks", 450);
const clearExisting = process.argv.includes("--clear-existing");
const categoriesArg = process.argv.find((arg) => arg.startsWith("--categories="))?.split("=")[1];
const categories = categoriesArg?.split(",").map((value) => value.trim()).filter(Boolean);
const pageSize = 500;

async function clearExistingFacts(): Promise<void> {
  const { error } = await supabase.from("facts").delete().not("id", "is", null);
  if (error) throw error;
  console.log("Cleared existing structured facts before rebuilding.");
}

async function loadExistingChunks(): Promise<TextChunk[]> {
  const result: TextChunk[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("chunks")
      .select(`
        chunk_text,
        chunk_hash,
        token_count,
        section_title,
        source:sources(title,url,category,source_type,credibility_rank)
      `)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const sourceRow = Array.isArray(row.source) ? row.source[0] : row.source;
      if (!sourceRow) continue;
      const source: SourceInput = {
        title: sourceRow.title,
        url: sourceRow.url,
        category: sourceRow.category,
        sourceType: sourceRow.source_type,
        credibilityRank: sourceRow.credibility_rank,
      };
      result.push({
        source,
        pageTitle: sourceRow.title,
        sectionTitle: row.section_title ?? sourceRow.title,
        text: row.chunk_text,
        tokenCount: row.token_count,
        hash: row.chunk_hash,
      });
    }
    if (data.length < pageSize) break;
  }
  return result;
}

async function main(): Promise<void> {
  if (clearExisting) await clearExistingFacts();
  const chunks = await loadExistingChunks();
  console.log(`Loaded ${chunks.length} existing chunks for selective fact backfill.`);
  const changed = await extractAndInsertFacts(chunks, { maxFactChunks, categories });
  console.log(`Facts backfill complete; ${changed} facts inserted or refreshed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
