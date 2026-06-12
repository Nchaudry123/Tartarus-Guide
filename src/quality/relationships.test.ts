import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalRelationshipAnswer,
  relationshipContradictions,
  socialLinkEntityAliasesForQuestion,
} from "./relationships";

test("corrects party-member Social Link requests deterministically", () => {
  assert.match(canonicalRelationshipAnswer("Junpei social link") ?? "", /Linked Episodes/i);
  assert.match(
    canonicalRelationshipAnswer("Does Akihiko have a Social Link?") ?? "",
    /does not have a Social Link/i,
  );
});

test("offers actual school Social Links for an ambiguous classmate request", () => {
  const answer = canonicalRelationshipAnswer("classmate social link") ?? "";
  assert.match(answer, /Kenji Tomochika/);
  assert.match(answer, /Chihiro Fushimi/);
  assert.doesNotMatch(answer, /Junpei/);
});

test("maps Social Link Arcana questions to their character entity", () => {
  assert.deepEqual(
    socialLinkEntityAliasesForQuestion("When can I start the Emperor Social Link?"),
    ["Hidetoshi Odagiri", "Emperor"],
  );
});

test("gives a cautious early Social Link priority rule without inventing party links", () => {
  const answer = canonicalRelationshipAnswer(
    "Which Social Links should I prioritize early?",
  ) ?? "";
  assert.match(answer, /school-limited links/i);
  assert.match(answer, /current date and Social Stats/i);
  assert.doesNotMatch(answer, /Junpei|Akihiko/);
});

test("detects invalid Social Link and Arcana claims", () => {
  const contradictions = relationshipContradictions({
    answer:
      "Junpei's Social Link is Magician. Yukari (Priestess) and Akihiko (Emperor) are also strong choices.",
  });
  assert(contradictions.some((value) => /Junpei/.test(value)));
  assert(contradictions.some((value) => /Akihiko/.test(value)));
  assert(contradictions.some((value) => /Yukari/.test(value)));
});
