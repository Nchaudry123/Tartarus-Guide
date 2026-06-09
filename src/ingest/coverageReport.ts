import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { supabase } from "../db/client";

type SourceRow = {
  id: string;
  title: string;
  url: string;
  domain: string;
  category: string;
};

const requiredCategories = [
  "enemies",
  "bosses",
  "social_links",
  "requests",
  "fusion",
  "personas",
  "tartarus",
  "walkthrough",
  "classroom",
  "beginner_strategy",
];

const minimumFactsByCategory: Record<string, number> = {
  enemies: 12,
  bosses: 12,
  social_links: 12,
  requests: 10,
  fusion: 10,
  personas: 8,
  tartarus: 8,
  walkthrough: 6,
  classroom: 8,
  beginner_strategy: 0,
};

const minimumSourcesByCategory: Record<string, number> = {
  classroom: 2,
};

async function main(): Promise<void> {
  const [{ data: sources, error: sourceError }, { data: chunks, error: chunkError }, { data: facts, error: factError }] =
    await Promise.all([
      supabase.from("sources").select("id,title,url,domain,category"),
      supabase.from("chunks").select("source_id"),
      supabase.from("facts").select("source_id,fact_type,entity:entities(name,type)"),
    ]);
  if (sourceError) throw sourceError;
  if (chunkError) throw chunkError;
  if (factError) throw factError;

  const sourceRows = (sources ?? []) as SourceRow[];
  const chunksBySource = new Map<string, number>();
  const factsBySource = new Map<string, number>();
  for (const chunk of chunks ?? []) chunksBySource.set(chunk.source_id, (chunksBySource.get(chunk.source_id) ?? 0) + 1);
  for (const fact of facts ?? []) factsBySource.set(fact.source_id, (factsBySource.get(fact.source_id) ?? 0) + 1);

  const groups = new Map<string, { sources: number; chunks: number; facts: number }>();
  for (const source of sourceRows) {
    const key = `${source.domain}:${source.category}`;
    const group = groups.get(key) ?? { sources: 0, chunks: 0, facts: 0 };
    group.sources += 1;
    group.chunks += chunksBySource.get(source.id) ?? 0;
    group.facts += factsBySource.get(source.id) ?? 0;
    groups.set(key, group);
  }

  const categories = requiredCategories.map((category) => {
    const matching = [...groups.entries()].filter(([key]) => key.endsWith(`:${category}`));
    const totals = matching.reduce(
      (sum, [, value]) => ({
        sources: sum.sources + value.sources,
        chunks: sum.chunks + value.chunks,
        facts: sum.facts + value.facts,
      }),
      { sources: 0, chunks: 0, facts: 0 },
    );
    const domains = Object.fromEntries(matching.map(([key, value]) => [key.split(":")[0], value]));
    return {
      category,
      ...totals,
      domains,
      healthy:
        totals.sources >= (minimumSourcesByCategory[category] ?? 4) &&
        totals.chunks >= 12 &&
        totals.facts >= (minimumFactsByCategory[category] ?? 0),
      minimumFacts: minimumFactsByCategory[category] ?? 0,
    };
  });

  const emptySources = sourceRows
    .filter((source) => (chunksBySource.get(source.id) ?? 0) === 0)
    .map((source) => ({ title: source.title, url: source.url, category: source.category }));
  const noFactSources = sourceRows
    .filter((source) => (factsBySource.get(source.id) ?? 0) === 0)
    .map((source) => ({ title: source.title, url: source.url, category: source.category }));
  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      sources: sourceRows.length,
      chunks: chunks?.length ?? 0,
      facts: facts?.length ?? 0,
      domains: Object.fromEntries(
        [...new Set(sourceRows.map((source) => source.domain))].map((domain) => [
          domain,
          sourceRows.filter((source) => source.domain === domain).length,
        ]),
      ),
    },
    categories,
    gaps: categories.filter((category) => !category.healthy).map((category) => category.category),
    emptySources,
    noFactSources,
  };

  await mkdir("evals/results", { recursive: true });
  await writeFile("evals/results/coverage-latest.json", JSON.stringify(report, null, 2));

  console.log(`Coverage: ${report.totals.sources} sources, ${report.totals.chunks} chunks, ${report.totals.facts} facts.`);
  for (const category of categories) {
    console.log(
      `${category.healthy ? "OK " : "GAP"} ${category.category.padEnd(20)} sources=${String(category.sources).padStart(3)} chunks=${String(category.chunks).padStart(4)} facts=${String(category.facts).padStart(4)}/${String(category.minimumFacts).padEnd(3)}`,
    );
  }
  if (report.gaps.length) {
    console.log(`\nCoverage gaps: ${report.gaps.join(", ")}`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
