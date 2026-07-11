import { createHash } from "node:crypto";
import type { ChatRequest, ChatResponse, PlayerProfile } from "../../lib/types";
import { TtlCache } from "../cache/ttlCache";

const responseCache = new TtlCache<ChatResponse>(256, 15 * 60_000);

function profileFingerprint(profile: PlayerProfile | undefined): string {
  const value = profile ?? {};
  return createHash("sha256")
    .update(
      JSON.stringify({
        currentMonth: value.currentMonth ?? "",
        currentDate: value.currentDate ?? "",
        currentLevel: value.currentLevel ?? "",
        difficulty: value.difficulty ?? "",
        activeParty: value.activeParty ?? [],
        dlcOwnership: value.dlcOwnership ?? "",
        spoilerPreference: value.spoilerPreference ?? "",
      }),
    )
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
