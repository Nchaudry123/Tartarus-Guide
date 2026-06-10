import { normalizeName } from "../db/client";

const stopWords = new Set([
  "about",
  "and",
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
  date?: string;
};

function detectCategory(query: string): RetrievalQueryAnalysis["category"] {
  if (/\b(weak|resist|null|drain|repel|affinit)/i.test(query)) return "enemy";
  if (/\b(social link|s-link|rank|romance)\b/i.test(query)) return "social_link";
  if (/\b(fuse|fusion|persona|compendium|inherit|arcana|recipe)\b/i.test(query)) return "fusion";
  if (
    /\b(boss|full moon|gatekeeper|priestess|emperor|empress|hanged man|how (?:do|can) i beat|strategy for|fight against|prepare for)\b/i.test(
      query,
    )
  ) {
    return "boss";
  }
  if (
    /\b(schedule|calendar|today|evening|after school|free time|study|exam|classroom|school question|quiz|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
      query,
    ) ||
    /\b\d{1,2}\/\d{1,2}\b/.test(query)
  ) {
    return "schedule";
  }
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
        ?.map((phrase) => normalizeName(phrase.replace(/\s+(?:and|of|the)$/i, "")))
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
  const namedDateMatch = query.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
  );
  const numericDateMatch = query.match(/\b(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])\b/);
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const date = namedDateMatch
    ? `${namedDateMatch[1][0].toUpperCase()}${namedDateMatch[1].slice(1).toLowerCase()} ${Number(namedDateMatch[2])}`
    : numericDateMatch
      ? `${monthNames[Number(numericDateMatch[1]) - 1]} ${Number(numericDateMatch[2])}`
      : undefined;
  const datedCandidates = date ? [normalizeName(`${date} Classroom Question`), normalizeName(date)] : [];
  const prioritizedEntityCandidates = [...new Set([
    ...datedCandidates,
    ...entityCandidates,
  ])];

  return {
    normalized,
    terms,
    phrases,
    entityCandidates: prioritizedEntityCandidates,
    category: detectCategory(query),
    floor: floorMatch ? Number(floorMatch[1]) : undefined,
    month: monthMatch?.[1].toLowerCase(),
    date,
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
