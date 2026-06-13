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

