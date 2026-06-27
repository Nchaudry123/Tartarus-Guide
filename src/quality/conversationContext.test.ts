import assert from "node:assert/strict";
import test from "node:test";
import {
  isContextualConversationReply,
  normalizeConversationHistory,
  resolveConversationContext,
} from "./conversationContext";

test("keeps the original task through several clarification turns", () => {
  const history = [
    { role: "user" as const, content: "My party feels weak. I use Yukari, Junpei, and Akihiko." },
    { role: "assistant" as const, content: "What feels weakest: damage, survivability, or SP?" },
    { role: "user" as const, content: "I keep running out of SP halfway through Tartarus." },
    { role: "assistant" as const, content: "What level are you, and which Personas do you own?" },
    { role: "user" as const, content: "I am level 24 and have Jack Frost, Rakshasa, and Hua Po." },
    { role: "assistant" as const, content: "Do you want a party adjustment or a Persona recommendation first?" },
  ];
  const context = resolveConversationContext("A Persona recommendation first.", history);

  assert.equal(context.previousTopic, history[0].content);
  assert.match(context.analysisQuestion, /party feels weak/i);
  assert.match(context.analysisQuestion, /running out of SP/i);
  assert.match(context.analysisQuestion, /level 24/i);
  assert.match(context.analysisQuestion, /Persona recommendation first/i);
});

test("stops carrying context when the user starts a new topic", () => {
  const history = [
    { role: "user" as const, content: "How can I fuse Loki?" },
    { role: "assistant" as const, content: "Do you have Persona DLC enabled?" },
    { role: "user" as const, content: "No Persona DLC." },
    { role: "assistant" as const, content: "Here are two base-game routes. Do you have either pair?" },
    { role: "user" as const, content: "Who is the final boss? Full spoilers are fine." },
    { role: "assistant" as const, content: "The final boss is Nyx Avatar. Do you want preparation advice?" },
  ];
  const context = resolveConversationContext("Yes, how should I prepare?", history);

  assert.equal(context.previousTopic, history[4].content);
  assert.doesNotMatch(context.analysisQuestion, /fuse Loki/i);
  assert.match(context.analysisQuestion, /final boss/i);
});

test("resolves an ordinal fusion reply inside a longer thread", () => {
  const history = [
    { role: "user" as const, content: "How can I fuse Alilat?" },
    { role: "assistant" as const, content: "Do you use Persona DLC?" },
    { role: "user" as const, content: "No Persona DLC" },
    {
      role: "assistant" as const,
      content:
        "For your base-game fusion chart, two routes to Alilat are Ananta + Asura or Asura + Futsunushi. Do you have either pair?",
    },
  ];
  const context = resolveConversationContext("I have the second pair.", history);

  assert.match(context.analysisQuestion, /Asura and Futsunushi/);
  assert.match(context.analysisQuestion, /Alilat/);
});

test("resolves ordinal fusion replies from guided route wording", () => {
  const history = [
    { role: "user" as const, content: "How can I fuse Loki?" },
    {
      role: "assistant" as const,
      content:
        "For your base-game fusion chart, start with these two routes to Loki: Legion + Rangda or Naga Raja + Byakko. Do you have either pair?",
    },
  ];
  const context = resolveConversationContext("I have the first pair.", history);

  assert.match(context.analysisQuestion, /Legion and Rangda/);
  assert.match(context.analysisQuestion, /Loki/);
});

test("keeps skill follow-ups attached to the fused Persona", () => {
  const history = [
    { role: "user" as const, content: "How can I fuse Loki?" },
    { role: "assistant" as const, content: "Do you have Persona DLC enabled?" },
    { role: "user" as const, content: "No Persona DLC" },
    {
      role: "assistant" as const,
      content:
        "For your base-game fusion chart, start with these two routes to Loki: Abaddon + Sandalphon or Abaddon + Yurlungur. Do you have either pair?",
    },
    { role: "user" as const, content: "I have the first pair" },
    {
      role: "assistant" as const,
      content: "Perfect, you already own a working route. Fuse Abaddon + Sandalphon to make Loki.",
    },
  ];
  const context = resolveConversationContext("What skills should I keep?", history);

  assert.match(context.analysisQuestion, /skills should I keep for Loki/i);
  assert.match(context.analysisQuestion, /fuse Loki/i);
});

test("keeps recommendation button follow-ups attached to the prior pick", () => {
  const history = [
    { role: "user" as const, content: "What is the best Persona to use for the final boss?" },
    {
      role: "assistant" as const,
      content:
        "My first pick for the January 31 fight is Orpheus Telos. Lucifer is the safer alternative. Tell me which one you have unlocked.",
    },
  ];
  const context = resolveConversationContext("What level do I need?", history);

  assert.match(context.analysisQuestion, /best Persona to use for the final boss/i);
  assert.match(context.analysisQuestion, /latest follow-up is: What level do I need/i);
});

test("resolves a DLC answer without polluting the Persona target", () => {
  const history = [
    { role: "user" as const, content: "How do I fuse Loki?" },
    { role: "assistant" as const, content: "Do you have Persona DLC enabled?" },
  ];
  const context = resolveConversationContext("No Persona DLC", history);

  assert.equal(
    context.analysisQuestion,
    "How do I fuse Loki?\nNo Persona DLC; use the base-game fusion chart.",
  );
  assert.doesNotMatch(context.analysisQuestion, /active conversation goal/i);
});

test("carries prior options into a referential comparison", () => {
  const history = [
    { role: "user" as const, content: "Should Yukari or Ken be my main healer?" },
    {
      role: "assistant" as const,
      content:
        "Yukari is the more focused healer, while Ken mixes healing with broader utility. Which tradeoff fits your party?",
    },
  ];
  const context = resolveConversationContext(
    "Which one is better if I want the safer healer?",
    history,
  );

  assert.match(context.analysisQuestion, /Yukari/i);
  assert.match(context.analysisQuestion, /Ken/i);
  assert.match(context.analysisQuestion, /previous assistant reply being referenced/i);
  assert.match(context.analysisQuestion, /safer healer/i);
});

test("carries a disputed claim into the correction request", () => {
  const history = [
    { role: "user" as const, content: "Who is the final boss? Full spoilers are fine." },
    {
      role: "assistant" as const,
      content: "The final boss is the last Full Moon Shadow in November.",
    },
  ];
  const context = resolveConversationContext("That answer is wrong.", history);

  assert.match(context.analysisQuestion, /last Full Moon Shadow in November/i);
  assert.match(context.analysisQuestion, /That answer is wrong/i);
});

test("treats a detailed answer to the assistant as conversational context", () => {
  assert.equal(
    isContextualConversationReply(
      "The main problem is that I run out of SP halfway through Tartarus even when I avoid unnecessary fights.",
      "What is the main problem: damage, survivability, or SP?",
    ),
    true,
  );
  assert.equal(
    isContextualConversationReply(
      "Who is the final boss? Full spoilers are fine.",
      "Do you have Persona DLC enabled?",
    ),
    false,
  );
});

test("normalizes a larger history without duplicating the current question", () => {
  const history = Array.from({ length: 26 }, (_, index) => ({
    role: index % 2 ? ("assistant" as const) : ("user" as const),
    content: `Turn ${index}`,
  }));
  history.push({ role: "user", content: "Current question" });
  const normalized = normalizeConversationHistory("Current question", history);

  assert.equal(normalized.length, 23);
  assert.equal(normalized.at(-1)?.content, "Turn 25");
});
