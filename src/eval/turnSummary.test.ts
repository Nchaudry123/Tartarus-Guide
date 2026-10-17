import assert from "node:assert/strict";
import test from "node:test";
import { summarizeTurns, type TurnSummaryInput } from "./turnSummary";

const turn = (id: string, extra: Partial<TurnSummaryInput["turns"][number]> = {}): TurnSummaryInput["turns"][number] => ({
  id,
  chat_mode: "agent",
  route: "agent",
  outcome: "answer",
  intent: "Fusion Advice",
  agent_tools: ["lookup_facts"],
  safety_net: false,
  agent_fallback: false,
  total_ms: 1500,
  llm_calls: 1,
  ...extra,
});

test("summarizes routes, outcomes, agent behaviour and thumbs-down rates", () => {
  const text = summarizeTurns({
    turns: [
      turn("a"),
      turn("b", { safety_net: true, agent_tools: ["lookup_facts", "search_guides"], total_ms: 4000 }),
      turn("c", { route: "rules", outcome: "clarify", agent_tools: [], total_ms: 300, llm_calls: 0 }),
      turn("d", { route: "agent_fallback", agent_fallback: true, outcome: "no_evidence", intent: "Boss Strategy" }),
    ],
    feedback: [{ turn_id: "a", rating: 1 }, { turn_id: "b", rating: -1 }, { turn_id: null, rating: -1 }],
  });
  assert.match(text, /Turns: 4/);
  assert.match(text, /agent\s+2\s+50\.0%.*1\/2/);
  assert.match(text, /Agent: 2 routed, safety net 50\.0%, fallbacks 1/);
  assert.match(text, /lookup_facts 2, search_guides 1/);
  assert.match(text, /Boss Strategy: 1 of 1/);
  assert.match(text, /Rated turns: 2 .* thumbs-down 1 \(50\.0%\)/);
});

test("an empty window says so", () => {
  assert.equal(summarizeTurns({ turns: [], feedback: [] }), "No turns logged in this window.");
});
