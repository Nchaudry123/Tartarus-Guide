import assert from "node:assert/strict";
import test from "node:test";
import {
  allSocialLinkUltimatePersonasRequested,
  canonicalRelationshipAnswer,
  relationshipContradictions,
  socialLinkEntityAliasesForQuestion,
  socialLinkUltimatePersonaRecords,
  ultimatePersonaFollowUpRecords,
  ultimatePersonaUnlockForQuestion,
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

test("maps rank-10 Arcana rewards to the verified ultimate Persona", () => {
  assert.deepEqual(ultimatePersonaUnlockForQuestion("what persona do i get with the aeon arcana"), {
    arcana: "Aeon",
    persona: "Metatron",
    item: "Charred Screw",
  });
  assert.deepEqual(ultimatePersonaUnlockForQuestion("What Persona does maxing Lovers unlock?"), {
    arcana: "Lovers",
    persona: "Cybele",
    item: "Yukari's Strap",
  });
  assert.equal(ultimatePersonaUnlockForQuestion("Is a Strength Persona good for this boss?"), null);
});

test("stores all rank-10 Persona unlocks and recognizes a full-list request", () => {
  assert.equal(socialLinkUltimatePersonaRecords().length, 22);
  assert.equal(
    allSocialLinkUltimatePersonasRequested(
      "List every Social Link and the Persona each one unlocks at Rank 10",
    ),
    true,
  );
  assert.equal(
    allSocialLinkUltimatePersonasRequested(
      "What Persona do I get for maxing every Social Link?",
    ),
    false,
  );
});

test("resolves referential Persona follow-ups from the previous topic", () => {
  const records = ultimatePersonaFollowUpRecords(
    "what is it?",
    "What Persona does Mitsuru's Social Link unlock?",
    "Maxing Empress unlocks Alilat.",
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].persona, "Alilat");

  const examples = ultimatePersonaFollowUpRecords(
    "what are they?",
    "What happens when I max a Social Link?",
    "Mitsuru's Empress link unlocks Alilat, while Yukari's Lovers link unlocks Cybele.",
  );
  assert.deepEqual(
    examples.map((record) => record.persona),
    ["Alilat", "Cybele"],
  );
});

test("gives a cautious early Social Link priority rule without inventing party links", () => {
  const answer = canonicalRelationshipAnswer(
    "Which Social Links should I prioritize early?",
  ) ?? "";
  assert.match(answer, /school|after-school|Kenji|Kazushi/i);
  assert.match(answer, /month|date|Charm|Academics|Courage|stats/i);
  assert.doesNotMatch(answer, /Junpei|Akihiko/);
});

test("uses stated month for Social Link priority coaching", () => {
  const answer =
    canonicalRelationshipAnswer("im in august now, which social links should i prioritize?", {
      currentMonth: "August",
    }) ?? "";
  assert.match(answer, /August/i);
  assert.match(answer, /summer|school/i);
  assert.doesNotMatch(answer, /no single best Social Link order without knowing your current date/i);
  assert.match(answer, /Charm|Academics|Courage/i);
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
