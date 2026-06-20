import assert from "node:assert/strict";
import test from "node:test";
import { asksForRecommendation } from "./recommendationMode";

test("recognizes practical decision questions", () => {
  assert.equal(asksForRecommendation("What Persona should I fuse next?"), true);
  assert.equal(asksForRecommendation("Should I use Yukari or Ken as my healer?"), true);
  assert.equal(asksForRecommendation("Should Yukari or Ken be my main healer?"), true);
  assert.equal(asksForRecommendation("What should I prioritize today?"), true);
  assert.equal(asksForRecommendation("Which party member should I replace?"), true);
});

test("leaves exact fact questions out of recommendation mode", () => {
  assert.equal(asksForRecommendation("What is Dancing Hand weak to?"), false);
  assert.equal(asksForRecommendation("When does Aigis's Social Link start?"), false);
  assert.equal(asksForRecommendation("What does Victory Cry do?"), false);
});
