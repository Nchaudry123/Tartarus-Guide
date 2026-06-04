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

const curatedSources = [
  guide("Persona 3 Reload Walkthrough and Guides", "https://game8.co/games/Persona-3-Reload", "overview"),
  guide("Beginner's Guide to Persona 3 Reload", "https://game8.co/games/Persona-3-Reload/archives/435585", "beginner_strategy"),
  guide("Priestess Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/441827", "bosses"),
  guide("Swift Axle Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/443253", "bosses"),
  guide("Terminal Table Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/444325", "bosses"),
  guide("Nemean Beast Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/443644", "bosses"),
  guide("Lovers Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/441988", "bosses"),
  guide("Strength and Fortune Boss Guide", "https://game8.co/games/Persona-3-Reload/archives/445016", "bosses"),
];

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : curatedSources.length;

console.log(`Lite ingest starting with ${Math.min(limit, curatedSources.length)} source(s).`);

let totalChunks = 0;
let insertedChunks = 0;

for (const source of curatedSources.slice(0, limit)) {
  console.log(`Fetching ${source.title}...`);
  const html = await fetchPage(source.url);
  const text = htmlToText(html);
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

async function fetchPage(url) {
  await sleep(config.ingestDelayMs);
  const response = await fetchWithTimeout(url, {
    headers: {
      "user-agent": config.ingestUserAgent,
      accept: "text/html,application/xhtml+xml",
    },
  }, 30_000);

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status}`);
  }
  return response.text();
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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
