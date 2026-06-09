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
  "fuse",
  "fusion",
  "recipe",
  "make",
  "result",
  "level",
  "arcana",
  "skill",
  "skills",
  "with",
  "does",
  "need",
]);

const intentToFactTypes: Array<{ pattern: RegExp; types: FactType[] }> = [
  { pattern: /weak|weakness|vulnerable/i, types: ["weakness"] },
  { pattern: /resist|resistance/i, types: ["resistance", "nullifies", "drains", "repels"] },
  { pattern: /beat|boss|strategy|fight|kill/i, types: ["strategy", "recommended_party", "weakness", "resistance"] },
  { pattern: /fuse|fusion|recipe/i, types: ["fusion_recipe", "prerequisite", "unlock_condition"] },
  { pattern: /level|arcana|stats?|inherit/i, types: ["prerequisite", "tip", "unlock_condition"] },
  { pattern: /skill|learn|move/i, types: ["tip", "item_effect", "prerequisite"] },
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
  const normalizedQuery = normalizeName(query);

  let entityQuery = supabase
    .from("entities")
    .select("id,name,type,aliases,normalized_name")
    .limit(30);

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
    .limit(Math.max(limit * 4, 30));

  if (factTypes.length > 0) {
    factsQuery = factsQuery.in("fact_type", factTypes);
  }

  const { data, error } = await factsQuery;
  if (error) {
    throw error;
  }

  let rows = (data ?? []).map((row) => row as unknown as FactMatch);
  const ingredientEntityNames: string[] = [];
  if (factTypes.includes("fusion_recipe")) {
    const namedEntities = (entities ?? [])
      .filter((entity) => normalizedQuery.includes(entity.normalized_name))
      .sort((a, b) => b.normalized_name.length - a.normalized_name.length)
      .slice(0, 2);
    if (namedEntities.length >= 2) {
      ingredientEntityNames.push(...namedEntities.map((entity) => entity.name));
      let recipeQuery = supabase
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
        .eq("fact_type", "fusion_recipe")
        .limit(30);
      for (const entity of namedEntities) {
        recipeQuery = recipeQuery.ilike("value", `%${entity.name}%`);
      }
      const { data: recipeRows, error: recipeError } = await recipeQuery;
      if (recipeError) throw recipeError;
      rows = [
        ...rows,
        ...(recipeRows ?? []).map((row) => row as unknown as FactMatch),
      ];
    }
  }

  const ingredientPairRelevance = (fact: FactMatch): number => {
    if (fact.fact_type !== "fusion_recipe" || ingredientEntityNames.length < 2) return 0;
    const normalizedValue = normalizeName(fact.value);
    return ingredientEntityNames.every((name) => normalizedValue.includes(normalizeName(name))) ? 250 : 0;
  };

  const entityRelevance = (fact: FactMatch): number => {
    const entityName = fact.entity.normalized_name || normalizeName(fact.entity.name);
    if (!entityName) return 0;
    if (normalizedQuery === entityName) return 120;
    if (normalizedQuery.includes(entityName)) return 100 + entityName.split(" ").length * 5;

    const entityTerms = entityName.split(" ").filter(Boolean);
    const matchedTerms = entityTerms.filter((term) => normalizedQuery.split(" ").includes(term));
    return matchedTerms.length * 10 - Math.max(0, entityTerms.length - matchedTerms.length) * 4;
  };

  return [...new Map(rows.map((row) => [row.id, row])).values()]
    .sort(
      (a, b) =>
        ingredientPairRelevance(b) - ingredientPairRelevance(a) ||
        entityRelevance(b) - entityRelevance(a) ||
        b.confidence - a.confidence ||
        a.source.credibility_rank - b.source.credibility_rank,
    )
    .slice(0, limit);
}
