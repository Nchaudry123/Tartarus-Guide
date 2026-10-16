import assert from "node:assert/strict";
import test from "node:test";
import {
  dropOtherMonthSources,
  playerTartarusBlock,
  questionCalendarMonth,
  rankSourcesForPlayer,
  sourceCalendarMonth,
  sourceTartarusBlock,
} from "./sourceRelevance";

const arqa = {
  title: "Arqa (Floors 23 - 43) - Tartarus Walkthrough",
  url: "https://www.ign.com/wikis/persona-3-reload/Arqa_(Floors_23_-_43)_-_Tartarus_Walkthrough",
};
const thebel = {
  title: "Thebel (Floors 2 - 22) - Tartarus Walkthrough",
  url: "https://www.ign.com/wikis/persona-3-reload/Thebel_(Floors_2_-_22)_-_Tartarus_Walkthrough",
};
const bossGuide = { title: "Full Moon Operation - May Walkthrough", url: "https://www.ign.com/wikis/persona-3-reload/May_Full_Moon" };

test("detects the Tartarus block a guide page covers", () => {
  assert.equal(sourceTartarusBlock(arqa), "Arqa");
  assert.equal(sourceTartarusBlock(thebel), "Thebel");
  assert.equal(sourceTartarusBlock(bossGuide), undefined);
  assert.equal(playerTartarusBlock("Thebel Block"), "Thebel");
  assert.equal(playerTartarusBlock("not sure"), undefined);
});

test("sources about the player's current block rank first, other blocks last", () => {
  const ranked = rankSourcesForPlayer([arqa, bossGuide, thebel], "Thebel");
  assert.deepEqual(ranked.map((source) => source.title), [thebel.title, bossGuide.title, arqa.title]);
  // No block known: order is untouched.
  assert.deepEqual(rankSourcesForPlayer([arqa, thebel]), [arqa, thebel]);
});

test("subject-less answers drop month walkthroughs for a different month", () => {
  const june = { title: "June Walkthrough and Activities Guide", url: "https://x/june" };
  const december = { title: "December Walkthrough and Activities Guide", url: "https://x/december" };
  const january = { title: "January Walkthrough and Activities Guide", url: "https://x/january" };
  const neutral = { title: "Social Links Guide", url: "https://x/social-links" };
  const month = questionCalendarMonth("What should I do on June 6?");
  assert.equal(month, "June");
  assert.deepEqual(
    dropOtherMonthSources([january, june, december, neutral], month).map((source) => source.title),
    [june.title, neutral.title],
  );
  assert.equal(sourceCalendarMonth(december), "December");
});

test("month detection falls back to the profile and ignores the verb 'may'", () => {
  assert.equal(questionCalendarMonth("What should I do next?", "June"), "June");
  assert.equal(questionCalendarMonth("What may I do tonight?"), undefined);
  assert.equal(questionCalendarMonth("plans for may 9"), "May");
  assert.equal(questionCalendarMonth("May exams"), "May");
});
