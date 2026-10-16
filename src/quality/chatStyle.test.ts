import assert from "node:assert/strict";
import test from "node:test";
import { limitQuestions } from "./chatStyle";

test("keeps only the first question in a reply", () => {
  assert.equal(
    limitQuestions("Hey there! How's your journey through Tartarus going? Anything on your mind about the game so far?"),
    "Hey there! How's your journey through Tartarus going?",
  );
  assert.equal(
    limitQuestions("I feel you, it can be rough. What part is giving you trouble? Tartarus, bosses, or Social Links?"),
    "I feel you, it can be rough. What part is giving you trouble?",
  );
});

test("leaves statements, lists and single questions alone", () => {
  const reply = "Junpei is your frontliner.\n\n- Guard when an enemy charges\n- Keep Dia ready\n\nWhat's hitting him hardest?";
  assert.equal(limitQuestions(reply), reply);
  assert.equal(limitQuestions("Aim for level 18 before June 8."), "Aim for level 18 before June 8.");
  assert.equal(limitQuestions(""), "");
});
