import assert from "node:assert/strict";
import test from "node:test";
import {
  currentRequestTiming,
  recordTimingEvent,
  runWithRequestTiming,
  summarizeRequestTiming,
  timed,
} from "./requestTiming";

test("spans are recorded per request, including from parallel helpers", async () => {
  const summary = await runWithRequestTiming(async () => {
    await Promise.all([
      timed("embedding", async () => "vector"),
      timed("searchFacts", async () => []),
      timed("llm", async () => "{}", "answer (100 prompt chars)"),
    ]);
    recordTimingEvent("embedding-cache-hit");
    return summarizeRequestTiming(currentRequestTiming()!);
  });
  assert.equal(summary.llmCalls, 1);
  assert.equal(summary.embeddingCalls, 1);
  assert.deepEqual(
    summary.spans.map((span) => span.name).sort(),
    ["embedding", "embedding-cache-hit", "llm", "searchFacts"],
  );
});

test("timing is a no-op outside a timed request and never swallows errors", async () => {
  assert.equal(await timed("llm", async () => 42), 42);
  assert.equal(currentRequestTiming(), undefined);
  await assert.rejects(
    runWithRequestTiming(() => timed("llm", async () => {
      throw new Error("boom");
    })),
    /boom/,
  );
});
