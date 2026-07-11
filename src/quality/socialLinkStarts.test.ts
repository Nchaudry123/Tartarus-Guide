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
