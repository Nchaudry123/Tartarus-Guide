import assert from "node:assert/strict";
import {
  assessGrounding,
  exactDetailPrompt,
  requiresExactGameEvidence,
} from "../quality/grounding";

assert.equal(
  requiresExactGameEvidence("What is Dancing Hand weak to?", "Enemy Weakness"),
  true,
);
assert.equal(
  requiresExactGameEvidence("How should I balance my party?", "Team Building"),
  false,
);
assert.equal(
  requiresExactGameEvidence("Does Junpei have a Social Link?", "Social Links"),
  true,
);
assert.equal(
  requiresExactGameEvidence("Where do I get Mitsuru's best weapon?", "Team Building"),
  true,
);
assert.equal(
  requiresExactGameEvidence("What does Victory Cry do?", "General Discussion"),
  true,
);

assert.deepEqual(
  assessGrounding({
    requiresExactEvidence: true,
    matchingFactConfidences: [],
    matchingChunkSimilarities: [],
  }).status,
  "insufficient",
);

const verified = assessGrounding({
  requiresExactEvidence: true,
  matchingFactConfidences: [0.91],
  matchingChunkSimilarities: [],
});
assert.equal(verified.status, "verified");
assert.equal(verified.confidenceCeiling, 0.91);

const partial = assessGrounding({
  requiresExactEvidence: true,
  matchingFactConfidences: [],
  matchingChunkSimilarities: [0.61],
});
assert.equal(partial.status, "partial");
assert.equal(partial.confidenceCeiling, 0.61);

assert.match(exactDetailPrompt("Fusion Advice"), /Persona name|ingredients/i);

console.log("Grounding safeguard tests passed.");
