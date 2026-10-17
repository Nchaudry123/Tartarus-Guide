import assert from "node:assert/strict";
import test from "node:test";
import { createAnswerExtractor, createSentenceGate, salvageAnswerFromBrokenJson } from "./answerStream";

function feed(chunks: string[]): string {
  const extract = createAnswerExtractor();
  return chunks.map((chunk) => extract.push(chunk)).join("");
}

test("extracts the answer string from JSON as it streams, across chunk boundaries", () => {
  const json = JSON.stringify({
    answer: 'Junpei\'s weak to wind. Say "hi" to Yukari\nthen guard \\ heal ✨.',
    sections: [],
  });
  const expected = 'Junpei\'s weak to wind. Say "hi" to Yukari\nthen guard \\ heal ✨.';
  // Every possible split point, including inside the key and inside escape sequences.
  for (let size = 1; size <= 9; size += 1) {
    const chunks = json.match(new RegExp(`[\\s\\S]{1,${size}}`, "g")) ?? [];
    assert.equal(feed(chunks), expected, `chunk size ${size}`);
  }
});

test("ignores keys before the answer and stops at the end of the string", () => {
  const extract = createAnswerExtractor();
  assert.equal(extract.push('{"note": "x", "answer": "Hello'), "Hello");
  assert.equal(extract.done, false);
  assert.equal(extract.push(' there", "missingInfo": "more text"}'), " there");
  assert.equal(extract.done, true);
  assert.equal(extract.push("anything else"), "");
  assert.equal(feed(['{"answer": "caf\\u00e9 time"}']), "café time");
});

test("the gate releases whole sentences that pass the check", () => {
  const emitted: string[] = [];
  const gate = createSentenceGate({ accept: () => true, emit: (chunk) => emitted.push(chunk) });
  for (const piece of ["Junpei is ", "your frontliner. Keep Dia", " ready. Guard when it charges"]) gate.push(piece);
  assert.equal(emitted.join(""), "Junpei is your frontliner. Keep Dia ready. ");
  gate.finish();
  assert.equal(gate.released, "Junpei is your frontliner. Keep Dia ready. Guard when it charges");
  assert.equal(gate.halted, false);
});

test("the gate stops at the first sentence that fails the check", () => {
  const emitted: string[] = [];
  const gate = createSentenceGate({
    accept: (text) => !/Aigis/.test(text),
    emit: (chunk) => emitted.push(chunk),
  });
  gate.push("Bring Akihiko. ");
  gate.push("Or Aigis if you have her. ");
  gate.push("Keep Yukari healing. ");
  gate.finish();
  assert.deepEqual(emitted, ["Bring Akihiko. "]);
  assert.equal(gate.halted, true);
});

test("the gate allows one question and stops at a second", () => {
  const emitted: string[] = [];
  const gate = createSentenceGate({ accept: () => true, emit: (chunk) => emitted.push(chunk) });
  gate.push("Rough night? Junpei can be fragile. ");
  gate.push("What floor are you on? ");
  gate.finish();
  assert.equal(emitted.join(""), "Rough night? Junpei can be fragile. ");
  assert.equal(gate.halted, true);
});

test("list items stream line by line", () => {
  const emitted: string[] = [];
  const gate = createSentenceGate({ accept: () => true, emit: (chunk) => emitted.push(chunk) });
  gate.push("Try this:\n- Guard on charges\n- Keep Dia ready\n");
  gate.finish();
  assert.equal(emitted.join(""), "Try this:\n- Guard on charges\n- Keep Dia ready\n");
});

test("salvages the answer from malformed model JSON instead of showing raw JSON", () => {
  const broken =
    '{"answer": "Level up to at least 16 before June 8. Review your skills., sections": [], "tables": [], "confidence":0.8, "suggestedReplies": ["x"}';
  assert.equal(salvageAnswerFromBrokenJson(broken), "Level up to at least 16 before June 8. Review your skills.");
  assert.equal(salvageAnswerFromBrokenJson('{"answer": "Fine."}'), "Fine.");
  assert.equal(salvageAnswerFromBrokenJson("no json here"), null);
});
