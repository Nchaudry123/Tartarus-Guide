import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped latency spans. Deep helpers (embeddings, chat completions, vector RPCs,
 * live-guide fetches) record into whichever request is active via AsyncLocalStorage, so no
 * signature has to thread a timer through. Recording is a no-op outside a timed request.
 * Spans carry labels and durations only — never prompts, answers, keys or URLs with secrets.
 */
export type TimingSpan = {
  name: string;
  startMs: number;
  durationMs: number;
  detail?: string;
};

export type RequestTiming = {
  startedAt: number;
  spans: TimingSpan[];
};

const storage = new AsyncLocalStorage<RequestTiming>();

export function runWithRequestTiming<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ startedAt: performance.now(), spans: [] }, fn);
}

export function currentRequestTiming(): RequestTiming | undefined {
  return storage.getStore();
}

export async function timed<T>(name: string, fn: () => Promise<T>, detail?: string): Promise<T> {
  const timing = storage.getStore();
  if (!timing) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    timing.spans.push({
      name,
      startMs: Math.round(start - timing.startedAt),
      durationMs: Math.round(performance.now() - start),
      ...(detail ? { detail } : {}),
    });
  }
}

export function recordTimingEvent(name: string, detail?: string): void {
  const timing = storage.getStore();
  if (!timing) return;
  timing.spans.push({
    name,
    startMs: Math.round(performance.now() - timing.startedAt),
    durationMs: 0,
    ...(detail ? { detail } : {}),
  });
}

export function summarizeRequestTiming(timing: RequestTiming): {
  totalMs: number;
  llmCalls: number;
  llmMs: number;
  embeddingCalls: number;
  spans: TimingSpan[];
} {
  const spans = [...timing.spans].sort((a, b) => a.startMs - b.startMs);
  const llm = spans.filter((span) => span.name === "llm");
  return {
    totalMs: Math.round(performance.now() - timing.startedAt),
    llmCalls: llm.length,
    llmMs: llm.reduce((sum, span) => sum + span.durationMs, 0),
    embeddingCalls: spans.filter((span) => span.name === "embedding").length,
    spans,
  };
}

export function requestTimingEnabled(): boolean {
  return process.env.CHAT_TIMING === "true";
}
