import assert from "node:assert/strict";
import test from "node:test";
import {
  asksForAllSocialLinkStarts,
  socialLinkStartContradictions,
  socialLinkStartForQuestion,
  socialLinkStarts,
} from "./socialLinkStarts";

test("stores every Persona 3 Reload Social Link once", () => {
  assert.equal(socialLinkStarts.length, 22);
  assert.equal(new Set(socialLinkStarts.map((link) => link.arcana)).size, 22);
  assert.equal(socialLinkStarts.filter((link) => link.automatic).length, 3);
  assert.equal(socialLinkStarts.filter((link) => !link.automatic).length, 19);
});

test("returns Yukari's actual start date and prerequisite", () => {
  const link = socialLinkStartForQuestion("When can I start Yukari's social link?");
  assert.equal(link?.character, "Yukari Takeba");
  assert.equal(link?.arcana, "Lovers");
  assert.equal(link?.earliestStart, "July 25");
  assert.match(link?.requirement ?? "", /Charm Rank 6/);
});

test("matches availability-style Yukari social link questions", () => {
  assert.equal(socialLinkStartForQuestion("is yukari social link open")?.character, "Yukari Takeba");
  assert.equal(socialLinkStartForQuestion("yukari social link in august")?.character, "Yukari Takeba");
});

test("maps April 23 to Kazushi rather than Yukari", () => {
  const link = socialLinkStarts.find((entry) => entry.earliestStart === "April 23");
  assert.equal(link?.character, "Kazushi Miyamoto");
  assert.equal(link?.arcana, "Chariot");
  assert.equal(
    socialLinkStartForQuestion("Who can I start on April 23?")?.character,
    "Kazushi Miyamoto",
  );
});

test("understands Arcana wording and conditional unlocks", () => {
  assert.equal(
    socialLinkStartForQuestion("When does the Lovers Arcana unlock?")?.character,
    "Yukari Takeba",
  );
  const tanaka = socialLinkStartForQuestion("When can I start Tanaka?");
  assert.equal(tanaka?.earliestStart, "No fixed date");
  assert.match(tanaka?.requirement ?? "", /Hermit Rank 4/);
  assert.match(tanaka?.requirement ?? "", /Charm Rank 4/);
});

test("recognizes full roster requests", () => {
  assert.equal(
    asksForAllSocialLinkStarts("List every Social Link, who it is, and when it starts"),
    true,
  );
});

test("detects a wrong date for a single Social Link answer", () => {
  assert.deepEqual(
    socialLinkStartContradictions({
      answer: "Yukari's Lovers Social Link starts on April 23.",
    }),
    ["Yukari Takeba's Lovers Social Link starts July 25, not April 23."],
  );
  assert.deepEqual(
    socialLinkStartContradictions({
      answer: "Yukari's Lovers Social Link starts on July 25.",
    }),
    [],
  );
});

test("does not treat ordinary uses of when as a Social Link start request", () => {
  assert.equal(
    socialLinkStartForQuestion(
      "My Yukari party keeps running out of SP even when I avoid unnecessary fights.",
    ),
    null,
  );
  assert.equal(
    socialLinkStartForQuestion(
      "Start with a Persona recommendation for my party with Yukari.",
    ),
    null,
  );
});

test("a full moon, a full-moon boss, or 'the tower' is not a Social Link mention", () => {
  for (const question of [
    "Is it worth grinding Tartarus before the June full moon or should I spend evenings on Social Links instead?",
    "Should I do Social Links or prep for the full moon? Is it open tonight?",
    "Can I start Social Links before the Emperor and Empress fight?",
    "When can I fight the Priestess boss, and should I do social links first?",
    "Should I climb the tower or do social links when I can?",
  ]) {
    assert.equal(socialLinkStartForQuestion(question), null, question);
  }
});

test("real Moon, Tower and Emperor Social Link questions still match", () => {
  assert.equal(socialLinkStartForQuestion("When does the Moon Social Link start?")?.character, "Nozomi Suemitsu");
  assert.equal(socialLinkStartForQuestion("When can I start the Tower social link?")?.character, "Mutatsu");
  assert.equal(socialLinkStartForQuestion("When does the Emperor social link start?")?.character, "Hidetoshi Odagiri");
});

test("an answer about a full-moon boss is not checked against that arcana's link start date", () => {
  // Fuuka's Priestess link starts June 19; the Priestess boss fight is May 9.
  assert.deepEqual(
    socialLinkStartContradictions({
      answer: "Rest on May 8 so you are ready for the Priestess boss on May 9.",
    }),
    [],
  );
  // A real Priestess link claim with the wrong date is still caught.
  assert.equal(
    socialLinkStartContradictions({ answer: "Fuuka's Priestess Social Link starts May 9." }).length,
    1,
  );
});
