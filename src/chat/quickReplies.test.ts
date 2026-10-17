import assert from "node:assert/strict";
import test from "node:test";
import { quickReply, quickReplyKind } from "./quickReplies";

test("recognizes pure pleasantries", () => {
  for (const [message, kind] of [
    ["hi", "greeting"],
    ["Hey!!", "greeting"],
    ["hello there", "greeting"],
    ["good morning", "greeting"],
    ["thanks!", "thanks"],
    ["thank you so much", "thanks"],
    ["ty", "thanks"],
    ["ok", "ack"],
    ["got it.", "ack"],
    ["bye", "bye"],
    ["good night", "bye"],
  ] as const) {
    assert.equal(quickReplyKind(message), kind, message);
  }
});

test("anything with real content still goes to the full chat path", () => {
  for (const message of [
    "hi, how do I beat Priestess?",
    "hey what is Dancing Hand weak to",
    "thanks, but what about Junpei?",
    "ok so what should I do on June 6",
    "hello can you help me fuse Jack Frost",
    "lol junpei keeps dying tho",
    "how are you",
  ]) {
    assert.equal(quickReplyKind(message), null, message);
  }
});

test("greetings use the player's situation when it is known", () => {
  const first = () => 0;
  const nearFullMoon = quickReply("hi", { currentMonth: "June", currentDate: "June 4" }, first);
  assert.equal(nearFullMoon?.answer, "Hey! 4 days until the June 8 full moon. What are we tackling tonight?");
  assert.ok(nearFullMoon?.suggestedPrompts.includes("How do I prep for the June 8 full moon?"));
  assert.equal(quickReply("hey", {}, first)?.answer, "Hey! What are we tackling tonight?");
});

test("replies are short, ask at most one question, and goodbyes have no chips", () => {
  for (const message of ["hi", "thanks", "ok", "bye"]) {
    for (const seed of [0, 0.3, 0.6, 0.99]) {
      const reply = quickReply(message, { currentMonth: "June", currentDate: "June 15" }, () => seed);
      assert.ok(reply, message);
      assert.ok(reply.answer.length <= 140, reply.answer);
      assert.ok((reply.answer.match(/\?/g) ?? []).length <= 1, reply.answer);
    }
  }
  assert.deepEqual(quickReply("bye")?.suggestedPrompts, []);
});
