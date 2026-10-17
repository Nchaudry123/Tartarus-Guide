import assert from "node:assert/strict";
import test from "node:test";
import { battleFactContradictions, battleFactsForPrompt } from "./battleFacts";

test("flags wrong party weaknesses and accepts the right ones", () => {
  assert.deepEqual(battleFactContradictions("Junpei is weak to Ice, so keep him away from Jack Frost."), [
    "Junpei is weak to Wind, not Ice.",
  ]);
  assert.equal(battleFactContradictions("Akihiko's weakness to fire makes this risky.").length, 1);
  assert.deepEqual(battleFactContradictions("Junpei's weak to wind and Akihiko is weak to Ice."), []);
  assert.deepEqual(battleFactContradictions("Yukari is weak to Electric but resists Wind."), []);
  assert.deepEqual(battleFactContradictions("Aigis is weak to Fire, so keep her back."), ["Aigis is weak to Electric, not Fire."]);
  // No claim about a member's weakness: nothing to check.
  assert.deepEqual(battleFactContradictions("Use Junpei's fire skills on enemies weak to Fire."), []);
});

test("flags Patra and Dekaja misuse but not correct descriptions", () => {
  assert.equal(battleFactContradictions("Use Patra to clear the enemy's buffs.").length, 1);
  assert.equal(battleFactContradictions("Dekaja will remove your party's debuffs.").length, 1);
  assert.deepEqual(battleFactContradictions("Patra won't remove buffs; use Dekaja for that."), []);
  assert.deepEqual(battleFactContradictions("Patra cures Charm and Confuse. Dekunda clears your debuffs."), []);
});

test("prompt facts list the known affinities and skill effects", () => {
  const facts = battleFactsForPrompt();
  assert.match(facts, /Junpei is weak to Wind/);
  assert.match(facts, /Patra cures Distress, Confuse, Charm and Rage/);
  assert.match(facts, /Dekaja removes the enemies' -kaja buffs/);
  assert.match(facts, /Aigis is weak to Electric/);
  assert.doesNotMatch(facts, /Shinjiro/);
});
