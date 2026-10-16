import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCombatParty,
  partyRoleContradictions,
} from "./partyRoles";

test("removes Fuuka from saved frontline party data", () => {
  assert.deepEqual(
    normalizeCombatParty(["Fuuka", "Yukari", "Aigis", "Mitsuru", "Junpei"]),
    ["Yukari", "Aigis", "Mitsuru"],
  );
});

test("detects Fuuka as a swappable combat-slot option", () => {
  const contradictions = partyRoleContradictions({
    answer: "Use either Fuuka for support or Aigis for versatility.",
  });
  assert(contradictions.some((value) => /alternative/i.test(value)));
});


test("only a stated party updates the saved party", async () => {
  const { statedCombatParty } = await import("./partyRoles");
  assert.equal(statedCombatParty("lol junpei keeps dying tho"), undefined);
  assert.equal(statedCombatParty("should I give Yukari a new Persona?"), undefined);
  assert.deepEqual(statedCombatParty("floor 18, im level 14 with yukari and junpei"), ["Yukari", "Junpei"]);
  assert.deepEqual(statedCombatParty("I'm running Akihiko now"), ["Akihiko"]);
  // Returned in roster order, whatever order the player typed.
  assert.deepEqual(statedCombatParty("my party is Mitsuru, Junpei and Yukari"), ["Yukari", "Junpei", "Mitsuru"]);
});
