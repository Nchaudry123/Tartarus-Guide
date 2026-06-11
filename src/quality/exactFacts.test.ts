import assert from "node:assert/strict";
import test from "node:test";
import type { FactMatch } from "../types/schema";
import {
  exactFactLabel,
  exactFactMatches,
  requestedExactFactTypes,
} from "./exactFacts";

function fact(fact_type: FactMatch["fact_type"], value: string, confidence = 0.99): FactMatch {
  return {
    id: `${fact_type}:${value}`,
    fact_type,
    value,
    confidence,
    notes: null,
    entity: {
      id: "jack-frost",
      name: "Jack Frost",
      type: "persona",
      aliases: [],
      normalized_name: "jack frost",
    },
    source: {
      id: "fusion-tool",
      title: "Persona 3 Reload Fusion Calculator",
      url: "https://example.com/fusion",
      domain: "example.com",
      credibility_rank: 10,
    },
  };
}

test("detects exact metadata questions", () => {
  assert.deepEqual(requestedExactFactTypes("What Arcana and level is Jack Frost?"), [
    "arcana",
    "base_level",
    "prerequisite",
  ]);
  assert.deepEqual(requestedExactFactTypes("How should I build my party?"), []);
});

test("accepts only validated subject-matched structured fields", () => {
  const matches = exactFactMatches(
    "What Arcana is Jack Frost?",
    [fact("arcana", "Magician"), fact("tip", "Use Ice"), fact("arcana", "Fool", 0.6)],
    (question, entityName) => question.toLowerCase().includes(entityName.toLowerCase()),
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].value, "Magician");
  assert.equal(exactFactLabel(matches[0].fact_type), "Arcana");
});
