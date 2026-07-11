import assert from "node:assert/strict";
import test from "node:test";
import {
  expertSuggestedPrompts,
  expertVagueCreationClarify,
  hasBareReferentialLanguage,
  isVagueCreationQuestion,
} from "./expertConversation";

test("flags vague craft/fuse questions without a named target", () => {
  assert.equal(isVagueCreationQuestion("how do i craft these"), true);
  assert.equal(isVagueCreationQuestion("how do I make it"), true);
  assert.equal(isVagueCreationQuestion("how do i craft these?"), true);
  assert.equal(isVagueCreationQuestion("How do I fuse Loki?"), false);
  assert.equal(isVagueCreationQuestion("How do I fuse Jack Frost"), false);
  assert.equal(isVagueCreationQuestion("How do I fuse Jack Frost?"), false);
  assert.equal(isVagueCreationQuestion("what is dancing hand weak to"), false);
  assert.equal(isVagueCreationQuestion("What skills should I keep?"), false);
  assert.equal(
    isVagueCreationQuestion(
      "The user's active conversation goal is: How do I fuse Loki?\nThe user's latest follow-up is: What skills should I keep for Loki after fusing it?",
    ),
    false,
  );
});

test("bare referential words are detected", () => {
  assert.equal(hasBareReferentialLanguage("how do i craft these"), true);
  assert.equal(hasBareReferentialLanguage("How do I fuse Loki?"), false);
});

test("clarify copy stays expert and offers fusion defaults", () => {
  const clarify = expertVagueCreationClarify();
  assert.match(clarify.answer, /fusion|Persona/i);
  assert.ok(clarify.suggestedPrompts.some((prompt) => /fuse/i.test(prompt)));
  assert.doesNotMatch(clarify.answer, /Player Memory|rephrase|focused question/i);
});

test("suggested prompts never use meta UI language for vague needs-detail", () => {
  const prompts = expertSuggestedPrompts({
    needsDetail: true,
    missing: "Name the Persona you mean by these.",
    intent: "Fusion Advice",
  });
  assert.ok(prompts.length >= 1);
  assert.ok(prompts.every((prompt) => !/Player Memory|rephrase|focused question/i.test(prompt)));
});

test("social link coaching does not get fusion chips from the word Persona in the answer", () => {
  const prompts = expertSuggestedPrompts({
    intent: "Social Links",
    needsDetail: true,
    missing: "Rough Charm / Academics / Courage ranks.",
    answer:
      "Bring a Persona of the matching Arcana when the link awards affinity points. Share Charm ranks.",
    month: "August",
  });
  assert.ok(prompts.some((prompt) => /Charm|Academics|Courage|links/i.test(prompt)));
  assert.ok(prompts.every((prompt) => !/fuse Jack Frost|fuse Loki|heart item/i.test(prompt)));
});
