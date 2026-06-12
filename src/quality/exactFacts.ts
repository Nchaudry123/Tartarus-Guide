import type { FactMatch, FactType } from "../types/schema";

export const deterministicExactFactTypes = new Set<FactType>([
  "weakness",
  "resistance",
  "nullifies",
  "drains",
  "repels",
  "fusion_recipe",
  "arcana",
  "base_level",
  "schedule",
  "deadline",
  "reward",
  "floor_range",
  "location",
  "unlock_condition",
  "prerequisite",
  "answer_choice",
  "item_effect",
]);

const exactQuestionTypes: Array<{ pattern: RegExp; types: FactType[] }> = [
  { pattern: /\barcana\b/i, types: ["arcana"] },
  { pattern: /\b(?:base |recommended |what |which )?level\b/i, types: ["base_level", "prerequisite"] },
  { pattern: /\b(?:when|date|day|schedule|available|availability|start)\b/i, types: ["unlock_condition", "schedule", "deadline"] },
  { pattern: /\b(?:deadline|due)\b/i, types: ["deadline"] },
  { pattern: /\b(?:reward|receive|get for completing)\b/i, types: ["reward"] },
  { pattern: /\b(?:floor|floors|block)\b/i, types: ["floor_range", "location"] },
  { pattern: /\b(?:where|location|find)\b/i, types: ["location", "floor_range"] },
  { pattern: /\b(?:unlock|start|prerequisite|requirement)\b/i, types: ["unlock_condition", "prerequisite"] },
  { pattern: /\b(?:classroom answer|correct answer|best answer|answer choice)\b/i, types: ["answer_choice"] },
  { pattern: /\b(?:effect|what does .+ do)\b/i, types: ["item_effect"] },
];

export function requestedExactFactTypes(question: string): FactType[] {
  return [
    ...new Set(
      exactQuestionTypes.flatMap((entry) =>
        entry.pattern.test(question) ? entry.types : [],
      ),
    ),
  ];
}

export function exactFactMatches(
  question: string,
  facts: FactMatch[],
  subjectMatches: (question: string, entityName: string) => boolean,
): FactMatch[] {
  const requested = requestedExactFactTypes(question);
  if (!requested.length) return [];
  const rank = question.match(/\brank\s*(\d{1,2})\b/i)?.[1];
  const rankPrefix = rank ? new RegExp(`\\bRank\\s*${rank}\\s*->`, "i") : null;
  return facts
    .filter(
      (fact) =>
        requested.includes(fact.fact_type) &&
        deterministicExactFactTypes.has(fact.fact_type) &&
        fact.confidence >= 0.8 &&
        Boolean(fact.value.trim()) &&
        subjectMatches(question, fact.entity.name),
    )
    .sort(
      (a, b) =>
        Number(Boolean(rankPrefix?.test(b.value))) - Number(Boolean(rankPrefix?.test(a.value))) ||
        requested.indexOf(a.fact_type) - requested.indexOf(b.fact_type) ||
        b.confidence - a.confidence ||
        a.source.credibility_rank - b.source.credibility_rank,
    );
}

export function exactFactLabel(factType: FactType): string {
  const labels: Partial<Record<FactType, string>> = {
    arcana: "Arcana",
    base_level: "Base level",
    schedule: "Schedule",
    deadline: "Deadline",
    reward: "Reward",
    floor_range: "Floor",
    location: "Location",
    unlock_condition: "Unlock",
    prerequisite: "Requirement",
    answer_choice: "Answer",
    item_effect: "Effect",
  };
  return labels[factType] ?? factType.replaceAll("_", " ");
}
