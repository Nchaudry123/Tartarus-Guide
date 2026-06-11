import "dotenv/config";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { TtlCache } from "../cache/ttlCache";

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
  embeddingProvider: process.env.EMBEDDING_PROVIDER ?? "huggingface",
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL ?? "https://router.huggingface.co/hf-inference/models",
  embeddingApiKey: required("EMBEDDING_API_KEY"),
  embeddingModel: process.env.EMBEDDING_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2",
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS ?? "384"),
  chatBaseUrl: process.env.CHAT_BASE_URL ?? "https://api.groq.com/openai/v1",
  chatApiKey: required("CHAT_API_KEY"),
  chatModel: process.env.CHAT_MODEL ?? "llama-3.3-70b-versatile",
  chatAppUrl: process.env.CHAT_APP_URL,
  chatAppName: process.env.CHAT_APP_NAME ?? "Tartarus Guide",
  factExtractionModel: process.env.FACT_EXTRACTION_MODEL ?? "qwen/qwen3-32b",
  factExtractionDelayMs: Number(process.env.FACT_EXTRACTION_DELAY_MS ?? "15000"),
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

const embeddingCache = new TtlCache<number[]>(384, 15 * 60_000);
const embeddingRequests = new Map<string, Promise<number[]>>();

function embeddingCacheKey(input: string): string {
  return createHash("sha256")
    .update(`${config.embeddingModel}\n${input.trim().replace(/\s+/g, " ").toLowerCase()}`)
    .digest("hex");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException("The request was aborted.", "AbortError");
  }
}

export async function createEmbedding(input: string, signal?: AbortSignal): Promise<number[]> {
  throwIfAborted(signal);
  const cacheKey = embeddingCacheKey(input);
  const cached = embeddingCache.get(cacheKey);
  if (cached) return [...cached];

  const pending = embeddingRequests.get(cacheKey);
  if (pending) {
    const embedding = await pending;
    throwIfAborted(signal);
    return [...embedding];
  }

  const request = createEmbeddingUncached(input, signal);
  embeddingRequests.set(cacheKey, request);
  try {
    const embedding = await request;
    embeddingCache.set(cacheKey, embedding);
    return [...embedding];
  } finally {
    embeddingRequests.delete(cacheKey);
  }
}

async function createEmbeddingUncached(input: string, signal?: AbortSignal): Promise<number[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    throwIfAborted(signal);
    try {
      if (config.embeddingProvider === "huggingface") {
        return await createHuggingFaceEmbedding(input, signal);
      }
      return await createOpenAiCompatibleEmbedding(input, signal);
    } catch (error) {
      throwIfAborted(signal);
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /\b(408|409|425|429|500|502|503|504)\b|abort|timeout|temporar/i.test(message);
      if (!retryable || attempt === 5) throw error;
      await sleep(Math.min(30_000, 1_500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function assertEmbeddingDimensions(embedding: number[]): number[] {
  if (embedding.length !== config.embeddingDimensions) {
    throw new Error(
      `Embedding dimension mismatch: expected ${config.embeddingDimensions}, received ${embedding.length}. ` +
        "Update EMBEDDING_DIMENSIONS and the Supabase vector schema to match the selected model.",
    );
  }
  return embedding;
}

function averageVectors(vectors: number[][]): number[] {
  if (!vectors.length || !vectors[0]?.length) {
    throw new Error("Embedding response did not include numeric vectors.");
  }
  const length = vectors[0].length;
  const totals = new Array<number>(length).fill(0);
  for (const vector of vectors) {
    if (vector.length !== length) {
      throw new Error("Embedding response included vectors with inconsistent dimensions.");
    }
    vector.forEach((value, index) => {
      totals[index] += value;
    });
  }
  return totals.map((value) => value / vectors.length);
}

function parseHuggingFaceEmbedding(value: unknown): number[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return value as number[];
  }

  if (Array.isArray(value) && value.every((item) => Array.isArray(item))) {
    const vectors = value as unknown[][];
    if (vectors.every((vector) => vector.every((item) => typeof item === "number"))) {
      return vectors.length === 1 ? (vectors[0] as number[]) : averageVectors(vectors as number[][]);
    }

    if (vectors.length === 1 && vectors[0].every((item) => Array.isArray(item))) {
      return averageVectors(vectors[0] as number[][]);
    }
  }

  throw new Error("Hugging Face embedding response used an unsupported shape.");
}

async function createHuggingFaceEmbedding(input: string, signal?: AbortSignal): Promise<number[]> {
  const modelPath = encodeURIComponent(config.embeddingModel).replaceAll("%2F", "/");
  const baseUrl = config.embeddingBaseUrl.replace(/\/$/, "");
  const endpoint = baseUrl.includes("/pipeline/feature-extraction")
    ? `${baseUrl}/${modelPath}`
    : `${baseUrl}/${modelPath}/pipeline/feature-extraction`;
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.embeddingApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        inputs: input,
        normalize: true,
        truncate: true,
      }),
    },
    30_000,
    signal,
  );

  if (!response.ok) {
    throw new Error(`Hugging Face embedding request failed: ${response.status} ${await response.text()}`);
  }

  return assertEmbeddingDimensions(parseHuggingFaceEmbedding(await response.json()));
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromParent();
  signal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new DOMException("The request timed out.", "TimeoutError")),
    timeoutMs,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

async function createOpenAiCompatibleEmbedding(input: string, signal?: AbortSignal): Promise<number[]> {
  const response = await fetchWithTimeout(
    `${config.embeddingBaseUrl}/embeddings`,
    {
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
    },
    30_000,
    signal,
  );

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
  return assertEmbeddingDimensions(embedding);
}

export async function createChatCompletion(
  messages: Array<{ role: "system" | "user"; content: string }>,
  options: {
    jsonObject?: boolean;
    model?: string;
    maxCompletionTokens?: number;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  const body = JSON.stringify({
    model: options.model ?? config.chatModel,
    messages,
    temperature: 0.1,
    ...(config.chatBaseUrl.includes("openrouter.ai")
      ? { reasoning: { effort: "none", exclude: true } }
      : {}),
    ...(options.maxCompletionTokens
      ? { max_completion_tokens: options.maxCompletionTokens }
      : {}),
    ...(options.jsonObject ? { response_format: { type: "json_object" } } : {}),
  });
  let response: Response | undefined;
  let errorText = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetchWithTimeout(
      `${config.chatBaseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.chatApiKey}`,
          "content-type": "application/json",
          ...(config.chatAppUrl ? { "HTTP-Referer": config.chatAppUrl } : {}),
          ...(config.chatAppName ? { "X-Title": config.chatAppName } : {}),
        },
        body,
      },
      45_000,
      options.signal,
    );

    if (response.ok) break;
    errorText = await response.text();
    if (response.status !== 429 || attempt === 2) {
      throw new Error(`Chat request failed: ${response.status} ${errorText}`);
    }

    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const messageDelay = errorText.match(/try again in ([\d.]+)(ms|s)/i);
    const parsedDelayMs = messageDelay
      ? Number(messageDelay[1]) * (messageDelay[2].toLowerCase() === "s" ? 1_000 : 1)
      : 0;
    const retryDelayMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1_000
      : parsedDelayMs;
    await Promise.race([
      sleep(Math.min(Math.max(retryDelayMs, 500), 15_000)),
      new Promise<never>((_, reject) => {
        if (options.signal?.aborted) {
          reject(options.signal.reason);
          return;
        }
        options.signal?.addEventListener(
          "abort",
          () => reject(options.signal?.reason),
          { once: true },
        );
      }),
    ]);
  }

  if (!response?.ok) {
    throw new Error(`Chat request failed after retries: ${response?.status ?? "unknown"} ${errorText}`);
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
