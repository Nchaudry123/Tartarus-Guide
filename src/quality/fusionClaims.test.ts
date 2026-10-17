import assert from "node:assert/strict";
import test from "node:test";
import {
  checkFusionClaims,
  extractFusionClaims,
  fusionCorrectionNotes,
  withoutWrongFusionClaims,
  type FusionRecipeRow,
} from "./fusionClaims";

const names = ["Ananta", "Asura", "Alilat", "Ravana", "Futsunushi", "Pixie", "Jack Frost", "Jack", "Loki", "Angel", "Silky", "Unicorn", "Fortuna", "Orpheus"];

const claimsOf = (text: string) => extractFusionClaims(text, names).map((claim) => `${claim.ingredients.join(" + ")} -> ${claim.result}`);

test("extracts fusion claims in the common phrasings", () => {
  assert.deepEqual(claimsOf("Ananta and Asura can be fused to make Ravana."), ["Ananta + Asura -> Ravana"]);
  assert.deepEqual(claimsOf("Ananta + Asura fuses into Alilat."), ["Ananta + Asura -> Alilat"]);
  assert.deepEqual(claimsOf("Fuse Pixie with Jack Frost to get Loki."), ["Pixie + Jack Frost -> Loki"]);
  assert.deepEqual(claimsOf("You can make Alilat from Asura + Futsunushi."), ["Asura + Futsunushi -> Alilat"]);
  assert.deepEqual(claimsOf("To fuse Alilat, you can go with Ananta + Asura."), ["Ananta + Asura -> Alilat"]);
  assert.deepEqual(claimsOf("Fortuna = Angel + Silky + Unicorn."), ["Angel + Silky + Unicorn -> Fortuna"]);
  // "Jack Frost" is one Persona, not "Jack".
  assert.deepEqual(claimsOf("Pixie + Jack Frost makes Loki."), ["Pixie + Jack Frost -> Loki"]);
});

test("does not read lists or skill talk as fusion claims", () => {
  assert.deepEqual(claimsOf("Ananta and Asura are both strong, and Alilat is better."), []);
  assert.deepEqual(claimsOf("Bring Pixie, Jack Frost and Loki to cover elements."), []);
  assert.deepEqual(claimsOf("Ananta + Asura fuses into Alilat"), ["Ananta + Asura -> Alilat"]);
  assert.deepEqual(claimsOf("Orpheus is your starting Persona."), []);
});

const recipes: FusionRecipeRow[] = [
  { ingredients: ["Ananta", "Asura"], result: "Alilat", dlcMode: "any" },
  { ingredients: ["Angel", "Silky", "Unicorn"], result: "Fortuna", dlcMode: "any" },
  { ingredients: ["Pixie", "Jack Frost"], result: "Loki", dlcMode: "none" },
];

test("checks claims against recipes, order-insensitive and DLC-aware", () => {
  const checks = checkFusionClaims(
    extractFusionClaims("Ananta and Asura make Ravana. Unicorn + Angel + Silky makes Fortuna.", names),
    recipes,
    "none",
  );
  assert.deepEqual(checks.map((check) => [check.result, check.ok, check.actualResult]), [
    ["Ravana", false, "Alilat"],
    ["Fortuna", true, undefined],
  ]);
  assert.deepEqual(fusionCorrectionNotes(checks), ["Ananta + Asura fuses into Alilat, not Ravana."]);
  // A no-DLC recipe does not hold for a player with all DLC.
  const allDlc = checkFusionClaims(extractFusionClaims("Pixie + Jack Frost makes Loki.", names), recipes, "all");
  assert.equal(allDlc[0]!.ok, false);
});

test("drops the wrong sentence and states the verified result", () => {
  const text = "Ananta and Asura can be fused to make Ravana. Check your Persona list first.";
  const checks = checkFusionClaims(extractFusionClaims(text, names), recipes);
  assert.equal(withoutWrongFusionClaims(text, checks), "Ananta + Asura fuses into Alilat. Check your Persona list first.");
});

test("a result that isn't a Persona in the game is still a claim (and wrong)", () => {
  assert.deepEqual(claimsOf("Ananta and Asura can be fused to make Ravanna."), ["Ananta + Asura -> Ravanna"]);
  assert.deepEqual(claimsOf("Pixie + Jack Frost gives you Loki."), ["Pixie + Jack Frost -> Loki"]);
  assert.deepEqual(claimsOf("Ananta + Asura makes your party stronger."), []);
  assert.deepEqual(claimsOf("Ananta and Asura make a great pair."), []);
});
