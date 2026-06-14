import assert from "node:assert/strict";
import test from "node:test";
import { checkChatRateLimit } from "./rateLimit";

test("quality gates can bypass rate limiting only with server-side debug enabled", async () => {
  const previousDisable = process.env.DISABLE_CHAT_RATE_LIMIT;
  const previousDebug = process.env.ALLOW_CHAT_DEBUG;
  process.env.DISABLE_CHAT_RATE_LIMIT = "true";
  process.env.ALLOW_CHAT_DEBUG = "true";

  try {
    const result = await checkChatRateLimit("quality-gate");
    assert.equal(result.allowed, true);
    assert.equal(result.retryAfter, 0);
  } finally {
    if (previousDisable === undefined) delete process.env.DISABLE_CHAT_RATE_LIMIT;
    else process.env.DISABLE_CHAT_RATE_LIMIT = previousDisable;
    if (previousDebug === undefined) delete process.env.ALLOW_CHAT_DEBUG;
    else process.env.ALLOW_CHAT_DEBUG = previousDebug;
  }
});
