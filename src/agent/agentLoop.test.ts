import assert from "node:assert/strict";
import test from "node:test";
import { runAgentLoop, type AgentComplete, type AgentTool } from "./agentLoop";

const lookup: AgentTool = {
  name: "lookup_facts",
  description: "facts",
  parameters: { type: "object", properties: { query: { type: "string" } } },
  run: async (args) => ({ content: `Fact for ${String(args.query)}: weak to Electric.` }),
  progress: () => "Checking the facts",
};
const ask: AgentTool = {
  name: "ask_clarifying_question",
  description: "ask",
  parameters: { type: "object", properties: { question: { type: "string" } } },
  run: async (args) => ({ content: String(args.question), terminal: true }),
};

function scripted(replies: Array<{ content?: string; calls?: Array<[string, Record<string, unknown>]> }>): {
  complete: AgentComplete;
  seen: Array<{ toolChoice: string; lastMessage: string }>;
} {
  const seen: Array<{ toolChoice: string; lastMessage: string }> = [];
  let index = 0;
  const complete: AgentComplete = async (messages, _tools, options) => {
    const last = messages[messages.length - 1]!;
    seen.push({ toolChoice: options.toolChoice, lastMessage: String(last.content) });
    const reply = replies[Math.min(index++, replies.length - 1)]!;
    return {
      content: reply.content ?? null,
      toolCalls: (reply.calls ?? []).map(([name, args], i) => ({ id: `c${index}-${i}`, name, arguments: JSON.stringify(args) })),
    };
  };
  return { complete, seen };
}

test("calls a tool, feeds the result back, then answers", async () => {
  const { complete, seen } = scripted([
    { calls: [["lookup_facts", { query: "Swift Axle" }]] },
    { content: '{"answer":"Swift Axle is weak to Electric."}' },
  ]);
  const progress: string[] = [];
  const outcome = await runAgentLoop({ system: "s", user: "u", tools: [lookup, ask], complete, onProgress: (text) => progress.push(text) });
  assert.equal(outcome.kind, "answer");
  assert.equal(outcome.content, '{"answer":"Swift Axle is weak to Electric."}');
  assert.deepEqual(outcome.steps, [{ tool: "lookup_facts", args: { query: "Swift Axle" }, ok: true }]);
  assert.equal(seen[1]!.lastMessage, "Fact for Swift Axle: weak to Electric.");
  assert.deepEqual(progress, ["Checking the facts"]);
});

test("a clarifying question ends the loop and goes to the player", async () => {
  const { complete } = scripted([{ calls: [["ask_clarifying_question", { question: "Which floor are you on?" }]] }]);
  const outcome = await runAgentLoop({ system: "s", user: "u", tools: [lookup, ask], complete });
  assert.equal(outcome.kind, "terminal");
  assert.equal(outcome.content, "Which floor are you on?");
});

test("the last round disables tools so the model must answer", async () => {
  const { complete, seen } = scripted([
    { calls: [["lookup_facts", { query: "a" }]] },
    { calls: [["lookup_facts", { query: "b" }]] },
    { content: "final" },
  ]);
  const outcome = await runAgentLoop({ system: "s", user: "u", tools: [lookup], complete, maxSteps: 3 });
  assert.deepEqual(seen.map((step) => step.toolChoice), ["auto", "auto", "none"]);
  assert.equal(outcome.kind === "answer" && outcome.content, "final");
});

test("unknown tools and failing tools are reported back to the model, not thrown", async () => {
  const broken: AgentTool = { ...lookup, name: "broken", run: async () => { throw new Error("db down"); } };
  const { complete, seen } = scripted([
    { calls: [["nope", {}], ["broken", {}]] },
    { content: "ok" },
  ]);
  const outcome = await runAgentLoop({ system: "s", user: "u", tools: [broken], complete });
  assert.equal(outcome.kind, "answer");
  assert.match(seen[1]!.lastMessage, /broken tool failed: db down/);
  assert.deepEqual(outcome.steps.map((step) => [step.tool, step.ok]), [["nope", false], ["broken", false]]);
});

test("requireToolFirst forces a tool call on the first round only", async () => {
  const { complete, seen } = scripted([
    { calls: [["lookup_facts", { query: "a" }]] },
    { content: "done" },
  ]);
  await runAgentLoop({ system: "s", user: "u", tools: [lookup], complete, requireToolFirst: true });
  assert.deepEqual(seen.map((step) => step.toolChoice), ["required", "auto"]);
});
