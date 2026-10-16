import assert from "node:assert/strict";
import test from "node:test";
import {
  combatMembersJoinedBy,
  playerFloor,
  progressFactsForPrompt,
  tartarusBlockForFloor,
} from "./progressFacts";

test("floors map to the right Tartarus block", () => {
  assert.equal(tartarusBlockForFloor(18)?.block, "Thebel");
  assert.equal(tartarusBlockForFloor(20)?.block, "Thebel");
  assert.equal(tartarusBlockForFloor(23)?.block, "Arqa");
  assert.equal(tartarusBlockForFloor(118)?.block, "Yabbashah");
  assert.equal(tartarusBlockForFloor(230)?.block, "Adamah");
  assert.equal(tartarusBlockForFloor(999), null);
});

test("only members who have joined by the player's date are listed", () => {
  assert.deepEqual(combatMembersJoinedBy({ currentDate: "June 4" })?.members, ["Yukari", "Junpei", "Akihiko"]);
  assert.deepEqual(combatMembersJoinedBy({ currentDate: "June 13" })?.members, ["Yukari", "Junpei", "Akihiko", "Mitsuru"]);
  // Month only: assume the 1st, so August does not yet include Koromaru (Aug 8) or Ken (Aug 28).
  assert.deepEqual(combatMembersJoinedBy({ currentMonth: "August" })?.members, ["Yukari", "Junpei", "Akihiko", "Mitsuru", "Aigis"]);
  assert.equal(combatMembersJoinedBy({}), null);
});

test("floor comes from the profile or the message", () => {
  assert.equal(playerFloor({ tartarusFloor: "18F" }), 18);
  assert.equal(playerFloor({}, "im on floor 20 rn"), 20);
  assert.equal(playerFloor({}, "stuck around 33F"), 33);
  assert.equal(playerFloor({}, "level 14"), null);
});

test("prompt facts name the block and the joined roster, never a future member", () => {
  const facts = progressFactsForPrompt({ currentDate: "June 4", tartarusFloor: "18F" });
  assert.match(facts, /floor 18 is in the Thebel block \(floors 2-22\)/);
  assert.match(facts, /Yukari, Junpei, Akihiko\./);
  assert.doesNotMatch(facts, /Aigis|Koromaru|Ken|Shinjiro|Mitsuru/);
  assert.equal(progressFactsForPrompt({}), "");
});
