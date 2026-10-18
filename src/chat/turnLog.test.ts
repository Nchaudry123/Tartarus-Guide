import assert from "node:assert/strict";
import test from "node:test";
import type { ChatResponse } from "../../lib/types";
import { agentToolNames, currentTurnTrace, turnLogsEnabled, noteTurn, questionFingerprint, runWithTurnTrace, turnLogRow, type TurnTrace } from "./turnLog";

const reply = (extra: Partial<ChatResponse> = {}): ChatResponse => ({
  answer: "Swift Axle is weak to Electric.",
  sources: [{ title: "Game8", url: "https://game8.co/x", domain: "game8.co" } as ChatResponse["sources"][number]],
  confidence: 0.9,
  retrievalMode: "rag",
  companion: { intent: "Boss Strategy", profileUpdates: {}, followUpQuestions: [] },
  ...extra,
});
const trace = (extra: Partial<TurnTrace> = {}): TurnTrace => ({ agentTools: [], safetyNet: false, agentFallback: false, ...extra });
const row = (response: ChatResponse, t: TurnTrace, cached = false) =>
  turnLogRow({ turnId: "id-1", question: "What is  Swift Axle weak to?", chatMode: "agent", response, trace: t, cached, historyTurns: 2, totalMs: 1612.4, llmCalls: 2 });

test("agent tool names keep the tool and drop the arguments (which carry the player's words)", () => {
  assert.deepEqual(
    agentToolNames(['lookup_facts("Swift Axle weakness")', 'search_guides("swift axle")', 'safety-net search(["swift axle"])']),
    ["lookup_facts", "search_guides", "safety_net_search"],
  );
});

test("a turn row stores a fingerprint, never the question text", () => {
  const logged = row(reply(), trace({ route: "agent", agentTools: ["lookup_facts"] }));
  assert.equal(logged.question_fingerprint, questionFingerprint("what is swift axle weak to?"));
  assert.match(logged.question_fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(logged).toLowerCase().includes("swift axle"));
  assert.deepEqual(
    { route: logged.route, outcome: logged.outcome, sources: logged.source_count, ms: logged.total_ms, intent: logged.intent },
    { route: "agent", outcome: "answer", sources: 1, ms: 1612, intent: "Boss Strategy" },
  );
});

test("outcomes: blocked replies are no_evidence even if the draft was a question; errors and mocks win", () => {
  assert.equal(row(reply({ diagnostics: { groundingStatus: "insufficient" } }), trace({ outcome: "clarify" })).outcome, "no_evidence");
  assert.equal(row(reply(), trace({ outcome: "clarify" })).outcome, "clarify");
  assert.equal(row(reply({ retrievalMode: "error" }), trace({ outcome: "clarify" })).outcome, "error");
  const mock = row(reply({ retrievalMode: "mock" }), trace({ route: "agent" }));
  assert.deepEqual([mock.route, mock.outcome], ["mock", "mock"]);
});

test("routes: cache hits are cache, and turns answered before routing are handlers", () => {
  assert.equal(row(reply(), trace({ route: "cache" }), true).route, "cache");
  assert.equal(row(reply(), trace()).route, "handler");
});

test("noteTurn records into the active turn only", async () => {
  noteTurn({ route: "agent" });
  assert.equal(currentTurnTrace(), undefined);
  await runWithTurnTrace(async () => {
    noteTurn({ route: "agent", safetyNet: true });
    await Promise.resolve();
    assert.deepEqual(currentTurnTrace(), { agentTools: [], safetyNet: true, agentFallback: false, route: "agent" });
  });
});

test("turn logs are on for the production deployment only, unless overridden", () => {
  assert.equal(turnLogsEnabled({ VERCEL_ENV: "production" }), true);
  assert.equal(turnLogsEnabled({ VERCEL_ENV: "preview" }), false);
  assert.equal(turnLogsEnabled({}), false);
  assert.equal(turnLogsEnabled({ TURN_LOGS: "on" }), true);
  assert.equal(turnLogsEnabled({ VERCEL_ENV: "production", TURN_LOGS: "off" }), false);
});
