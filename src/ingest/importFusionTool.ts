import { createHash } from "node:crypto";
import { normalizeName, supabase } from "../db/client";
import type { EntityType, FactType, SourceInput, TextChunk } from "../types/schema";
import { embedAndInsertChunks, upsertSource } from "./embedChunks";

const DEFAULT_REVISION = "13939cf97a3b236d3ae044e12ac532d1f6e58ddc";
const DATASET_PAGE = "https://aqiu384.github.io/megaten-fusion-tool/p3r/personas";
const RAW_ROOT = "https://raw.githubusercontent.com/aqiu384/megaten-fusion-tool";
const DATA_PATH = "src/app/p3r/data";
const BATCH_SIZE = 250;

type PersonaData = {
  heart?: string;
  heartlvl?: number;
  inherits: string;
  lvl: number;
  race: string;
  resists: string;
  skills: Record<string, number>;
  stats: number[];
  steps?: number[];
};

type FusionChart = {
  races: string[];
  table: string[][];
};

type UnlockGroup = {
  category: string;
  unlocked: boolean;
  conditions: Record<string, string>;
};

type SkillRow = {
  a: [string, string, string];
  b: number[];
  c: string[];
};

type EntityRow = {
  id: string;
  name: string;
  type: EntityType;
  normalized_name: string;
};

type PendingFact = {
  entityName: string;
  entityType: EntityType;
  factType: FactType;
  value: string;
  confidence: number;
  notes: string | null;
};

const sourceInput: SourceInput = {
  title: "Persona 3 Reload Fusion Calculator Dataset",
  url: DATASET_PAGE,
  category: "fusion",
  sourceType: "calculator_dataset",
  credibilityRank: 5,
};

const affinityElements = [
  "Slash",
  "Strike",
  "Pierce",
  "Fire",
  "Ice",
  "Electric",
  "Wind",
  "Light",
  "Dark",
  "Almighty",
] as const;

const affinityFactTypes: Partial<Record<string, FactType>> = {
  w: "weakness",
  s: "resistance",
  n: "nullifies",
  r: "repels",
  d: "drains",
};

const inheritanceLabels: Record<string, string> = {
  none: "No inheritance",
  strikeA: "Strike affinity",
  pierceA: "Pierce affinity",
  slashA: "Slash affinity",
  iceA: "Ice affinity",
  fireA: "Fire affinity",
  windA: "Wind affinity",
  elecA: "Electric affinity",
  darkA: "Dark affinity",
  lightA: "Light affinity",
  iceD: "Ice and Dark affinity",
  fireD: "Fire and Dark affinity",
  windD: "Wind and Dark affinity",
  elecD: "Electric and Dark affinity",
  iceL: "Ice and Light affinity",
  fireL: "Fire and Light affinity",
  windL: "Wind and Light affinity",
  elecL: "Electric and Light affinity",
  strikeB: "Strike-focused inheritance",
  pierceB: "Pierce-focused inheritance",
  fireB: "Fire-focused inheritance",
  iceB: "Ice-focused inheritance",
  elecB: "Electric-focused inheritance",
  windB: "Wind-focused inheritance",
  lightB: "Light-focused inheritance",
  darkB: "Dark-focused inheritance",
  slashB: "Slash-focused inheritance",
  lidarkA: "Light and Dark affinity",
  lidarkB: "Light and Dark focused inheritance",
  ailment: "Ailment affinity",
  recovery: "Recovery affinity",
  almighty: "Almighty affinity",
};

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
    embedSummaries: args.has("--embed-summaries"),
    revision:
      process.argv.find((arg) => arg.startsWith("--revision="))?.slice("--revision=".length) ||
      process.env.FUSION_DATA_REVISION ||
      DEFAULT_REVISION,
  };
}

async function fetchJson<T>(revision: string, fileName: string): Promise<T> {
  const url = `${RAW_ROOT}/${revision}/${DATA_PATH}/${fileName}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": process.env.INGEST_USER_AGENT ?? "TartarusGuideRAG/0.1",
    },
  });
  if (!response.ok) {
    throw new Error(`Fusion dataset request failed for ${fileName}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function pairKey(name1: string, name2: string): string {
  return [name1, name2].sort((a, b) => a.localeCompare(b)).join("\u0000");
}

function chartResult(chart: FusionChart, race1: string, race2: string): string | null {
  const index1 = chart.races.indexOf(race1);
  const index2 = chart.races.indexOf(race2);
  if (index1 < 0 || index2 < 0) return null;
  const row = Math.max(index1, index2);
  const column = Math.min(index1, index2);
  const result = chart.table[row]?.[column];
  return result && result !== "-" ? result : null;
}

function normalFusionResult(
  name1: string,
  name2: string,
  personas: Record<string, PersonaData>,
  chart: FusionChart,
  resultNamesByRace: Map<string, string[]>,
): string | null {
  const persona1 = personas[name1];
  const persona2 = personas[name2];
  if (!persona1 || !persona2 || name1 === name2) return null;

  if (persona1.race === persona2.race) {
    const threshold = (persona1.lvl + persona2.lvl) / 2 + 1;
    const candidates = (resultNamesByRace.get(persona1.race) ?? [])
      .filter((name) => name !== name1 && name !== name2)
      .filter((name) => personas[name].lvl <= threshold);
    return candidates.at(-1) ?? null;
  }

  const resultRace = chartResult(chart, persona1.race, persona2.race);
  if (!resultRace) return null;
  const threshold = (persona1.lvl + persona2.lvl + 1) / 2;
  const candidates = (resultNamesByRace.get(resultRace) ?? []).filter(
    (name) => name !== name1 && name !== name2,
  );
  return candidates.find((name) => personas[name].lvl >= threshold) ?? candidates.at(-1) ?? null;
}

function addFact(
  facts: PendingFact[],
  entityName: string,
  entityType: EntityType,
  factType: FactType,
  value: string | undefined,
  notes: string | null,
  confidence = 1,
) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  facts.push({ entityName, entityType, factType, value: trimmed, confidence, notes });
}

function buildFacts(
  personas: Record<string, PersonaData>,
  skills: Record<string, SkillRow>,
  unlockGroups: UnlockGroup[],
  chart: FusionChart,
  specialRecipes: Record<string, string[]>,
  revision: string,
): PendingFact[] {
  const facts: PendingFact[] = [];
  const specialNames = new Set(Object.keys(specialRecipes));
  const resultNamesByRace = new Map<string, string[]>();

  for (const [name, persona] of Object.entries(personas)) {
    if (!specialNames.has(name)) {
      const names = resultNamesByRace.get(persona.race) ?? [];
      names.push(name);
      resultNamesByRace.set(persona.race, names);
    }
  }
  for (const names of resultNamesByRace.values()) {
    names.sort((a, b) => personas[a].lvl - personas[b].lvl || a.localeCompare(b));
  }

  const datasetNote = `Structured data from the Persona 3 Reload fusion calculator, revision ${revision}.`;
  for (const [name, persona] of Object.entries(personas)) {
    addFact(facts, name, "persona", "base_level", String(persona.lvl), datasetNote);
    addFact(facts, name, "persona", "arcana", persona.race, datasetNote);
    addFact(
      facts,
      name,
      "persona",
      "tip",
      `Base stats: St ${persona.stats[0]}, Ma ${persona.stats[1]}, En ${persona.stats[2]}, Ag ${persona.stats[3]}, Lu ${persona.stats[4]}`,
      datasetNote,
    );
    addFact(
      facts,
      name,
      "persona",
      "tip",
      `Inheritance: ${inheritanceLabels[persona.inherits] ?? persona.inherits}`,
      datasetNote,
    );

    const initialSkills = Object.entries(persona.skills)
      .filter(([, level]) => level > 0 && level < 1)
      .sort(([, a], [, b]) => a - b)
      .map(([skill]) => skill);
    const learnedSkills = Object.entries(persona.skills)
      .filter(([, level]) => Number.isInteger(level) && level < 1000)
      .sort(([, a], [, b]) => a - b)
      .map(([skill, level]) => `${skill} (Lv. ${level})`);
    addFact(
      facts,
      name,
      "persona",
      "tip",
      initialSkills.length ? `Initial skills: ${initialSkills.join(", ")}` : undefined,
      datasetNote,
    );
    addFact(
      facts,
      name,
      "persona",
      "tip",
      learnedSkills.length ? `Learned skills: ${learnedSkills.join(", ")}` : undefined,
      datasetNote,
    );

    [...persona.resists].forEach((code, index) => {
      const factType = affinityFactTypes[code];
      const element = affinityElements[index];
      if (factType && element) addFact(facts, name, "persona", factType, element, datasetNote);
    });

    if (persona.heart) {
      addFact(
        facts,
        name,
        "persona",
        "item_effect",
        `${persona.heart}${persona.heartlvl ? ` (Heart Item at Lv. ${persona.heartlvl})` : ""}`,
        datasetNote,
      );
    }
  }

  for (const group of unlockGroups) {
    if (!group.unlocked) continue;
    for (const [name, condition] of Object.entries(group.conditions)) {
      if (personas[name]) {
        addFact(facts, name, "persona", "unlock_condition", condition, group.category);
      }
    }
  }

  for (const row of Object.values(skills)) {
    const [name, element, target] = row.a;
    if (!name || name === "-") continue;
    const descriptors = [
      element && element !== "-" ? `Element: ${element}` : undefined,
      target && target !== "-" ? `Target: ${target}` : undefined,
      row.c?.[0] && row.c[0] !== "-" ? `Effect: ${row.c[0]}` : undefined,
    ].filter(Boolean);
    addFact(facts, name, "skill", "item_effect", descriptors.join("; "), datasetNote);
  }

  const specialPairResults = new Map<string, string>();
  for (const [result, ingredients] of Object.entries(specialRecipes)) {
    addFact(
      facts,
      result,
      "persona",
      "fusion_recipe",
      ingredients.join(" + "),
      `Special fusion recipe. ${datasetNote}`,
    );
    if (ingredients.length === 2) {
      specialPairResults.set(pairKey(ingredients[0], ingredients[1]), result);
    }
  }

  const names = Object.keys(personas);
  for (let index1 = 0; index1 < names.length; index1 += 1) {
    for (let index2 = index1 + 1; index2 < names.length; index2 += 1) {
      const name1 = names[index1];
      const name2 = names[index2];
      if (specialPairResults.has(pairKey(name1, name2))) continue;
      const result = normalFusionResult(name1, name2, personas, chart, resultNamesByRace);
      if (result) {
        addFact(
          facts,
          result,
          "persona",
          "fusion_recipe",
          `${name1} + ${name2}`,
          `Normal fusion recipe computed from the source fusion chart. ${datasetNote}`,
        );
      }
    }
  }

  const unique = new Map<string, PendingFact>();
  for (const fact of facts) {
    unique.set(
      `${fact.entityType}\u0000${normalizeName(fact.entityName)}\u0000${fact.factType}\u0000${fact.value.toLowerCase()}`,
      fact,
    );
  }
  return [...unique.values()];
}

async function upsertEntities(facts: PendingFact[]): Promise<Map<string, EntityRow>> {
  const unique = new Map<string, { name: string; type: EntityType; aliases: string[]; normalized_name: string }>();
  for (const fact of facts) {
    const normalizedName = normalizeName(fact.entityName);
    unique.set(`${fact.entityType}\u0000${normalizedName}`, {
      name: fact.entityName,
      type: fact.entityType,
      aliases: [],
      normalized_name: normalizedName,
    });
  }

  const rows = [...unique.values()];
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const { error } = await supabase
      .from("entities")
      .upsert(rows.slice(index, index + BATCH_SIZE), { onConflict: "normalized_name,type" });
    if (error) throw error;
  }

  const entityMap = new Map<string, EntityRow>();
  for (const type of ["persona", "skill"] as const) {
    const { data, error } = await supabase
      .from("entities")
      .select("id,name,type,normalized_name")
      .eq("type", type)
      .limit(2000);
    if (error) throw error;
    for (const row of data ?? []) {
      entityMap.set(`${row.type}\u0000${row.normalized_name}`, row as EntityRow);
    }
  }
  return entityMap;
}

async function replaceFacts(
  facts: PendingFact[],
  sourceId: string,
  entityMap: Map<string, EntityRow>,
  supportsExtendedFactTypes: boolean,
): Promise<number> {
  const { error: deleteError } = await supabase.from("facts").delete().eq("source_id", sourceId);
  if (deleteError) throw deleteError;

  const rows = facts.map((fact) => {
    const key = `${fact.entityType}\u0000${normalizeName(fact.entityName)}`;
    const entity = entityMap.get(key);
    if (!entity) throw new Error(`Missing entity after upsert: ${fact.entityType} ${fact.entityName}`);
    const compatibilityValue =
      !supportsExtendedFactTypes && fact.factType === "arcana"
        ? `Arcana: ${fact.value}`
        : !supportsExtendedFactTypes && fact.factType === "base_level"
          ? `Base level: ${fact.value}`
          : fact.value;
    return {
      entity_id: entity.id,
      source_id: sourceId,
      fact_type:
        !supportsExtendedFactTypes &&
        (fact.factType === "arcana" || fact.factType === "base_level")
          ? "tip"
          : fact.factType,
      value: compatibilityValue,
      confidence: fact.confidence,
      notes: fact.notes,
    };
  });

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const { error } = await supabase.from("facts").insert(rows.slice(index, index + BATCH_SIZE));
    if (error) throw error;
    const completed = Math.min(index + BATCH_SIZE, rows.length);
    if (completed % 2500 === 0 || completed === rows.length) {
      console.log(`Fusion fact import progress: ${completed}/${rows.length}`);
    }
  }
  return rows.length;
}

async function databaseSupportsExtendedFactTypes(
  sourceId: string,
  entityMap: Map<string, EntityRow>,
): Promise<boolean> {
  const entity = [...entityMap.values()].find((row) => row.type === "persona");
  if (!entity) throw new Error("Cannot test the facts schema without a Persona entity.");

  const probeValue = `schema-probe-${Date.now()}`;
  const { data, error } = await supabase
    .from("facts")
    .insert({
      entity_id: entity.id,
      source_id: sourceId,
      fact_type: "base_level",
      value: probeValue,
      confidence: 1,
      notes: "Temporary fusion importer schema probe.",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23514" && error.message.includes("facts_type_check")) {
      return false;
    }
    throw error;
  }

  const { error: deleteError } = await supabase.from("facts").delete().eq("id", data.id);
  if (deleteError) throw deleteError;
  return true;
}

function summaryChunks(
  personas: Record<string, PersonaData>,
  specialRecipes: Record<string, string[]>,
): TextChunk[] {
  const byRace = new Map<string, string[]>();
  for (const [name, persona] of Object.entries(personas)) {
    const entries = byRace.get(persona.race) ?? [];
    entries.push(
      `${name} (base level ${persona.lvl}; skills: ${Object.keys(persona.skills).join(", ")}; affinities: ${persona.resists})`,
    );
    byRace.set(persona.race, entries);
  }

  const chunks: TextChunk[] = [];
  for (const [race, entries] of byRace) {
    const text = `${race} Arcana Persona records:\n${entries.join("\n")}`;
    chunks.push({
      source: sourceInput,
      pageTitle: sourceInput.title,
      sectionTitle: `${race} Arcana`,
      text,
      tokenCount: Math.ceil(text.length / 4),
      hash: createHash("sha256").update(`fusion-tool:${race}:${text}`).digest("hex"),
    });
  }
  const specialText = `Special fusion recipes:\n${Object.entries(specialRecipes)
    .map(([result, ingredients]) => `${result}: ${ingredients.join(" + ")}`)
    .join("\n")}`;
  chunks.push({
    source: sourceInput,
    pageTitle: sourceInput.title,
    sectionTitle: "Special Fusion Recipes",
    text: specialText,
    tokenCount: Math.ceil(specialText.length / 4),
    hash: createHash("sha256").update(`fusion-tool:special:${specialText}`).digest("hex"),
  });
  return chunks;
}

async function main() {
  const options = parseArgs();
  console.log(`Loading Persona 3 Reload fusion data at revision ${options.revision}...`);
  const [personas, skills, unlockGroups, chart, specialRecipes] = await Promise.all([
    fetchJson<Record<string, PersonaData>>(options.revision, "demon-data.json"),
    fetchJson<Record<string, SkillRow>>(options.revision, "skill-data.json"),
    fetchJson<UnlockGroup[]>(options.revision, "demon-unlocks.json"),
    fetchJson<FusionChart>(options.revision, "fusion-chart.json"),
    fetchJson<Record<string, string[]>>(options.revision, "special-recipes.json"),
  ]);

  const facts = buildFacts(personas, skills, unlockGroups, chart, specialRecipes, options.revision);
  const recipeCount = facts.filter((fact) => fact.factType === "fusion_recipe").length;
  console.log(
    `Prepared ${Object.keys(personas).length} Personas, ${Object.keys(skills).length} skills, ` +
      `${recipeCount} recipes, and ${facts.length} total facts.`,
  );
  if (options.dryRun) return;

  const source = await upsertSource(sourceInput, sourceInput.title);
  const entityMap = await upsertEntities(facts);
  const supportsExtendedFactTypes = await databaseSupportsExtendedFactTypes(
    source.id,
    entityMap,
  );
  if (!supportsExtendedFactTypes) {
    console.warn(
      "The database has the legacy facts_type_check constraint. Arcana and base-level facts will be stored as labeled tips until migration 004 is applied.",
    );
  }
  const inserted = await replaceFacts(
    facts,
    source.id,
    entityMap,
    supportsExtendedFactTypes,
  );

  if (options.embedSummaries) {
    const chunks = summaryChunks(personas, specialRecipes);
    const result = await embedAndInsertChunks(chunks, { sync: true });
    console.log(`Embedded ${result.inserted} fusion summary chunks; removed ${result.deleted} stale chunks.`);
  }

  console.log(`Fusion import complete: ${inserted} facts stored from ${DATASET_PAGE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
