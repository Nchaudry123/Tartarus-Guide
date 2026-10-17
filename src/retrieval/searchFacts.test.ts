import assert from "node:assert/strict";
import test from "node:test";
import { detectFactTypes } from "./searchFacts";

test("an ingredient-pair result question looks up fusion recipes", () => {
  assert.ok(detectFactTypes("What do Ananta and Asura make?").includes("fusion_recipe"));
  assert.ok(detectFactTypes("what does pixie + jack frost create").includes("fusion_recipe"));
  assert.ok(!detectFactTypes("What is Dancing Hand weak to?").includes("fusion_recipe"));
});
