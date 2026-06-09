import type { SourceInput } from "../types/schema";
import { fetchPage } from "./fetchPages";
import {
  canonicalizeSourceUrl,
  cleanSourceTitle,
  isIgnUrl,
  sourceFromLink,
  sourceQualityScore,
} from "./sourceCatalog";

type LinkCandidate = { title: string; url: string };

const inheritableCategories = new Set([
  "bosses",
  "social_links",
  "requests",
  "fusion",
  "personas",
  "enemies",
  "tartarus",
  "walkthrough",
  "classroom",
  "beginner_strategy",
]);

const markdownLinkPattern = /\[([^\]]{2,160})]\((https?:\/\/[^)\s]+|\/[^)\s]+)(?:\s+"[^"]*")?\)/g;
const hrefPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

function discoverLinks(page: string, baseUrl: string): LinkCandidate[] {
  const links: LinkCandidate[] = [];
  let match: RegExpExecArray | null;

  markdownLinkPattern.lastIndex = 0;
  while ((match = markdownLinkPattern.exec(page))) {
    const url = canonicalizeSourceUrl(match[2], baseUrl);
    if (url) links.push({ title: cleanSourceTitle(match[1]), url });
  }

  hrefPattern.lastIndex = 0;
  while ((match = hrefPattern.exec(page))) {
    const url = canonicalizeSourceUrl(match[1], baseUrl);
    if (url) links.push({ title: cleanSourceTitle(match[2]), url });
  }

  return [...new Map(links.map((link) => [link.url, link])).values()];
}

function selectBalancedSources(
  seeds: SourceInput[],
  discovered: SourceInput[],
  maxPages: number,
): SourceInput[] {
  const selected = new Map<string, SourceInput>();
  for (const seed of seeds) selected.set(seed.url, seed);

  const categories = [
    "enemies",
    "bosses",
    "social_links",
    "requests",
    "fusion",
    "personas",
    "tartarus",
    "walkthrough",
    "classroom",
    "beginner_strategy",
    "guide",
    "overview",
  ];
  const domains = ["ign.com", "game8.co"];
  const queues = new Map<string, SourceInput[]>();

  for (const source of discovered.sort((a, b) => sourceQualityScore(b) - sourceQualityScore(a))) {
    const domain = new URL(source.url).hostname.replace(/^www\./, "");
    const key = `${domain}:${source.category}`;
    const queue = queues.get(key) ?? [];
    queue.push(source);
    queues.set(key, queue);
  }

  while (selected.size < maxPages) {
    let added = false;
    for (const category of categories) {
      for (const domain of domains) {
        const queue = queues.get(`${domain}:${category}`);
        const source = queue?.shift();
        if (!source || selected.has(source.url)) continue;
        selected.set(source.url, source);
        added = true;
        if (selected.size >= maxPages) break;
      }
      if (selected.size >= maxPages) break;
    }
    if (!added) break;
  }

  return [...selected.values()].slice(0, maxPages);
}

export async function discoverSources(
  seeds: SourceInput[],
  options: { maxPages?: number; force?: boolean; maxDiscoveryPages?: number } = {},
): Promise<SourceInput[]> {
  const maxPages = Math.max(seeds.length, options.maxPages ?? 200);
  const maxDiscoveryPages = options.maxDiscoveryPages ?? Math.min(seeds.length + 64, 96);
  const byUrl = new Map(seeds.map((source) => [source.url, source]));
  const queue = [...seeds];
  const visited = new Set<string>();

  while (queue.length && visited.size < maxDiscoveryPages && byUrl.size < maxPages * 4) {
    const source = queue.shift();
    if (!source || visited.has(source.url)) continue;
    visited.add(source.url);

    try {
      const page = await fetchPage(source, options.force);
      if (!page) continue;
      for (const link of discoverLinks(page, source.url)) {
        if (byUrl.has(link.url)) continue;
        const discovered = sourceFromLink(link.title, link.url);
        if (
          discovered.category === "guide" &&
          isIgnUrl(source.url) &&
          inheritableCategories.has(source.category)
        ) {
          discovered.category = source.category;
        }
        if (sourceQualityScore(discovered) < 12) continue;
        byUrl.set(discovered.url, discovered);
        if (sourceQualityScore(discovered) >= 40) {
          queue.push(discovered);
        }
      }
    } catch (error) {
      console.warn(`Discovery skipped ${source.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const selected = selectBalancedSources(seeds, [...byUrl.values()], maxPages);
  console.log(
    `Discovery inspected ${visited.size} pages and selected ${selected.length} balanced IGN/Game8 sources.`,
  );
  return selected;
}
