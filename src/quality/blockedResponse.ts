import type { ChatResponse } from "../../lib/types";

/**
 * Fields a blocked (grounding-gated) response may carry over from the draft.
 * Everything else — sections, tables, sources and every card type
 * (recommendation, fusionWorkshop, dailyDashboard, bossPrep, …) — is dropped,
 * so a "I won't invent that" answer can never render a confident card under it.
 * This is an allowlist on purpose: a new card field added to ChatResponse is
 * stripped automatically instead of leaking through a `...response` spread.
 */
const blockedResponseCarryOver = ["retrievalMode", "companion", "diagnostics"] as const;

export type BlockedResponseOverrides = Pick<ChatResponse, "answer"> &
  Partial<Pick<ChatResponse, "confidence" | "missingInfo" | "companion" | "diagnostics">>;

export function blockedChatResponse(
  draft: ChatResponse,
  overrides: BlockedResponseOverrides,
): ChatResponse {
  const carried: Partial<ChatResponse> = {};
  for (const key of blockedResponseCarryOver) {
    if (draft[key] !== undefined) {
      (carried as Record<string, unknown>)[key] = draft[key];
    }
  }
  return {
    ...carried,
    ...overrides,
    sections: [],
    tables: [],
    sources: [],
  };
}

/** True when a response carries any rendered card or supporting content beyond the answer line. */
export function hasAnswerCardContent(response: ChatResponse): boolean {
  return Boolean(
    response.sections?.length ||
      response.tables?.length ||
      response.sources?.length ||
      response.bossPrep ||
      response.fusionWorkshop ||
      response.dailyDashboard ||
      response.recommendation,
  );
}
