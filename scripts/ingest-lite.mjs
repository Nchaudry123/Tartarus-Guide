import { createHash } from "node:crypto";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const config = {
  supabaseUrl: required("SUPABASE_URL").replace(/\/$/, ""),
  supabaseKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  embeddingKey: required("EMBEDDING_API_KEY"),
  embeddingBaseUrl: (process.env.EMBEDDING_BASE_URL || "https://router.huggingface.co/hf-inference/models").replace(/\/$/, ""),
  embeddingModel: process.env.EMBEDDING_MODEL || "sentence-transformers/all-MiniLM-L6-v2",
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS || "384"),
  ingestDelayMs: Number(process.env.INGEST_DELAY_MS || "2500"),
  ingestUserAgent: process.env.INGEST_USER_AGENT || "TartarusGuideRAG/0.1 (+local development)",
};

const guide = (title, url, category, credibilityRank = 20) => ({
  title,
  url,
  category,
  source_type: "guide",
  credibility_rank: credibilityRank,
});

const ign = (title, path, category) =>
  guide(title, `https://www.ign.com/wikis/persona-3-reload/${path}`.replace(/\/$/, ""), category, 10);

const game8 = (title, url, category) => guide(title, url, category, 20);

const curatedSources = [
  ign("Persona 3 Reload Wiki Guide", "", "overview"),
  ign("Walkthrough", "Walkthrough", "walkthrough"),
  ign("Tartarus", "Tartarus", "tartarus"),
  ign("Boss Guides", "Boss_Guides", "bosses"),
  ign("Social Links Guide", "Social_Links_Guide", "social_links"),
  ign("Elizabeth Requests Guide", "Elizabeth's_Requests_Guide", "requests"),
  ign("Persona Fusion", "Persona_Fusion", "fusion"),
  ign("Personas", "Personas", "personas"),
  ign("Enemies", "Enemies", "enemies"),
  ign("Beginner Tips", "Beginner's_Guide_-_Tips_and_Tricks", "beginner_strategy"),
  game8("Persona 3 Reload Walkthrough and Guides", "https://game8.co/games/Persona-3-Reload", "overview"),
  game8("Beginner's Guide to Persona 3 Reload", "https://game8.co/games/Persona-3-Reload/archives/435585", "beginner_strategy"),
  game8("Priestess Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/441827", "bosses"),
  game8("Swift Axle Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/443253", "bosses"),
  game8("Terminal Table Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/444325", "bosses"),
  game8("Nemean Beast Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/443644", "bosses"),
  game8("Lovers Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/441988", "bosses"),
  game8("Strength and Fortune Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/445016", "bosses"),
];

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const maxPagesArg = process.argv.find((arg) => arg.startsWith("--max-pages="));
const discover = !process.argv.includes("--no-discover");
const listSourcesOnly = process.argv.includes("--list-sources");
const limit = limitArg ? Number(limitArg.split("=")[1]) : curatedSources.length;
const maxPages = maxPagesArg ? Number(maxPagesArg.split("=")[1]) : 80;

const pageCache = new Map();
const sources = discover ? await discoverSources(curatedSources.slice(0, limit), maxPages) : curatedSources.slice(0, limit);

console.log(`Lite ingest starting with ${sources.length} source(s).`);

if (listSourcesOnly) {
  for (const source of sources) {
    console.log(`${source.credibility_rank} ${source.category} ${source.title} ${source.url}`);
  }
  process.exit(0);
}

let totalChunks = 0;
let insertedChunks = 0;

for (const source of sources) {
  console.log(`Fetching ${source.title}...`);
  const page = await fetchPage(source.url);
  const text = pageToText(page);
  if (text.length < 500 || isBlockedOrEmpty(text)) {
    console.log(`Skipping ${source.title}; fetched text was empty or blocked.`);
    continue;
  }
  const chunks = chunkText(text, source);
  totalChunks += chunks.length;
  console.log(`Prepared ${chunks.length} chunks from ${source.title}.`);

  const sourceId = await upsertSource(source);
  for (const chunk of chunks) {
    if (await chunkExists(chunk.hash)) continue;
    const embedding = await createEmbedding(chunk.text);
    await insertChunk(sourceId, chunk, embedding);
    insertedChunks += 1;
    if (insertedChunks % 10 === 0) {
      console.log(`Inserted ${insertedChunks} chunks...`);
    }
  }
}

console.log(`Lite ingest complete. Prepared ${totalChunks}; inserted ${insertedChunks}.`);

async function discoverSources(seeds, maxPages) {
  const byUrl = new Map();
  const queue = [...seeds];

  for (const source of seeds) {
    byUrl.set(source.url, source);
  }

  while (queue.length && byUrl.size < maxPages) {
    const source = queue.shift();
    const page = await fetchPage(source.url);
    const links = discoverLinks(page, source.url);
    for (const link of links) {
      if (byUrl.has(link.url)) continue;
      const discovered = guide(link.title || titleFromUrl(link.url), link.url, categoryForUrl(link.url), credibilityForUrl(link.url));
      byUrl.set(discovered.url, discovered);
      queue.push(discovered);
      if (byUrl.size >= maxPages) break;
    }
  }

  return [...byUrl.values()].slice(0, maxPages);
}

async function fetchPage(url) {
  if (pageCache.has(url)) return pageCache.get(url);

  await sleep(config.ingestDelayMs);
  let response = await fetchWithTimeout(fetchUrlForSource(url), {
    headers: {
      "user-agent": config.ingestUserAgent,
      accept: "text/html,text/markdown,application/xhtml+xml",
    },
  }, 30_000);

  if (!response.ok && isIgnUrl(url)) {
    response = await fetchWithTimeout(readerUrl(url), {
      headers: {
        "user-agent": config.ingestUserAgent,
        accept: "text/markdown,text/plain",
      },
    }, 30_000);
  }

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status}`);
  }
  const text = await response.text();
  pageCache.set(url, text);
  return text;
}

function fetchUrlForSource(url) {
  return isIgnUrl(url) ? readerUrl(url) : url;
}

function readerUrl(url) {
  return `https://r.jina.ai/http://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
}

function pageToText(page) {
  return page
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/\[[^\]]*\]\((?:https?:)?\/\/[^)]*\)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function discoverLinks(page, baseUrl) {
  const links = [];
  const markdownLinkPattern = /\[([^\]]{2,120})\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\s*(?:"[^"]*")?\)/g;
  const hrefPattern = /href=["']([^"']+)["'][^>]*>([^<]{2,120})</g;

  for (const pattern of [markdownLinkPattern, hrefPattern]) {
    let match;
    while ((match = pattern.exec(page))) {
      const rawTitle = pattern === markdownLinkPattern ? match[1] : match[2];
      const rawUrl = pattern === markdownLinkPattern ? match[2] : match[1];
      const url = normalizeDiscoveredUrl(rawUrl, baseUrl);
      if (!url || !isAllowedSourceUrl(url)) continue;
      links.push({ title: cleanTitle(rawTitle), url });
    }
  }

  return dedupeLinks(links);
}

function normalizeDiscoveredUrl(rawUrl, baseUrl) {
  try {
    const url = new URL(rawUrl.replace(/&amp;/g, "&"), baseUrl);
    url.hash = "";
    url.search = "";
    if (url.hostname === "ign.com") url.hostname = "www.ign.com";
    if (url.hostname === "www.ign.com" || url.hostname === "game8.co") url.protocol = "https:";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isAllowedSourceUrl(url) {
  const path = new URL(url).pathname.toLowerCase();
  if (path.includes("topcontributors") || path.includes("recentchanges")) return false;
  return isIgnUrl(url) || isGame8Url(url);
}

function isIgnUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.ign.com" && parsed.pathname.startsWith("/wikis/persona-3-reload");
  } catch {
    return false;
  }
}

function isGame8Url(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "game8.co" && parsed.pathname.startsWith("/games/Persona-3-Reload");
  } catch {
    return false;
  }
}

function dedupeLinks(links) {
  const seen = new Set();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function categoryForUrl(url) {
  const path = decodeURIComponent(new URL(url).pathname).toLowerCase();
  if (path.includes("boss")) return "bosses";
  if (path.includes("social") || path.includes("linked")) return "social_links";
  if (path.includes("request") || path.includes("elizabeth")) return "requests";
  if (path.includes("tartarus") || path.includes("floor")) return "tartarus";
  if (path.includes("walkthrough") || path.includes("month") || path.includes("calendar")) return "walkthrough";
  if (path.includes("classroom") || path.includes("exam")) return "classroom";
  if (path.includes("beginner") || path.includes("tips")) return "beginner_strategy";
  if (path.includes("fusion") || path.includes("fuse") || path.includes("persona")) return "personas";
  if (path.includes("enemy") || path.includes("shadow") || path.includes("hand")) return "enemies";
  return "guide";
}

function credibilityForUrl(url) {
  return isIgnUrl(url) ? 10 : 20;
}

function cleanTitle(title) {
  return title.replace(/\s+/g, " ").replace(/^#+\s*/, "").trim();
}

function titleFromUrl(url) {
  const segment = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "Persona 3 Reload Guide");
  return segment.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isBlockedOrEmpty(text) {
  return (
    !text ||
    text.includes("Error 403") ||
    text.includes("x-amzn-waf-action") ||
    text.includes("Target URL returned error 404") ||
    /^Title:\s*URL Source:/i.test(text)
  );
}

function chunkText(text, source) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  const size = 420;
  const overlap = 60;

  for (let start = 0; start < words.length; start += size - overlap) {
    const slice = words.slice(start, start + size);
    if (slice.length < 80) continue;
    const chunkTextValue = slice.join(" ");
    chunks.push({
      text: chunkTextValue,
      tokenCount: Math.ceil(slice.length * 1.3),
      sectionTitle: source.title,
      hash: sha256(`${source.url}:${start}:${chunkTextValue}`),
    });
  }

  return chunks;
}

async function upsertSource(source) {
  const body = {
    title: source.title,
    url: source.url,
    domain: new URL(source.url).hostname.replace(/^www\./, ""),
    category: source.category,
    source_type: source.source_type,
    credibility_rank: source.credibility_rank,
    last_checked: new Date().toISOString(),
  };
  const data = await supabaseFetch(
    "/rest/v1/sources?on_conflict=url&select=id",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(body),
    },
  );
  return data[0].id;
}

async function chunkExists(hash) {
  const data = await supabaseFetch(`/rest/v1/chunks?select=id&chunk_hash=eq.${encodeURIComponent(hash)}&limit=1`);
  return data.length > 0;
}

async function insertChunk(sourceId, chunk, embedding) {
  await supabaseFetch("/rest/v1/chunks", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      source_id: sourceId,
      section_title: chunk.sectionTitle,
      chunk_text: chunk.text,
      chunk_hash: chunk.hash,
      token_count: chunk.tokenCount,
      embedding: `[${embedding.join(",")}]`,
    }),
  });
}

async function createEmbedding(input) {
  const modelPath = encodeURIComponent(config.embeddingModel).replaceAll("%2F", "/");
  const response = await fetchWithTimeout(
    `${config.embeddingBaseUrl}/${modelPath}/pipeline/feature-extraction`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.embeddingKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        inputs: input,
        normalize: true,
        truncate: true,
      }),
    },
    30_000,
  );

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.status} ${await response.text()}`);
  }
  const embedding = await response.json();
  if (!Array.isArray(embedding) || embedding.length !== config.embeddingDimensions) {
    throw new Error(`Unexpected embedding dimensions: ${Array.isArray(embedding) ? embedding.length : "unknown"}`);
  }
  return embedding;
}

async function supabaseFetch(pathname, init = {}) {
  const response = await fetchWithTimeout(`${config.supabaseUrl}${pathname}`, {
    ...init,
    headers: {
      apikey: config.supabaseKey,
      authorization: `Bearer ${config.supabaseKey}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  }, 30_000);

  if (!response.ok) {
    throw new Error(`Supabase failed: ${response.status} ${await response.text()}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
