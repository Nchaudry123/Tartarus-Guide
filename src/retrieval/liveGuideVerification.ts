import { createHash } from "node:crypto";
import { TtlCache } from "../cache/ttlCache";
import { extractContent } from "../ingest/extractContent";
import {
  canonicalizeSourceUrl,
  categoryForSource,
  credibilityForSource,
  isAllowedSourceUrl,
  sourceFromLink,
  titleFromUrl,
} from "../ingest/sourceCatalog";
import { analyzeRetrievalQuery } from "./queryAnalysis";
import { sanitizeUntrustedText } from "../security/untrustedContent";
import type { ChunkMatch, SourceInput } from "../types/schema";

export type LiveGuideIntent =
  | "Enemy Weakness"
  | "Boss Help"
  | "Team Building"
  | "Fusion Advice"
  | "Social Links"
  | "Daily Schedule Planning"
  | "Tartarus Navigation"
  | "Quest Help"
  | "Story Guidance"
  | "Achievement Hunting"
  | "General Discussion";

const pageCache = new TtlCache<string>(32, 30 * 60_000);
const searchCache = new TtlCache<SourceInput[]>(64, 15 * 60_000);

const guideUrls: Partial<Record<LiveGuideIntent, string[]>> = {
  "Enemy Weakness": [
    "https://game8.co/games/Persona-3-Reload/archives/443460",
    "https://game8.co/games/Persona-3-Reload/archives/440374",
  ],
  "Boss Help": [
    "https://game8.co/games/Persona-3-Reload/archives/440374",
    "https://game8.co/games/Persona-3-Reload/archives/470966",
  ],
  "Fusion Advice": [
    "https://game8.co/games/Persona-3-Reload/archives/439526",
    "https://game8.co/games/Persona-3-Reload/archives/439718",
  ],
  "Social Links": [
    "https://game8.co/games/Persona-3-Reload/archives/435602",
    "https://game8.co/games/Persona-3-Reload/archives/439526",
  ],
  "Daily Schedule Planning": [
    "https://game8.co/games/Persona-3-Reload/archives/439345",
    "https://www.ign.com/wikis/persona-3-reload/Persona_3_Reload_Classroom_Answers",
  ],
  "Tartarus Navigation": [
    "https://game8.co/games/Persona-3-Reload/archives/435772",
    "https://www.ign.com/wikis/persona-3-reload/Tartarus_Walkthrough",
  ],
  "Quest Help": [
    "https://game8.co/games/Persona-3-Reload/archives/439673",
    "https://www.ign.com/wikis/persona-3-reload/Elizabeth%27s_Requests_Guide",
  ],
  "Story Guidance": [
    "https://www.ign.com/wikis/persona-3-reload/Persona_3_Reload_Walkthrough",
  ],
  "Achievement Hunting": [
    "https://game8.co/games/Persona-3-Reload/archives/435583",
  ],
};

const ignoredTerms = new Set([
  "about",
  "after",
  "anything",
  "getting",
  "does",
  "from",
  "game",
  "have",
  "reload",
  "should",
  "that",
  "the",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
]);

function queryTerms(question: string): string[] {
  return [...new Set(
    question
      .toLowerCase()
      .replace(/persona 3 reload|p3r/g, " ")
      .replace(/\bmaxx(?:ed|ing)?\b/g, "max")
      .replace(/\bmax(?:ed|ing)\b/g, "max")
      .match(/[a-z0-9]+/g)
      ?.filter((term) => term.length >= 3 && !ignoredTerms.has(term)) ?? [],
  )].slice(0, 14);
}

function semanticQueryTerms(question: string, intent: LiveGuideIntent): string[] {
  const normalized = question
    .toLowerCase()
    .replace(/\bmaxx(?:ed|ing)?\b/g, "max")
    .replace(/\bmax(?:ed|ing)\b/g, "max");
  const terms = queryTerms(normalized);
  if (/\bmax\b/.test(normalized)) {
    terms.push("complete", "completion", "rank 10");
  }
  if (
    intent === "Social Links" &&
    /\b(?:all|every)\b/.test(normalized) &&
    /\bsocial links?\b/.test(normalized)
  ) {
    terms.push("all social links", "completion reward", "ultimate persona");
  }
  return [...new Set(terms)].slice(0, 20);
}

const searchDomainQueries = [
  {
    domain: "game8.co",
    site: "site:game8.co/games/Persona-3-Reload",
  },
  {
    domain: "ign.com",
    site: "site:ign.com/wikis/persona-3-reload",
  },
] as const;

const searchResultPattern =
  /^###\s+\[(.{2,500})\]\((https?:\/\/(?:www\.)?(?:game8\.co|ign\.com)\/[^)\s]+)\)\s*$/gim;

export function parseGuideSearchResults(markdown: string): SourceInput[] {
  const matches: SourceInput[] = [];
  let match: RegExpExecArray | null;
  searchResultPattern.lastIndex = 0;
  while ((match = searchResultPattern.exec(markdown))) {
    const canonical = canonicalizeSourceUrl(match[2]);
    if (!canonical) continue;
    const title = match[1].split("![").at(0)?.trim() || match[1];
    matches.push(sourceFromLink(title, canonical));
  }
  return [...new Map(matches.map((source) => [source.url, source])).values()];
}

function searchPhrase(question: string, intent: LiveGuideIntent): string {
  const analysis = analyzeRetrievalQuery(question);
  const terms = semanticQueryTerms(question, intent);
  const categoryHints: Partial<Record<LiveGuideIntent, string[]>> = {
    "Enemy Weakness": ["enemy", "weakness", "location"],
    "Boss Help": ["boss", "strategy"],
    "Team Building": ["party", "build"],
    "Fusion Advice": ["persona", "fusion"],
    "Social Links": ["social link", "reward", "unlock"],
    "Daily Schedule Planning": ["calendar", "schedule"],
    "Tartarus Navigation": ["tartarus", "floor"],
    "Quest Help": ["elizabeth", "request"],
    "Story Guidance": ["walkthrough", "story"],
    "Achievement Hunting": ["achievement", "trophy"],
  };
  const specializedHints =
    /\b(?:weapon|armor|equipment|accessor(?:y|ies))\b/i.test(question)
      ? ["weapon", "equipment", "how to get"]
      : /\b(?:item|material|gem|card)\b/i.test(question)
        ? ["item", "location", "how to get"]
        : /\bwhat does\b.{1,60}\bdo\b/i.test(question)
          ? ["skill effect", "persona learn"]
          : categoryHints[intent] ?? [];
  return [...new Set([
    analysis.primarySubject,
    ...terms,
    ...specializedHints,
  ].filter((value): value is string => Boolean(value)))]
    .slice(0, 10)
    .join(" ");
}

async function fetchSearchResults(
  site: string,
  phrase: string,
  signal?: AbortSignal,
): Promise<SourceInput[]> {
  const cacheKey = `${site}:${phrase}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const query = encodeURIComponent(`${site} "Persona 3 Reload" ${phrase}`);
  const url = `https://r.jina.ai/http://www.google.com/search?udm=14&q=${query}`;
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromParent();
  signal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Guide search timed out.", "TimeoutError")),
    7_000,
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "TartarusGuideRAG/0.1 (+guide discovery)",
        accept: "text/markdown,text/plain",
      },
      redirect: "follow",
    });
    if (!response.ok) return [];
    const results = parseGuideSearchResults(await response.text());
    searchCache.set(cacheKey, results);
    return results;
  } catch (error) {
    if (signal?.aborted) throw error;
    return [];
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

export async function discoverLiveGuideSources(
  question: string,
  intent: LiveGuideIntent,
  signal?: AbortSignal,
): Promise<SourceInput[]> {
  const phrase = searchPhrase(question, intent);
  if (!phrase) return [];

  const results = await Promise.all(
    searchDomainQueries.map(async ({ domain, site }) => {
      const sources = await fetchSearchResults(site, phrase, signal);
      return sources
        .filter((source) => new URL(source.url).hostname.replace(/^www\./, "") === domain)
        .slice(0, 3);
    }),
  );
  return [...new Map(results.flat().map((source) => [source.url, source])).values()];
}

function sourceInput(url: string): SourceInput {
  return {
    title: titleFromUrl(url),
    url,
    category: categoryForSource(url),
    sourceType: "guide",
    credibilityRank: credibilityForSource(url),
  };
}

function readerUrl(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return host === "ign.com"
    ? `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`
    : url;
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<string | null> {
  const cached = pageCache.get(url);
  if (cached) return cached;

  const controller = new AbortController();
  const abortFromParent = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromParent();
  signal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("Live guide verification timed out.", "TimeoutError")),
    8_000,
  );

  try {
    const response = await fetch(readerUrl(url), {
      signal: controller.signal,
      headers: {
        "user-agent": "TartarusGuideRAG/0.1 (+live verification)",
        accept: "text/html,text/markdown,text/plain,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!response.ok) return null;
    const body = await response.text();
    if (!body.trim()) return null;
    pageCache.set(url, body);
    return body;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

function sectionScore(
  question: string,
  intent: LiveGuideIntent,
  title: string,
  text: string,
): number {
  const terms = semanticQueryTerms(question, intent);
  if (!terms.length) return 0;
  const normalizedTitle = title.toLowerCase();
  const normalizedText = text.toLowerCase();
  const coverage = terms.filter(
    (term) => normalizedTitle.includes(term) || normalizedText.includes(term),
  ).length;
  const titleCoverage = terms.filter((term) => normalizedTitle.includes(term)).length;
  const asksForAllSocialLinkCompletion =
    intent === "Social Links" &&
    /\b(?:all|every)\b/i.test(question) &&
    /\bsocial links?\b/i.test(question) &&
    /\b(?:max|maxx|maxed|maxxed|maxing|maxxing|complete|completion)\b/i.test(question);
  const completionBonus = asksForAllSocialLinkCompletion
    ? (/\bultimate personas?\b/.test(`${normalizedTitle} ${normalizedText}`) ? 8 : 0) +
      (/\ball 22 social links?\b/.test(normalizedText) ? 8 : 0)
    : 0;
  return coverage + titleCoverage * 1.5 + completionBonus;
}

export async function verifyAgainstLiveGuides(
  question: string,
  intent: LiveGuideIntent,
  seedUrls: string[] = [],
  signal?: AbortSignal,
): Promise<{
  chunks: ChunkMatch[];
  sources: Array<{ title: string; url: string; domain: string }>;
}> {
  const discovered = await discoverLiveGuideSources(question, intent, signal);
  const urls = [...new Set([
    ...discovered.map((source) => source.url),
    ...(guideUrls[intent] ?? []),
    ...seedUrls,
  ])]
    .filter(isAllowedSourceUrl)
    .slice(0, 6);
  if (!urls.length) return { chunks: [], sources: [] };

  const pages = await Promise.all(
    urls.map(async (url) => {
      const body = await fetchWithTimeout(url, signal);
      if (!body) return null;
      const source = sourceInput(url);
      return { source, page: extractContent(source, body) };
    }),
  );

  const candidates = pages
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .flatMap(({ source, page }) =>
      page.sections.map((section) => ({
        source,
        pageTitle: page.pageTitle,
        section,
        score: sectionScore(question, intent, section.title, section.text),
      })),
    )
    .filter((candidate) => candidate.score >= 2)
    .sort((a, b) => b.score - a.score);

  const selectedCandidates: typeof candidates = [];
  const perSource = new Map<string, number>();
  for (const candidate of candidates) {
    const count = perSource.get(candidate.source.url) ?? 0;
    if (count >= 3) continue;
    selectedCandidates.push(candidate);
    perSource.set(candidate.source.url, count + 1);
    if (selectedCandidates.length >= 10) break;
  }

  const chunks = selectedCandidates.map<ChunkMatch>((candidate, index) => {
    const chunkText = sanitizeUntrustedText(candidate.section.text, 2_400);
    const id = createHash("sha256")
      .update(`${candidate.source.url}\n${candidate.section.title}\n${chunkText}`)
      .digest("hex");
    return {
      id: `live-${id}`,
      source_id: `live-source-${index}`,
      section_title: candidate.section.title,
      chunk_text: chunkText,
      token_count: Math.ceil(chunkText.length / 4),
      similarity: Math.min(0.94, 0.62 + candidate.score * 0.025),
      source_title: candidate.pageTitle || candidate.source.title,
      source_url: candidate.source.url,
      source_domain: new URL(candidate.source.url).hostname.replace(/^www\./, ""),
      source_credibility_rank: candidate.source.credibilityRank,
    };
  });

  const sources = [...new Map(
    chunks.map((chunk) => [
      chunk.source_url,
      {
        title: chunk.source_title,
        url: chunk.source_url,
        domain: chunk.source_domain,
      },
    ]),
  ).values()];

  return { chunks, sources };
}
