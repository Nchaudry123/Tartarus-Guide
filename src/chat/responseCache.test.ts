import assert from "node:assert/strict";
import test from "node:test";
import {
  getCachedChatResponse,
  responseCacheKey,
  setCachedChatResponse,
} from "./responseCache";
import type { ChatResponse } from "../../lib/types";

const isCasualMessage = (question: string) =>
  /^(hi|hello|thanks|thank you)[.!?]*$/i.test(question.trim());

test("caches standalone factual questions and ignores small talk", () => {
  const key = responseCacheKey(
    { question: "What is Dancing Hand weak to?" },
    { isCasualMessage },
  );
  assert.ok(key);

  const casual = responseCacheKey({ question: "hello" }, { isCasualMessage });
  assert.equal(casual, null);

  const withHistory = responseCacheKey(
    {
      question: "What is Dancing Hand weak to?",
      history: [{ role: "user", content: "hi" }, { role: "assistant", content: "hey" }],
    },
    { isCasualMessage },
  );
  assert.equal(withHistory, null);
});

test("profile changes produce distinct cache keys", () => {
  const a = responseCacheKey(
    { question: "What should I do today?", playerProfile: { currentMonth: "June" } },
    { isCasualMessage },
  );
  const b = responseCacheKey(
    { question: "What should I do today?", playerProfile: { currentMonth: "July" } },
    { isCasualMessage },
  );
  assert.ok(a && b);
  assert.notEqual(a, b);
});

test("stores high-confidence rag answers only", () => {
  const key = responseCacheKey(
    { question: "What is Dancing Hand weak to?" },
    { isCasualMessage },
  );
  assert.ok(key);

  setCachedChatResponse(key, {
    answer: "weak to Fire",
    sections: [],
    sources: [],
    confidence: 0.5,
    missingInfo: "",
    retrievalMode: "rag",
  } as ChatResponse);
  assert.equal(getCachedChatResponse(key), undefined);

  setCachedChatResponse(key, {
    answer: "weak to Fire",
    sections: [],
    sources: [],
    confidence: 0.95,
    missingInfo: "",
    retrievalMode: "rag",
  } as ChatResponse);
  assert.equal(getCachedChatResponse(key)?.answer, "weak to Fire");
});
