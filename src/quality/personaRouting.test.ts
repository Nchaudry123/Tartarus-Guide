import assert from "node:assert/strict";
import test from "node:test";
import {
  isFusionRecipeRequest,
  isPersonaKnowledgeRequest,
} from "./personaRouting";

test("recognizes natural recipe phrasing without the word fuse", () => {
  assert.equal(isFusionRecipeRequest("How do I make Loki?"), true);
  assert.equal(isFusionRecipeRequest("What ingredients do I need for Alilat?"), true);
  assert.equal(isFusionRecipeRequest("What do Ananta and Asura make?"), true);
  assert.equal(isFusionRecipeRequest("Does Orpheus plus Pixie fuse into Satan?"), true);
  assert.equal(isFusionRecipeRequest("Can I combine Pixie and Angel into something useful?"), true);
});

test("does not route ordinary creation questions to fusion", () => {
  assert.equal(isFusionRecipeRequest("How do I make money?"), false);
  assert.equal(isFusionRecipeRequest("How can I make friends?"), false);
  assert.equal(isFusionRecipeRequest("How should I build my party?"), false);
  assert.equal(isFusionRecipeRequest("What Persona should I fuse next?"), false);
  assert.equal(isFusionRecipeRequest("How does skill inheritance work when I fuse Personas?"), false);
});

test("recognizes Persona profile and recommendation wording", () => {
  assert.equal(isPersonaKnowledgeRequest("Show me the stats for Loki."), true);
  assert.equal(isPersonaKnowledgeRequest("What is Satan's inheritance type?"), true);
  assert.equal(isPersonaKnowledgeRequest("Would Messiah be worth using?"), true);
  assert.equal(isPersonaKnowledgeRequest("What skills should I keep for Loki after fusing it?"), true);
  assert.equal(isPersonaKnowledgeRequest("How should I build Yukari?"), false);
});
