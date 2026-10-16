import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isOffTopicQuestion, offTopicAnswer, offTopicSuggestedPrompts } from "./offTopic";

test("clearly non-P3R questions are off-topic", () => {
  for (const question of [
    "What's the best pizza topping?",
    "what is the best pizza topping",
    "Can you write me some code to sort a list in Python?",
    "Who will win the NBA finals?",
    "What's the capital of France?",
    "Should I buy bitcoin?",
    "Help me with my calculus homework",
  ]) {
    assert.equal(isOffTopicQuestion(question), true, question);
  }
});

test("game questions — including ones about in-game food or life — stay on-topic", () => {
  for (const question of [
    "Is there a pizza place in P3R?",
    "Does eating at Hagakure raise anything in the game?",
    "What is Dancing Hand weak to?",
    "How do I fuse Jack Frost?",
    "What should I do on June 6?",
    "Should I study for exams or hang out with Yukari?",
    "What's the weather like on July 7?",
    "When does summer vacation start?",
    "Who is the student council president?",
    "Where can I get coffee to raise Charm?",
  ]) {
    assert.equal(isOffTopicQuestion(question), false, question);
  }
});

test("brief small talk is not treated as off-topic", () => {
  for (const question of ["hi, how's it going", "hey", "thanks!", "how are you?", "what can you do?"]) {
    assert.equal(isOffTopicQuestion(question), false, question);
  }
});

test("off-topic reply is one short line with game-only suggestion chips", () => {
  const answer = offTopicAnswer();
  assert.ok(answer.length <= 160, "answer should stay short");
  assert.doesNotMatch(answer, /\n/);
  assert.match(answer, /Persona 3 Reload/);
  assert.doesNotMatch(answer, /pizza|topping|pepperoni/i);
  assert.ok(offTopicSuggestedPrompts.length >= 2);
  for (const prompt of offTopicSuggestedPrompts) {
    assert.equal(isOffTopicQuestion(prompt), false, prompt);
    assert.doesNotMatch(prompt, /pizza|pepperoni|topping/i);
  }
});

test("chat route gates off-topic questions before any retrieval or LLM call", () => {
  const route = readFileSync(new URL("../../app/api/chat/route.ts", import.meta.url), "utf8");
  const gate = route.indexOf("if (isOffTopicQuestion(question))");
  assert.ok(gate > 0, "off-topic gate missing from route");
  for (const later of ["dailyDashboardResponse(", "casualChatResponse(question", "retrieveContext("]) {
    const index = route.indexOf(later, gate);
    if (index > 0) assert.ok(index > gate, `${later} runs before the off-topic gate`);
  }
});
