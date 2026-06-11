import type { SourceInput } from "../types/schema";

const ALLOWED_IGN_PREFIX = "/wikis/persona-3-reload";
const ALLOWED_GAME8_PREFIX = "/games/Persona-3-Reload";

const rejectedTerms = [
  "topcontributors",
  "recentchanges",
  "pagehistory",
  "talk:",
  "special:",
  "category:",
  "file:",
  "template:",
  "comments",
  "comment",
  "login",
  "signup",
  "privacy",
  "terms",
  "contact",
  "advertise",
  "news",
  "review",
  "trailer",
  "video",
  "gallery",
  "wallpaper",
  "merch",
  "episode-aigis",
  "episode_aigis",
];

const categoryRules: Array<{ category: string; pattern: RegExp }> = [
  { category: "bosses", pattern: /\b(boss|full moon|guardian|monad)\b/i },
  { category: "social_links", pattern: /\b(social link|linked episode|romance|arcana)\b/i },
  { category: "requests", pattern: /\b(elizabeth|request|missing person)\b/i },
  { category: "fusion", pattern: /\b(fusion|fuse|special fusion|fusion spell)\b/i },
  { category: "enemies", pattern: /\b(enemy|enemies|shadow|weakness|affinit|greedy|rare hand)\b/i },
  { category: "tartarus", pattern: /\b(tartarus|floor|block|thebel|arqa|yabbashah|tziah|harabah|adamash)\b/i },
  { category: "walkthrough", pattern: /\b(walkthrough|calendar|month|daily schedule|ending)\b/i },
  { category: "classroom", pattern: /\b(classroom|exam|school question|answer)\b/i },
  { category: "beginner_strategy", pattern: /\b(beginner|tips|combat|battle|party|team)\b/i },
  { category: "personas", pattern: /\b(personas|persona list|compendium|arcana|skill list)\b/i },
];

const highValueTerms =
  /\b(weakness|weaknesses|affinity|affinities|boss|shadow|social link|linked episode|elizabeth|request|fusion|persona|tartarus|floor|walkthrough|calendar|classroom|exam|missing person|full moon|guardian|monad)\b/i;

export function isIgnUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname.replace(/^www\./, "") === "ign.com" &&
      url.pathname.toLowerCase().startsWith(ALLOWED_IGN_PREFIX);
  } catch {
    return false;
  }
}

export function isGame8Url(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname.replace(/^www\./, "") === "game8.co" &&
      url.pathname.startsWith(ALLOWED_GAME8_PREFIX);
  } catch {
    return false;
  }
}

export function canonicalizeSourceUrl(rawUrl: string, baseUrl?: string): string | null {
  try {
    const url = new URL(rawUrl.replace(/&amp;/g, "&"), baseUrl);
    url.hash = "";
    url.search = "";
    url.protocol = "https:";
    if (url.hostname === "ign.com") {
      url.hostname = "www.ign.com";
    }
    const canonical = url.toString().replace(/\/$/, "");
    return isAllowedSourceUrl(canonical) ? canonical : null;
  } catch {
    return null;
  }
}

export function isAllowedSourceUrl(value: string): boolean {
  if (!isIgnUrl(value) && !isGame8Url(value)) {
    return false;
  }
  const decoded = decodeURIComponent(value).toLowerCase();
  return !rejectedTerms.some((term) => decoded.includes(term));
}

export function cleanSourceTitle(title: string): string {
  return title
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*]/g, " ")
    .replace(/^#+\s*/, "")
    .replace(/^(?:previous|next)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleFromUrl(value: string): string {
  const pathname = new URL(value).pathname;
  const segment = decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "Persona 3 Reload Guide");
  return segment
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function categoryForSource(url: string, title = ""): string {
  const haystack = `${decodeURIComponent(new URL(url).pathname)} ${title}`
    .replace(/persona[\s_-]*3[\s_-]*reload/gi, " ")
    .replace(/[_-]+/g, " ");
  return categoryRules.find((rule) => rule.pattern.test(haystack))?.category ?? "guide";
}

export function credibilityForSource(url: string): number {
  return isIgnUrl(url) ? 10 : 20;
}

export function sourceQualityScore(source: SourceInput): number {
  const haystack = `${source.title} ${decodeURIComponent(new URL(source.url).pathname)}`.replace(/[_-]+/g, " ");
  if (
    /\b(release time|countdown|coming to|game pass|demo|edition contents|price|differences from|what does sees mean|play as the femc|episode:?\s*aigis|expansion pass|expansion pack|dlc)\b|requests \(aigis\)|^\?\?\?/i.test(
      haystack,
    )
  ) {
    return -100;
  }
  let score = 0;
  if (highValueTerms.test(haystack)) score += 30;
  if (source.category !== "guide" && source.category !== "overview") score += 20;
  if (isGame8Url(source.url) && /\/archives\/\d+$/.test(new URL(source.url).pathname)) score += 12;
  if (isIgnUrl(source.url) && new URL(source.url).pathname.split("/").length >= 4) score += 10;
  if (/\b(guide|list|all|overview|wiki)\b/i.test(source.title)) score -= 6;
  if (source.category === "overview") score -= 10;
  return score;
}

export function sourceFromLink(title: string, url: string): SourceInput {
  const cleanedTitle = cleanSourceTitle(title) || titleFromUrl(url);
  return {
    title: cleanedTitle,
    url,
    category: categoryForSource(url, cleanedTitle),
    sourceType: "guide",
    credibilityRank: credibilityForSource(url),
  };
}
