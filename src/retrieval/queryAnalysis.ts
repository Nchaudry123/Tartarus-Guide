import { normalizeName } from "../db/client";
import type { EntityType } from "../types/schema";

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
  "mechanic",
  "mechanics",
  "party",
  "persona",
  "prepare",
  "recommended",
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
  expandedTerms: string[];
  phrases: string[];
  entityCandidates: string[];
  primarySubject?: string;
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

function cleanSubject(value: string): string | undefined {
  const cleaned = normalizeName(value)
    .replace(
      /\b(?:persona 3 reload|p3r|boss|enemy|shadow|social link|s link|request|guide|strategy|weakness|weak|resistance|affinity|fight|battle)$/g,
      "",
    )
    .replace(/\b(?:the|a|an)\s+/g, "")
    .trim();
  if (
    cleaned.length < 3 ||
    /^(?:final|final boss|this|that|it|i m|im|my|me|something|anything|who|what|where|when|why|how)$/.test(cleaned)
  ) {
    return undefined;
  }
  return cleaned;
}

function extractPrimarySubject(
  query: string,
  phrases: string[],
  date?: string,
): string | undefined {
  if (date && /\b(?:classroom|school question|quiz|exam)\b/i.test(query)) {
    return normalizeName(`${date} Classroom Question`);
  }
  if (/\bfinal boss\b/i.test(query)) return undefined;

  const patterns = [
    /\bwhat (?:is|are)\s+(?:the\s+)?(.+?)(?=\s+(?:weak|resist|null|drain|repel|located|location)\b|[?.!,]|$)/i,
    /\bhow (?:do|can|should) i (?:beat|fight|handle|prepare for)\s+(?:the\s+)?(.+?)(?=\s+(?:with|using|at|on|and)\b|[?.!,]|$)/i,
    /\b(?:strategy for|fight against|prepare for)\s+(?:the\s+)?(.+?)(?=\s+(?:with|using|at|on|and)\b|[?.!,]|$)/i,
    /\b(?:how (?:do|can) i fuse|should i (?:fuse|get|use))\s+(.+?)(?=\s+(?:with|using|at|on|and|worth|good)\b|[?.!,]|$)/i,
    /\b(?:is|would)\s+(.+?)\s+(?:be\s+)?(?:worth|good|viable|useful)\b/i,
    /\bwhen can i (?:start|unlock|meet)\s+(?:the\s+)?(.+?)(?=\s+(?:social link|s-?link)\b|[?.!,]|$)/i,
    /\b((?:elizabeth\s+)?request\s*#?\s*\d{1,3})\b/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    const subject = cleanSubject(match?.[1] ?? "");
    if (subject) return subject;
  }

  return phrases
    .map(cleanSubject)
    .find((phrase): phrase is string => Boolean(phrase));
}

const termExpansions: Record<string, string[]> = {
  elec: ["electric"],
  electricity: ["electric"],
  lightning: ["electric"],
  phys: ["physical", "slash", "strike", "pierce"],
  slink: ["social link"],
  link: ["social link"],
  fuse: ["fusion"],
  fusing: ["fusion"],
  recipe: ["fusion recipe"],
  floors: ["floor"],
  requests: ["request"],
  rewards: ["reward"],
};

const categoryEntityTypes: Record<RetrievalQueryAnalysis["category"], EntityType[]> = {
  enemy: ["enemy", "boss"],
  boss: ["boss", "enemy"],
  fusion: ["persona", "skill", "mechanic"],
  social_link: ["social_link", "party_member"],
  schedule: ["activity", "social_link", "request"],
  tartarus: ["tartarus_floor", "enemy", "boss", "location"],
  request: ["request", "item", "location"],
  achievement: ["mechanic", "activity"],
  story: ["boss", "party_member", "location", "mechanic"],
  general: [],
};

function detectCategory(query: string): RetrievalQueryAnalysis["category"] {
  if (/\b(weak|resist|null|drain|repel|affinit)/i.test(query)) return "enemy";
  if (/\b(social link|s-link|rank|romance)\b/i.test(query)) return "social_link";
  if (/\b(fuse|fusion|persona|compendium|inherit|arcana|recipe)\b/i.test(query)) return "fusion";
  if (/\b(story|ending|plot|final boss|spoiler)\b/i.test(query)) return "story";
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
  return "general";
}

export function analyzeRetrievalQuery(query: string): RetrievalQueryAnalysis {
  const normalized = normalizeName(query);
  const terms = [...new Set(
    normalized
      .split(" ")
      .filter((term) => term.length >= 3 && !stopWords.has(term)),
  )].slice(0, 10);
  const expandedTerms = [
    ...new Set(
      terms.flatMap((term) => [term, ...(termExpansions[term] ?? [])]).map(normalizeName),
    ),
  ].slice(0, 16);
  const phrases = [
    ...new Set(
      query
        .match(/[A-Z][A-Za-z0-9']+(?:\s+(?:and|of|the|[A-Z][A-Za-z0-9']+)){0,4}/g)
        ?.map((phrase) => normalizeName(phrase.replace(/\s+(?:and|of|the)$/i, "")))
        .filter((phrase) => phrase.split(" ").length > 1) ?? [],
    ),
  ].slice(0, 5);
  const termPhrases = terms
    .slice(0, 6)
    .flatMap((_, index) => [
      terms.slice(index, index + 3).join(" "),
      terms.slice(index, index + 2).join(" "),
    ])
    .filter((phrase) => phrase.split(" ").length > 1);
  const entityCandidates = [...new Set([
    ...phrases,
    ...termPhrases,
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
  const primarySubject = extractPrimarySubject(query, phrases, date);

  return {
    normalized,
    terms,
    expandedTerms,
    phrases,
    entityCandidates: [...new Set([primarySubject, ...prioritizedEntityCandidates].filter(Boolean))] as string[],
    primarySubject,
    category: detectCategory(query),
    floor: floorMatch ? Number(floorMatch[1]) : undefined,
    month: monthMatch?.[1].toLowerCase(),
    date,
  };
}

export function buildFocusedQueries(
  question: string,
  profileHints: string[] = [],
): string[] {
  const analysis = analyzeRetrievalQuery(question);
  const subject = analysis.primarySubject;
  const qualifiers = [
    analysis.date,
    analysis.floor ? `floor ${analysis.floor}` : undefined,
    ...profileHints,
  ].filter((value): value is string => Boolean(value));
  const focus = subject ?? question;
  let queries: string[];

  switch (analysis.category) {
    case "enemy":
      queries = [
        `${focus} weakness resistance affinity ${qualifiers.join(" ")}`,
        `${focus} location floor block`,
      ];
      break;
    case "boss":
      queries = [
        `${focus} boss mechanics weakness resistance`,
        `${focus} boss adds status effects phases attacks`,
        `${focus} recommended level party strategy`,
      ];
      break;
    case "fusion":
      queries = [
        `${focus} Megaten Fusion Tool fusion recipe prerequisite unlock`,
        `${focus} Megaten Fusion Tool level Arcana skills affinities inheritance stats heart item`,
      ];
      break;
    case "social_link":
      queries = [
        `${focus} Social Link start unlock schedule`,
        `${focus} Social Link answers rank requirements`,
      ];
      break;
    case "schedule":
      queries = [
        `${focus} classroom answer calendar schedule ${qualifiers.join(" ")}`,
      ];
      break;
    case "request":
      queries = [
        `${focus} Elizabeth request objective deadline reward`,
        `${focus} Elizabeth request item location prerequisite`,
      ];
      break;
    case "tartarus":
      queries = [
        `${focus} Tartarus floor block route ${qualifiers.join(" ")}`,
        `${focus} Tartarus enemies gatekeeper access`,
      ];
      break;
    case "story":
      queries = /\bfinal boss\b/i.test(question)
        ? [
            "Nyx Avatar final boss January 31 Tartarus",
            "Nyx final boss phases recommended level strategy",
          ]
        : [`${focus} Persona 3 Reload story ending ${qualifiers.join(" ")}`];
      break;
    case "achievement":
      queries = [
        `${focus} achievement trophy requirements missable`,
        `${focus} platinum checklist`,
      ];
      break;
    default:
      queries = [question];
  }

  return [...new Set(queries.map((query) => query.replace(/\s+/g, " ").trim()))]
    .filter(Boolean)
    .slice(0, 4);
}

export function lexicalCoverage(text: string, analysis: RetrievalQueryAnalysis): number {
  const normalized = normalizeName(text);
  if (!analysis.expandedTerms.length) return 0;
  const hits = analysis.expandedTerms.filter((term) => normalized.includes(term)).length;
  return hits / analysis.expandedTerms.length;
}

export function entityTypesForCategory(
  category: RetrievalQueryAnalysis["category"],
): EntityType[] {
  return categoryEntityTypes[category];
}

export function editSimilarity(left: string, right: string): number {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

export function entityCandidateScore(
  analysis: RetrievalQueryAnalysis,
  name: string,
  aliases: string[] = [],
): number {
  const names = [name, ...aliases].map(normalizeName).filter(Boolean);
  let best = 0;
  for (const candidate of analysis.entityCandidates) {
    for (const entityName of names) {
      if (analysis.normalized === entityName) best = Math.max(best, 1);
      else if (analysis.normalized.includes(entityName)) best = Math.max(best, 0.96);
      else if (candidate === entityName) best = Math.max(best, 0.98);
      else if (candidate.includes(entityName) || entityName.includes(candidate)) {
        best = Math.max(best, 0.86);
      } else if (candidate.length >= 5 && entityName.length >= 5) {
        best = Math.max(best, editSimilarity(candidate, entityName));
      }
    }
  }
  return best;
}

export function matchesPrimarySubject(
  text: string,
  analysis: RetrievalQueryAnalysis,
): boolean {
  const subject =
    analysis.primarySubject ??
    analysis.phrases.find((candidate) => candidate.includes(" ") && candidate.length >= 6) ??
    analysis.entityCandidates.find(
      (candidate) => candidate.includes(" ") && candidate.length >= 6,
    ) ??
    (["enemy", "boss", "fusion", "social_link", "request"].includes(analysis.category)
      ? analysis.entityCandidates.find(
          (candidate) =>
            candidate.length >= 4 &&
            !stopWords.has(candidate) &&
            !/\b(?:mechanics?|recommended|party|strategy|prepare|guide|answer|choice|rank|request)\b/.test(candidate),
        )
      : undefined);
  if (!subject) return true;
  const normalized = normalizeName(text);
  if (normalized.includes(subject)) return true;
  return subject
    .split(" ")
    .filter((term) => term.length >= 4)
    .every((term) => normalized.includes(term));
}

export function isClearlyWrongCategory(
  titleAndSection: string,
  category: RetrievalQueryAnalysis["category"],
): boolean {
  const normalized = normalizeName(titleAndSection);
  if (category === "story") return false;
  if (/\b(?:ending explained|story walkthrough|final ending)\b/.test(normalized)) return true;
  if (
    category !== "social_link" &&
    /\b(?:social link answers|social link guide|romance guide)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    !["fusion", "general"].includes(category) &&
    /\b(?:fusion calculator|fusion recipes|persona compendium)\b/.test(normalized)
  ) {
    return true;
  }
  return false;
}

export function isRetrievalBoilerplate(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    /about ign.*guide writers|find in guide|top guide sections|advertisement/.test(normalized) ||
    /adclick\.g\.doubleclick|markdown content:|url source:|cookie policy/.test(normalized) ||
    normalized.trim().length < 45
  );
}
