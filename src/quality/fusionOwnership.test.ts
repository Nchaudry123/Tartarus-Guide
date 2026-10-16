import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fusionIngredientLabel, fusionOwnershipChecker } from "./fusionOwnership";

test("with an empty Player Memory no ingredient is labelled In Player Memory", () => {
  const ownership = fusionOwnershipChecker({ savedOwnedPersonas: [], mentionedOwnedPersonas: [] });
  for (const name of ["Apsaras", "Pixie", "Berith"]) {
    const result = ownership(name);
    assert.deepEqual(result, { owned: false, inPlayerMemory: false });
    assert.equal(fusionIngredientLabel(result), "Ingredient");
  }
});

test("only Personas saved in Player Memory get the In Player Memory label", () => {
  const ownership = fusionOwnershipChecker({ savedOwnedPersonas: ["pixie"], mentionedOwnedPersonas: [] });
  assert.equal(fusionIngredientLabel(ownership("Pixie")), "In Player Memory");
  assert.equal(fusionIngredientLabel(ownership("Apsaras")), "Ingredient");
});

test("a Persona the player mentioned in chat counts as owned but is not claimed as saved", () => {
  const ownership = fusionOwnershipChecker({ savedOwnedPersonas: [], mentionedOwnedPersonas: ["Apsaras"] });
  const apsaras = ownership("Apsaras");
  assert.equal(apsaras.owned, true);
  assert.equal(apsaras.inPlayerMemory, false);
  assert.equal(fusionIngredientLabel(apsaras), "Ingredient");
});

test("fusion route takes saved ownership from the request profile, not the model-merged profile", () => {
  const route = readFileSync(new URL("../../app/api/chat/route.ts", import.meta.url), "utf8");
  assert.match(route, /controllerProfile,\s*playerProfile\?\.ownedPersonas,\s*\);/);
  assert.doesNotMatch(route, /\.\.\.\(profile\.ownedPersonas \?\? \[\]\), \.\.\.mentionedOwned/);
});

test("client only renders In Player Memory for Personas saved in the browser's Player Memory", () => {
  const script = readFileSync(new URL("../../public/script.js", import.meta.url), "utf8");
  assert.doesNotMatch(script, /ingredient\.owned \? "In Player Memory"/);
  assert.match(script, /ingredient\.inPlayerMemory\) && personaInPlayerMemory\(ingredient\.name\)/);
});
