import { createHash } from "node:crypto";
import { TtlCache } from "../cache/ttlCache";
import { extractContent } from "../ingest/extractContent";
import {
  categoryForSource,
  credibilityForSource,
  isAllowedSourceUrl,
  titleFromUrl,
} from "../ingest/sourceCatalog";
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
      .match(/[a-z0-9]+/g)
      ?.filter((term) => term.length >= 3 && !ignoredTerms.has(term)) ?? [],
  )].slice(0, 14);
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

function sectionScore(question: string, title: string, text: string): number {
  const terms = queryTerms(question);
  if (!terms.length) return 0;
  const normalizedTitle = title.toLowerCase();
  const normalizedText = text.toLowerCase();
  const coverage = terms.filter(
    (term) => normalizedTitle.includes(term) || normalizedText.includes(term),
  ).length;
  const titleCoverage = terms.filter((term) => normalizedTitle.includes(term)).length;
  return coverage + titleCoverage * 1.5;
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
  const urls = [...new Set([...(guideUrls[intent] ?? []), ...seedUrls])]
    .filter(isAllowedSourceUrl)
    .slice(0, 4);
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
        score: sectionScore(question, section.title, section.text),
      })),
    )
    .filter((candidate) => candidate.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const chunks = candidates.map<ChunkMatch>((candidate, index) => {
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
