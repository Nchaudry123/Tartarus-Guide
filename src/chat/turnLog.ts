import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { ChatResponse } from "../../lib/types";

/**
 * One log row per chat turn (chat_turn_logs): how it was routed and how it ended, so failure
 * patterns and slow turns in real traffic can be found. Deep code notes routing facts into the
 * active turn via AsyncLocalStorage, like request timing. Rows hold labels, counts and a
 * question fingerprint only: never question text, answers, tool arguments or keys.
 */

export type TurnRoute =
  /** A verified handler answered before any routing (silly, off-topic, fusion pair, ...). */
  | "handler"
  /** The hand-written rules decided the turn. */
  | "rules"
  /** The tool-calling agent routed it and gathered the evidence. */
  | "agent"
  /** The agent was asked but failed, so the standard routing ran. */
  | "agent_fallback"
  /** The LLM controller decided (pipeline mode with no matching rule). */
  | "controller"
  | "baseline"
  | "cache"
  | "external"
  | "mock";

export type TurnOutcome = "answer" | "direct_reply" | "clarify" | "no_evidence" | "error" | "mock";

export type TurnTrace = {
  route?: TurnRoute;
  outcome?: TurnOutcome;
  agentTools: string[];
  safetyNet: boolean;
  agentFallback: boolean;
};

const storage = new AsyncLocalStorage<TurnTrace>();

export function runWithTurnTrace<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ agentTools: [], safetyNet: false, agentFallback: false }, fn);
}

export function currentTurnTrace(): TurnTrace | undefined {
  return storage.getStore();
}

/** Records routing facts on the active turn; a no-op outside one. */
export function noteTurn(update: Partial<TurnTrace>): void {
  const trace = storage.getStore();
  if (trace) Object.assign(trace, update);
}

/** Tool names from agent step strings like `lookup_facts("...")`; arguments are dropped. */
export function agentToolNames(steps: string[]): string[] {
  return steps
    .map((step) => (/^safety-net\b/.test(step) ? "safety_net_search" : step.match(/^[a-z_]+/i)?.[0] ?? ""))
    .filter(Boolean)
    .slice(0, 12);
}

export function questionFingerprint(question: string): string {
  const normalized = question.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export type TurnLogRow = {
  id: string;
  question_fingerprint: string;
  chat_mode: string;
  route: TurnRoute;
  outcome: TurnOutcome;
  intent: string | null;
  agent_tools: string[];
  safety_net: boolean;
  agent_fallback: boolean;
  cached: boolean;
  confidence: number | null;
  source_count: number;
  history_turns: number;
  total_ms: number;
  llm_calls: number;
};

function outcomeOf(response: ChatResponse, trace: TurnTrace): TurnOutcome {
  if (response.retrievalMode === "error") return "error";
  if (response.retrievalMode === "mock") return "mock";
  // A blocked reply counts as missing evidence even if the model's draft was a question.
  if (response.diagnostics?.groundingStatus === "insufficient") return "no_evidence";
  return trace.outcome ?? "answer";
}

export function turnLogRow(input: {
  turnId: string;
  question: string;
  chatMode: string;
  response: ChatResponse;
  trace: TurnTrace;
  cached: boolean;
  historyTurns: number;
  totalMs: number;
  llmCalls: number;
}): TurnLogRow {
  const { response, trace } = input;
  const route: TurnRoute = input.cached
    ? "cache"
    : response.retrievalMode === "mock"
      ? "mock"
      : trace.route ?? "handler";
  return {
    id: input.turnId,
    question_fingerprint: questionFingerprint(input.question),
    chat_mode: input.chatMode.slice(0, 16),
    route,
    outcome: outcomeOf(response, trace),
    intent: response.companion?.intent?.slice(0, 80) ?? null,
    agent_tools: trace.agentTools,
    safety_net: trace.safetyNet,
    agent_fallback: trace.agentFallback,
    cached: input.cached,
    confidence: typeof response.confidence === "number" ? response.confidence : null,
    source_count: Math.min(response.sources?.length ?? 0, 32_000),
    history_turns: Math.min(input.historyTurns, 32_000),
    total_ms: Math.max(0, Math.round(input.totalMs)),
    llm_calls: Math.min(input.llmCalls, 32_000),
  };
}

export function turnLogsEnabled(): boolean {
  return process.env.TURN_LOGS !== "off";
}

/** Fire-and-forget insert; a logging failure never affects the reply. */
export function writeTurnLog(row: TurnLogRow): void {
  void import("../db/client")
    .then(({ supabase }) => supabase.from("chat_turn_logs").insert(row))
    .then((result) => {
      if (result?.error) console.error("Turn logging failed.");
    })
    .catch(() => console.error("Turn logging failed."));
}
