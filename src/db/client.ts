import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const supabase = createClient(
  required("SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

export const config = {
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL ?? "https://api.openai.com/v1",
  embeddingApiKey: required("EMBEDDING_API_KEY"),
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? "1536"),
  chatBaseUrl: process.env.CHAT_BASE_URL ?? "https://api.openai.com/v1",
  chatApiKey: required("CHAT_API_KEY"),
  chatModel: process.env.CHAT_MODEL ?? "gpt-4.1-mini",
  ingestUserAgent:
    process.env.INGEST_USER_AGENT ??
    "TartarusGuideRAG/0.1 (+local development)",
  ingestDelayMs: Number(process.env.INGEST_DELAY_MS ?? "2500"),
  rawCacheDir: process.env.RAW_CACHE_DIR ?? ".cache/raw-pages",
};

export const normalizeName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/persona 3 reload|p3r/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function createEmbedding(input: string): Promise<number[]> {
  const response = await fetch(`${config.embeddingBaseUrl}/embeddings`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.embeddingApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input,
      dimensions: config.embeddingDimensions,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as {
    data?: Array<{ embedding: number[] }>;
  };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("Embedding response did not include an embedding.");
  }
  return embedding;
}

export async function createChatCompletion(
  messages: Array<{ role: "system" | "user"; content: string }>,
  options: { jsonObject?: boolean } = {},
): Promise<string> {
  const response = await fetch(`${config.chatBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.chatApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.chatModel,
      messages,
      temperature: 0.1,
      ...(options.jsonObject ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Chat response did not include content.");
  }
  return content;
}

export const embeddingToSqlVector = (embedding: number[]): string =>
  `[${embedding.join(",")}]`;
