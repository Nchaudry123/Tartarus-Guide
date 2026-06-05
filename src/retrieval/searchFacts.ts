import { normalizeName, supabase } from "../db/client";
import type { FactMatch, FactType } from "../types/schema";

const entityStopWords = new Set([
  "what",
  "which",
  "where",
  "when",
  "who",
  "how",
  "weak",
  "weakness",
  "weaknesses",
  "resist",
  "resistance",
  "beat",
  "boss",
  "enemy",
  "persona",
  "reload",
  "guide",
  "help",
  "strategy",
  "with",
  "does",
  "need",
]);

const intentToFactTypes: Array<{ pattern: RegExp; types: FactType[] }> = [
  { pattern: /weak|weakness|vulnerable/i, types: ["weakness"] },
  { pattern: /resist|resistance/i, types: ["resistance", "nullifies", "drains", "repels"] },
  { pattern: /beat|boss|strategy|fight|kill/i, types: ["strategy", "recommended_party", "weakness", "resistance"] },
  { pattern: /fuse|fusion|recipe/i, types: ["fusion_recipe", "prerequisite", "unlock_condition"] },
  { pattern: /social link|s-link|answer|choice/i, types: ["answer_choice", "schedule", "unlock_condition", "tip"] },
  { pattern: /request|elizabeth|reward/i, types: ["reward", "deadline", "prerequisite", "location", "tip"] },
  { pattern: /floor|tartarus|block/i, types: ["floor_range", "location", "tip"] },
  { pattern: /item|equipment|effect/i, types: ["item_effect", "location", "reward"] },
];

export function detectFactTypes(query: string): FactType[] {
  const matched = intentToFactTypes.flatMap((entry) => (entry.pattern.test(query) ? entry.types : []));
  return [...new Set(matched)];
}

function likelyEntityTerms(query: string): string[] {
  const normalized = normalizeName(query);
  const words = normalized
    .split(" ")
    .filter((term) => term.length >= 3 && !entityStopWords.has(term));
  const phrases =
    query
      .match(/[A-Z][a-z0-9']+(?:\s+[A-Z][a-z0-9']+)*/g)
      ?.map(normalizeName)
      .filter((phrase) => phrase.split(" ").length > 1) ?? [];

  return [...new Set([...phrases, ...words])].slice(0, 8);
}

export async function searchFacts(query: string, limit = 12): Promise<FactMatch[]> {
  const likelyTerms = likelyEntityTerms(query);
  const factTypes = detectFactTypes(query);

  let entityQuery = supabase
    .from("entities")
    .select("id,name,type,aliases,normalized_name")
    .limit(12);

  if (likelyTerms.length > 0) {
    const orTerms = likelyTerms
      .map((term) => `normalized_name.ilike.%${term}%,name.ilike.%${term}%`)
      .join(",");
    entityQuery = entityQuery.or(orTerms);
  }

  const { data: entities, error: entityError } = await entityQuery;
  if (entityError) {
    throw entityError;
  }
  if (!entities || entities.length === 0) {
    return [];
  }

  let factsQuery = supabase
    .from("facts")
    .select(`
      id,
      fact_type,
      value,
      confidence,
      notes,
      entity:entities(id,name,type,aliases,normalized_name),
      source:sources(id,title,url,domain,credibility_rank)
    `)
    .in(
      "entity_id",
      entities.map((entity) => entity.id),
    )
    .order("confidence", { ascending: false })
    .limit(limit);

  if (factTypes.length > 0) {
    factsQuery = factsQuery.in("fact_type", factTypes);
  }

  const { data, error } = await factsQuery;
  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row) => row as unknown as FactMatch)
    .sort((a, b) => a.source.credibility_rank - b.source.credibility_rank || b.confidence - a.confidence);
}
