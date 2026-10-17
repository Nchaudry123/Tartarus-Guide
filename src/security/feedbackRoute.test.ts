import assert from "node:assert/strict";
import test from "node:test";
import { FeedbackRequestSchema } from "./chatSecurity";
import { POST } from "../../app/api/feedback/route";

const valid = { rating: -1, question: "lol junpei keeps dying tho", answer: "Give him a Persona with Endure." };

test("feedback schema accepts a rating with question and answer, and rejects anything else", () => {
  assert.equal(FeedbackRequestSchema.safeParse(valid).success, true);
  assert.equal(FeedbackRequestSchema.safeParse({ ...valid, rating: 0 }).success, false);
  assert.equal(FeedbackRequestSchema.safeParse({ ...valid, answer: "" }).success, false);
  assert.equal(FeedbackRequestSchema.safeParse({ ...valid, extra: "nope" }).success, false);
  assert.equal(FeedbackRequestSchema.safeParse({ ...valid, history: Array(7).fill({ role: "user", content: "hi" }) }).success, false);
  assert.equal(FeedbackRequestSchema.safeParse({ ...valid, note: "x".repeat(501) }).success, false);
  assert.equal(FeedbackRequestSchema.safeParse({ ...valid, turnId: "6f1c2a7e-3b4d-4c5e-9f60-718293a4b5c6" }).success, true);
  assert.equal(FeedbackRequestSchema.safeParse({ ...valid, turnId: "not-a-uuid" }).success, false);
});

test("feedback route rejects bad bodies and foreign origins without saving or leaking details", async () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    POST(new Request("http://localhost/api/feedback", { method: "POST", headers: { "content-type": "application/json", ...headers }, body }));
  const badJson = await post("{nope");
  assert.equal(badJson.status, 400);
  assert.deepEqual(await badJson.json(), { ok: false });
  const badField = await post(JSON.stringify({ ...valid, rating: 5 }));
  assert.equal(badField.status, 400);
  const foreign = await post(JSON.stringify(valid), { origin: "https://evil.example" });
  assert.equal(foreign.status, 403);
  assert.deepEqual(await foreign.json(), { ok: false });
});
