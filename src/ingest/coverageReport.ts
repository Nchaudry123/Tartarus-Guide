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

type ChunkRow = {
  source_id: string;
  embedding: number[] | null;
};

type FactRow = {
  source_id: string;
  entity_id: string;
  fact_type: string;
  confidence: number;
};

type EntityRow = {
  id: string;
  name: string;
  type: string;
};

type CoverageArea = {
  id: string;
  label: string;
  sourceMatches: (source: SourceRow) => boolean;
  entityTypes: string[];
};

const coverageAreas: CoverageArea[] = [
  {
    id: "enemies",
    label: "Enemies",
    sourceMatches: (source) => source.category === "enemies",
    entityTypes: ["enemy"],
  },
  {
    id: "bosses",
    label: "Bosses",
    sourceMatches: (source) => source.category === "bosses",
    entityTypes: ["boss"],
  },
  {
    id: "social_links",
    label: "Social Links",
    sourceMatches: (source) => source.category === "social_links",
    entityTypes: ["social_link"],
  },
  {
    id: "requests",
    label: "Requests",
    sourceMatches: (source) => source.category === "requests",
    entityTypes: ["request"],
  },
  {
    id: "calendars",
    label: "Calendars",
    sourceMatches: (source) =>
      source.category === "walkthrough" ||
      source.category === "classroom" ||
      /\b(calendar|classroom|exam|schedule|month|daily)\b/i.test(`${source.title} ${source.url}`),
    entityTypes: ["activity"],
  },
  {
    id: "tartarus",
    label: "Tartarus",
    sourceMatches: (source) => source.category === "tartarus",
    entityTypes: ["tartarus_floor", "location"],
  },
  {
    id: "personas",
    label: "Personas",
    sourceMatches: (source) => source.category === "personas" || source.category === "fusion",
    entityTypes: ["persona", "skill"],
  },
];

const PAGE_SIZE = 1_000;

async function fetchAllRows<T extends Record<string, unknown>>(
  table: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCounts(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function main(): Promise<void> {
  const [sources, chunks, facts, entities] = await Promise.all([
    fetchAllRows<SourceRow>("sources", "id,title,url,domain,category"),
    fetchAllRows<ChunkRow>("chunks", "source_id,embedding"),
    fetchAllRows<FactRow>("facts", "source_id,entity_id,fact_type,confidence"),
    fetchAllRows<EntityRow>("entities", "id,name,type"),
  ]);

  const chunksBySource = new Map<string, number>();
  const embeddedChunksBySource = new Map<string, number>();
  const factsBySource = new Map<string, number>();
  const entityIdsBySource = new Map<string, Set<string>>();
  const factTypesBySource = new Map<string, Map<string, number>>();
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));

  for (const chunk of chunks) {
    increment(chunksBySource, chunk.source_id);
    if (chunk.embedding) increment(embeddedChunksBySource, chunk.source_id);
  }
  for (const fact of facts) {
    increment(factsBySource, fact.source_id);
    const entityIds = entityIdsBySource.get(fact.source_id) ?? new Set<string>();
    entityIds.add(fact.entity_id);
    entityIdsBySource.set(fact.source_id, entityIds);
    const factTypes = factTypesBySource.get(fact.source_id) ?? new Map<string, number>();
    increment(factTypes, fact.fact_type);
    factTypesBySource.set(fact.source_id, factTypes);
  }

  const areas = coverageAreas.map((area) => {
    const areaSources = sources.filter(area.sourceMatches);
    const sourceIds = new Set(areaSources.map((source) => source.id));
    const areaFacts = facts.filter((fact) => sourceIds.has(fact.source_id));
    const entityIds = new Set(areaFacts.map((fact) => fact.entity_id));
    const factTypes = new Map<string, number>();
    const domains = new Map<string, number>();
    for (const source of areaSources) increment(domains, source.domain);
    for (const fact of areaFacts) increment(factTypes, fact.fact_type);

    const typedEntities = entities.filter((entity) => area.entityTypes.includes(entity.type));
    return {
      id: area.id,
      label: area.label,
      sources: areaSources.length,
      chunks: areaSources.reduce((sum, source) => sum + (chunksBySource.get(source.id) ?? 0), 0),
      embeddedChunks: areaSources.reduce(
        (sum, source) => sum + (embeddedChunksBySource.get(source.id) ?? 0),
        0,
      ),
      facts: areaFacts.length,
      sourcedEntities: entityIds.size,
      totalTypedEntities: typedEntities.length,
      domains: sortedCounts(domains),
      factTypes: sortedCounts(factTypes),
      sourcesWithoutChunks: areaSources
        .filter((source) => !chunksBySource.get(source.id))
        .map(({ title, url, domain }) => ({ title, url, domain })),
      sourcesWithoutFacts: areaSources
        .filter((source) => !factsBySource.get(source.id))
        .map(({ title, url, domain }) => ({ title, url, domain })),
    };
  });

  const globalFactTypes = new Map<string, number>();
  const globalEntityTypes = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  for (const fact of facts) increment(globalFactTypes, fact.fact_type);
  for (const entity of entities) increment(globalEntityTypes, entity.type);
  for (const source of sources) increment(domainCounts, source.domain);

  const report = {
    generatedAt: new Date().toISOString(),
    pagination: { pageSize: PAGE_SIZE, completeTableReads: true },
    totals: {
      sources: sources.length,
      chunks: chunks.length,
      embeddedChunks: chunks.filter((chunk) => chunk.embedding).length,
      entities: entities.length,
      facts: facts.length,
      domains: sortedCounts(domainCounts),
      entityTypes: sortedCounts(globalEntityTypes),
      factTypes: sortedCounts(globalFactTypes),
    },
    areas,
    sourceHealth: {
      emptySources: sources
        .filter((source) => !chunksBySource.get(source.id))
        .map(({ title, url, category, domain }) => ({ title, url, category, domain })),
      sourcesWithoutFacts: sources
        .filter((source) => !factsBySource.get(source.id))
        .map(({ title, url, category, domain }) => ({ title, url, category, domain })),
      sourcesWithFacts: sources
        .filter((source) => factsBySource.get(source.id))
        .map((source) => ({
          title: source.title,
          url: source.url,
          category: source.category,
          domain: source.domain,
          chunks: chunksBySource.get(source.id) ?? 0,
          facts: factsBySource.get(source.id) ?? 0,
          entities: entityIdsBySource.get(source.id)?.size ?? 0,
          factTypes: sortedCounts(factTypesBySource.get(source.id) ?? new Map()),
        })),
    },
    orphanFacts: facts
      .filter((fact) => !entitiesById.has(fact.entity_id))
      .map((fact) => ({ sourceId: fact.source_id, entityId: fact.entity_id, factType: fact.fact_type })),
  };

  await mkdir("evals/results", { recursive: true });
  await writeFile("evals/results/coverage-latest.json", JSON.stringify(report, null, 2));

  console.log(
    `Coverage audit: ${report.totals.sources} sources, ${report.totals.chunks} chunks, ` +
      `${report.totals.entities} entities, ${report.totals.facts} facts.`,
  );
  console.log(`Embedded chunks: ${report.totals.embeddedChunks}/${report.totals.chunks}\n`);
  for (const area of areas) {
    const domainSummary = Object.entries(area.domains)
      .map(([domain, count]) => `${domain}=${count}`)
      .join(", ");
    console.log(
      `${area.label.padEnd(14)} sources=${String(area.sources).padStart(3)} ` +
        `chunks=${String(area.chunks).padStart(4)} facts=${String(area.facts).padStart(4)} ` +
        `entities=${String(area.sourcedEntities).padStart(4)} domains=[${domainSummary}]`,
    );
  }
  console.log(`\nReport written to evals/results/coverage-latest.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
