import { normalizeName } from "../db/client";

const stopWords = new Set([
  "about",
  "answer",
  "beat",
  "best",
  "can",
  "current",
  "does",
  "enemy",
  "feel",
  "feels",
  "game",
  "guide",
  "help",
  "need",
  "persona",
  "reload",
  "should",
  "strategy",
  "that",
  "this",
  "weak",
  "weakness",
  "what",
  "when",
  "where",
  "which",
  "with",
]);

export type RetrievalQueryAnalysis = {
  normalized: string;
  terms: string[];
  phrases: string[];
  entityCandidates: string[];
  category:
    | "enemy"
    | "boss"
    | "fusion"
    | "social_link"
    | "schedule"
    | "tartarus"
    | "request"
    | "achievement"
    | "story"
    | "general";
  floor?: number;
  month?: string;
};

function detectCategory(query: string): RetrievalQueryAnalysis["category"] {
  if (/\b(weak|resist|null|drain|repel|affinit)/i.test(query)) return "enemy";
  if (/\b(social link|s-link|rank|romance)\b/i.test(query)) return "social_link";
  if (/\b(fuse|fusion|persona|compendium|inherit|arcana|recipe)\b/i.test(query)) return "fusion";
  if (/\b(boss|full moon|gatekeeper|priestess|emperor|empress|hanged man)\b/i.test(query)) return "boss";
  if (/\b(schedule|today|evening|after school|free time|study|exam)\b/i.test(query)) return "schedule";
  if (/\b(tartarus|floor|block|border|missing person|rescue)\b/i.test(query)) return "tartarus";
  if (/\b(request|elizabeth|quest|reward)\b/i.test(query)) return "request";
  if (/\b(achievement|trophy|platinum|100%)\b/i.test(query)) return "achievement";
  if (/\b(story|ending|plot|final boss|spoiler)\b/i.test(query)) return "story";
  return "general";
}

export function analyzeRetrievalQuery(query: string): RetrievalQueryAnalysis {
  const normalized = normalizeName(query);
  const terms = [...new Set(
    normalized
      .split(" ")
      .filter((term) => term.length >= 3 && !stopWords.has(term)),
  )].slice(0, 10);
  const phrases = [
    ...new Set(
      query
        .match(/[A-Z][A-Za-z0-9']+(?:\s+(?:and|of|the|[A-Z][A-Za-z0-9']+)){0,4}/g)
        ?.map(normalizeName)
        .filter((phrase) => phrase.split(" ").length > 1) ?? [],
    ),
  ].slice(0, 5);
  const entityCandidates = [...new Set([
    ...phrases,
    ...terms.filter((term) => term.length >= 4),
  ])].sort((a, b) => b.length - a.length);
  const floorMatch = query.match(/\b(?:floor|f)\s*(\d{1,3})\b/i);
  const monthMatch = query.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
  );

  return {
    normalized,
    terms,
    phrases,
    entityCandidates,
    category: detectCategory(query),
    floor: floorMatch ? Number(floorMatch[1]) : undefined,
    month: monthMatch?.[1].toLowerCase(),
  };
}

export function lexicalCoverage(text: string, analysis: RetrievalQueryAnalysis): number {
  const normalized = normalizeName(text);
  if (!analysis.terms.length) return 0;
  const hits = analysis.terms.filter((term) => normalized.includes(term)).length;
  return hits / analysis.terms.length;
}

export function isRetrievalBoilerplate(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    /about ign.*guide writers|find in guide|top guide sections|advertisement/.test(normalized) ||
    /adclick\.g\.doubleclick|markdown content:|url source:|cookie policy/.test(normalized) ||
    normalized.trim().length < 45
  );
}
