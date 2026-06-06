import "dotenv/config";
import { supabase } from "../db/client";

async function count(table: string): Promise<number> {
  const { count: value, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return value ?? 0;
}

async function main(): Promise<void> {
  const [sourceCount, chunkCount, entityCount, factCount] = await Promise.all([
    count("sources"),
    count("chunks"),
    count("entities"),
    count("facts"),
  ]);
  const { data: sources, error: sourceError } = await supabase
    .from("sources")
    .select("id,title,url,domain,category");
  if (sourceError) throw sourceError;
  const { data: chunks, error: chunkError } = await supabase.from("chunks").select("source_id");
  if (chunkError) throw chunkError;
  const { data: facts, error: factError } = await supabase
    .from("facts")
    .select("fact_type,source_id,entity:entities(name,type)");
  if (factError) throw factError;

  const chunkCounts = new Map<string, number>();
  for (const chunk of chunks ?? []) {
    chunkCounts.set(chunk.source_id, (chunkCounts.get(chunk.source_id) ?? 0) + 1);
  }
  const factCounts = new Map<string, number>();
  const factTypes = new Map<string, number>();
  for (const fact of facts ?? []) {
    factCounts.set(fact.source_id, (factCounts.get(fact.source_id) ?? 0) + 1);
    factTypes.set(fact.fact_type, (factTypes.get(fact.fact_type) ?? 0) + 1);
  }

  console.log(`Index totals: ${sourceCount} sources, ${chunkCount} chunks, ${entityCount} entities, ${factCount} facts.`);
  console.log("\nCoverage by domain/category:");
  const groups = new Map<string, { sources: number; chunks: number; facts: number }>();
  for (const source of sources ?? []) {
    const key = `${source.domain} | ${source.category}`;
    const group = groups.get(key) ?? { sources: 0, chunks: 0, facts: 0 };
    group.sources += 1;
    group.chunks += chunkCounts.get(source.id) ?? 0;
    group.facts += factCounts.get(source.id) ?? 0;
    groups.set(key, group);
  }
  for (const [key, group] of [...groups].sort()) {
    console.log(`${key.padEnd(38)} sources=${String(group.sources).padStart(3)} chunks=${String(group.chunks).padStart(4)} facts=${String(group.facts).padStart(4)}`);
  }

  console.log("\nFact types:");
  for (const [type, value] of [...factTypes].sort((a, b) => b[1] - a[1])) {
    console.log(`${type.padEnd(22)} ${value}`);
  }

  const emptySources = (sources ?? [])
    .filter((source) => (chunkCounts.get(source.id) ?? 0) === 0)
    .slice(0, 20);
  if (emptySources.length) {
    console.log("\nSources with no chunks:");
    for (const source of emptySources) console.log(`- ${source.title}: ${source.url}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
