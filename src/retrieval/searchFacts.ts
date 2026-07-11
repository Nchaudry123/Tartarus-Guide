import { normalizeName, supabase } from "../db/client";
import type { FactMatch, FactType } from "../types/schema";
import {
  analyzeRetrievalQuery,
  entityCandidateScore,
  entityTypesForCategory,
} from "./queryAnalysis";

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
  { pattern: /affinit/i, types: ["weakness", "resistance", "nullifies", "drains", "repels"] },
  { pattern: /resist|resistance/i, types: ["resistance", "nullifies", "drains", "repels"] },
  { pattern: /beat|boss|strategy|fight|kill/i, types: ["strategy", "recommended_party", "weakness", "resistance"] },
  { pattern: /fuse|fusion|recipe/i, types: ["fusion_recipe", "prerequisite", "unlock_condition"] },
  { pattern: /level|arcana|stats?|inherit/i, types: ["base_level", "arcana", "prerequisite", "tip", "unlock_condition"] },
  { pattern: /skill|learn|move/i, types: ["tip", "item_effect", "prerequisite"] },
  { pattern: /social link|s-link|answer|choice/i, types: ["answer_choice", "schedule", "unlock_condition", "tip"] },
  {
    pattern:
      /schedule|calendar|today|date|classroom|school question|quiz|january|february|march|april|may|june|july|august|september|october|november|december|\b\d{1,2}\/\d{1,2}\b/i,
    types: ["schedule", "answer_choice", "strategy", "unlock_condition"],
  },
  { pattern: /request|elizabeth|reward/i, types: ["reward", "deadline", "prerequisite", "location", "tip"] },
  { pattern: /floor|tartarus|block/i, types: ["floor_range", "location", "tip"] },
  { pattern: /item|equipment|effect/i, types: ["item_effect", "location", "reward"] },
];

export function detectFactTypes(query: string): FactType[] {
  // Skill-keep follow-ups often ride on fusion threads ("How do I fuse Loki?" +
  // "What skills should I keep?"). Prefer profile/tip facts so fusion recipes
  // do not crowd out Initial/Learned skills.
  if (
    /\bskills?\s+should\s+i\s+keep\b/i.test(query) ||
    /\b(?:initial|learned)\s+skills?\b/i.test(query) ||
    /\bwhat skills?\b/i.test(query)
  ) {
    return [
      "tip",
      "item_effect",
      "prerequisite",
      "weakness",
      "resistance",
      "nullifies",
      "drains",
      "repels",
      "arcana",
      "base_level",
      "unlock_condition",
    ];
  }

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

export async function searchFacts(
  query: string,
  limit = 12,
  signal?: AbortSignal,
): Promise<FactMatch[]> {
  signal?.throwIfAborted();
  const analysis = analyzeRetrievalQuery(query);
  const exactRequestNumber = query.match(
    /\b(?:elizabeth\s+)?request\s*#?\s*(\d{1,3})\b/i,
  )?.[1];
  // Prefer compact entity tokens (e.g. "loki") over long phrase candidates so
  // follow-ups like "skills should I keep for Loki after fusing" still resolve.
  const likelyTerms = [...new Set([
    exactRequestNumber ? `request ${exactRequestNumber}` : undefined,
    analysis.primarySubject,
    ...likelyEntityTerms(query),
    ...analysis.entityCandidates,
  ].filter(Boolean))].slice(0, 12) as string[];
  const factTypes = detectFactTypes(query);
  const normalizedQuery = normalizeName(query);
  const entityTypes = entityTypesForCategory(analysis.category);

  let entityQuery = supabase
    .from("entities")
    .select("id,name,type,aliases,normalized_name")
    .limit(30);

  if (entityTypes.length > 0) {
    entityQuery = entityQuery.in("type", entityTypes);
  }

  if (likelyTerms.length > 0) {
    const orTerms = likelyTerms
      .map((term) => term.replace(/[,%().]/g, " "))
      .filter(Boolean)
      .map((term) => `normalized_name.ilike.%${term}%,name.ilike.%${term}%`)
      .join(",");
    entityQuery = entityQuery.or(orTerms);
  }

  if (signal) entityQuery = entityQuery.abortSignal(signal);
  const { data: directEntities, error: entityError } = await entityQuery;
  if (entityError) {
    throw entityError;
  }
  let entities = directEntities ?? [];
  if (entityTypes.length > 0 && likelyTerms.length > 0) {
    let broadEntityQuery = supabase
      .from("entities")
      .select("id,name,type,aliases,normalized_name")
      .limit(30);
    const orTerms = likelyTerms
      .map((term) => term.replace(/[,%().]/g, " "))
      .filter(Boolean)
      .map((term) => `normalized_name.ilike.%${term}%,name.ilike.%${term}%`)
      .join(",");
    broadEntityQuery = broadEntityQuery.or(orTerms);
    if (signal) broadEntityQuery = broadEntityQuery.abortSignal(signal);
    const { data: broadEntities, error: broadEntityError } = await broadEntityQuery;
    if (broadEntityError) throw broadEntityError;
    const broadMatches = (broadEntities ?? []).filter(
      (entity) => entityCandidateScore(analysis, entity.name, entity.aliases ?? []) >= 0.72,
    );
    entities = [
      ...new Map([...entities, ...broadMatches].map((entity) => [entity.id, entity])).values(),
    ];
  }
  if (entities.length === 0 && analysis.entityCandidates.length > 0) {
    let fallbackQuery = supabase
      .from("entities")
      .select("id,name,type,aliases,normalized_name")
      .limit(500);
    if (entityTypes.length > 0) {
      fallbackQuery = fallbackQuery.in("type", entityTypes);
    }
    if (signal) fallbackQuery = fallbackQuery.abortSignal(signal);
    const { data: fallbackEntities, error: fallbackError } = await fallbackQuery;
    if (fallbackError) throw fallbackError;
    entities = (fallbackEntities ?? [])
      .map((entity) => ({
        entity,
        score: entityCandidateScore(analysis, entity.name, entity.aliases ?? []),
      }))
      .filter(({ score }) => score >= 0.72)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ entity }) => entity);
  }
  if (entities.length === 0) return [];

  const exactEntityNames = new Set(
    [
      analysis.primarySubject,
      normalizedQuery,
    ]
      .filter(Boolean)
      .map((value) => normalizeName(value as string)),
  );
  const exactEntities = entities.filter((entity) =>
    exactEntityNames.has(entity.normalized_name || normalizeName(entity.name)),
  );

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

  signal?.throwIfAborted();
  if (signal) factsQuery = factsQuery.abortSignal(signal);
  const { data, error } = await factsQuery;
  if (error) {
    throw error;
  }

  let rows = (data ?? []).map((row) => row as unknown as FactMatch);
  if (exactEntities.length > 0 && exactEntities.length < entities.length) {
    let exactFactsQuery = supabase
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
        exactEntities.map((entity) => entity.id),
      )
      .order("confidence", { ascending: false })
      .limit(Math.max(limit * 4, 30));
    if (factTypes.length > 0) {
      exactFactsQuery = exactFactsQuery.in("fact_type", factTypes);
    }
    if (signal) exactFactsQuery = exactFactsQuery.abortSignal(signal);
    const { data: exactRows, error: exactFactsError } = await exactFactsQuery;
    if (exactFactsError) throw exactFactsError;
    rows = [
      ...(exactRows ?? []).map((row) => row as unknown as FactMatch),
      ...rows,
    ];
  }

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
      if (signal) recipeQuery = recipeQuery.abortSignal(signal);
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
    const queryTokens = new Set(normalizedQuery.split(" ").filter(Boolean));
    const entityTokens = entityName.split(" ").filter(Boolean);
    // Token match avoids false positives like entity "loki a" matching "...loki after...".
    const tokenMatch =
      entityTokens.length > 0 && entityTokens.every((token) => queryTokens.has(token));
    if (exactRequestNumber) {
      if (new RegExp(`^request ${exactRequestNumber}\\b`).test(entityName)) return 180;
      if (/^request \d+\b/.test(entityName)) return -120;
    }
    if (analysis.date && entityName.includes(normalizeName(analysis.date))) {
      const classroomBonus =
        /\b(classroom|school question|quiz|answer)\b/i.test(query) &&
        /\b(classroom|school question|quiz)\b/i.test(entityName)
          ? 25
          : 0;
      return 125 + classroomBonus;
    }
    if (normalizedQuery === entityName) return 120;
    if (tokenMatch) {
      // Prefer exact short names (Loki) over longer variants (Loki A / Loki DLC)
      // when every token is present.
      return 100 + Math.min(20, entityTokens.length * 5) - Math.max(0, entityTokens.length - 1) * 8;
    }
    if (analysis.phrases.some((phrase) => phrase === entityName)) return 115;

    const aliasMatch = fact.entity.aliases
      ?.map(normalizeName)
      .some((alias) => {
        const aliasTokens = alias.split(" ").filter(Boolean);
        return (
          alias.length >= 3 &&
          aliasTokens.length > 0 &&
          aliasTokens.every((token) => queryTokens.has(token))
        );
      });
    if (aliasMatch) return 90;

    const fuzzyScore = entityCandidateScore(analysis, fact.entity.name, fact.entity.aliases);
    if (fuzzyScore >= 0.72) return fuzzyScore * 90;

    const matchedTerms = entityTokens.filter((term) => queryTokens.has(term));
    return matchedTerms.length * 10 - Math.max(0, entityTokens.length - matchedTerms.length) * 4;
  };

  return [...new Map(rows.map((row) => [row.id, row])).values()]
    .filter((fact) => entityRelevance(fact) > 0 || ingredientPairRelevance(fact) > 0)
    .sort(
      (a, b) =>
        ingredientPairRelevance(b) - ingredientPairRelevance(a) ||
        entityRelevance(b) - entityRelevance(a) ||
        b.confidence - a.confidence ||
        a.source.credibility_rank - b.source.credibility_rank,
    )
    .slice(0, limit);
}
