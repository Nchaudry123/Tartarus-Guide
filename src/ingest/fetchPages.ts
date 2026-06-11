import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import robotsParser from "robots-parser";
import { config, sleep } from "../db/client";
import { isAllowedSourceUrl } from "./sourceCatalog";
import type { SourceInput } from "../types/schema";

type RobotsCache = Map<string, ReturnType<typeof robotsParser>>;

const robotsCache: RobotsCache = new Map();

const cachePathForUrl = (url: string): string => {
  const hash = createHash("sha256").update(url).digest("hex");
  return path.join(config.rawCacheDir, `${hash}.txt`);
};

const isIgnUrl = (url: string): boolean =>
  new URL(url).hostname.replace(/^www\./, "") === "ign.com";

const readerUrl = (url: string): string =>
  `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;

function responseTargetAllowed(response: Response, sourceUrl: string, viaReader: boolean): boolean {
  try {
    const finalUrl = new URL(response.url);
    if (viaReader) {
      return finalUrl.protocol === "https:" && finalUrl.hostname === "r.jina.ai";
    }
    const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, "");
    const finalHost = finalUrl.hostname.replace(/^www\./, "");
    return isAllowedSourceUrl(finalUrl.toString()) && sourceHost === finalHost;
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getRobots(url: URL): Promise<ReturnType<typeof robotsParser>> {
  const robotsUrl = `${url.origin}/robots.txt`;
  const cached = robotsCache.get(robotsUrl);
  if (cached) {
    return cached;
  }

  const response = await fetch(robotsUrl, {
    headers: { "user-agent": config.ingestUserAgent },
  });
  const body = response.ok ? await response.text() : "";
  const parser = robotsParser(robotsUrl, body);
  robotsCache.set(robotsUrl, parser);
  return parser;
}

export async function fetchPage(source: SourceInput, force = false): Promise<string | null> {
  if (!isAllowedSourceUrl(source.url)) {
    console.warn(`Skipping URL outside the ingestion allowlist: ${source.url}`);
    return null;
  }

  await mkdir(config.rawCacheDir, { recursive: true });
  const cachePath = cachePathForUrl(source.url);

  if (!force) {
    try {
      return await readFile(cachePath, "utf8");
    } catch {
      // Cache miss; fetch below.
    }
  }

  const url = new URL(source.url);
  const robots = await getRobots(url);
  if (!robots.isAllowed(source.url, config.ingestUserAgent)) {
    console.warn(`Skipping disallowed URL from robots.txt: ${source.url}`);
    return null;
  }

  await sleep(config.ingestDelayMs);
  let viaReader = isIgnUrl(source.url);
  let response = await fetchWithTimeout(viaReader ? readerUrl(source.url) : source.url, {
    headers: {
      "user-agent": config.ingestUserAgent,
      accept: "text/html,text/markdown,text/plain,application/xhtml+xml",
    },
  });

  if (!response.ok && isIgnUrl(source.url)) {
    viaReader = false;
    response = await fetchWithTimeout(source.url, {
      headers: {
        "user-agent": config.ingestUserAgent,
        accept: "text/html,application/xhtml+xml",
      },
    });
  }

  if (!response.ok) {
    console.warn(`Skipping ${source.url}: HTTP ${response.status}`);
    return null;
  }
  if (!responseTargetAllowed(response, source.url, viaReader)) {
    console.warn(`Skipping unsafe redirect target for ${source.url}`);
    return null;
  }

  const html = await response.text();
  await writeFile(cachePath, html, "utf8");
  return html;
}

export async function fetchPages(sources: SourceInput[], force = false): Promise<Array<{ source: SourceInput; html: string }>> {
  const pages: Array<{ source: SourceInput; html: string }> = [];
  for (const source of sources) {
    const html = await fetchPage(source, force);
    if (html) {
      pages.push({ source, html });
    }
  }
  return pages;
}
