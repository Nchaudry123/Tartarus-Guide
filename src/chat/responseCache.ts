import { createHash } from "node:crypto";
import type { ChatRequest, ChatResponse, PlayerProfile } from "../../lib/types";
import { TtlCache } from "../cache/ttlCache";

const responseCache = new TtlCache<ChatResponse>(256, 15 * 60_000);

/** Stable, order-insensitive serialization of every profile field. */
function canonicalProfileValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : canonicalProfileValue(item)))
      .filter((item) => item !== "" && item !== undefined)
      .sort();
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined && entry !== "" && !(Array.isArray(entry) && !entry.length))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalProfileValue(entry)]),
    );
  }
  return typeof value === "string" ? value.trim() : value;
}

// Every profile field can change an answer (owned Personas drive fusion cards, the Tartarus
// block drives source ranking, tracked links and requests drive day plans), so the whole
// profile is part of the key. Omitting a field lets one player's personalised answer be
// served to another player who asked the same question.
function profileFingerprint(profile: PlayerProfile | undefined): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalProfileValue(profile ?? {})))
    .digest("hex")
    .slice(0, 16);
}

export function responseCacheKey(
  body: Partial<ChatRequest>,
  options: { isCasualMessage: (question: string) => boolean },
): string | null {
  if (body.debug || body.history?.length) {
    return null;
  }

  const question = body.question?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!question || question.length < 8 || options.isCasualMessage(question)) {
    return null;
  }

  return createHash("sha256")
    .update(`${question}\n${profileFingerprint(body.playerProfile)}`)
    .digest("hex");
}

export function getCachedChatResponse(key: string): ChatResponse | undefined {
  return responseCache.get(key);
}

export function setCachedChatResponse(key: string, response: ChatResponse): void {
  if (response.retrievalMode === "rag" && (response.confidence ?? 0) >= 0.72) {
    responseCache.set(key, response);
  }
}
