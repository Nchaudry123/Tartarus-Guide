import assert from "node:assert/strict";
import test from "node:test";
import {
  asksForMonthPlan,
  asksWhichLinksCanStart,
  buildMonthPlan,
  monthPlanningBrief,
} from "./monthPlanning";

test("June 3 plan points at the June 8 Emperor and Empress operation", () => {
  const plan = buildMonthPlan({ currentMonth: "June", currentDate: "June 3" });
  assert.equal(plan?.nextFullMoon?.date, "June 8");
  assert.match(plan?.nextFullMoon?.title ?? "", /Emperor and Empress/);
  assert.equal(plan?.nextFullMoon?.daysAway, 5);
});

test("a month without a day uses the start of that month", () => {
  const plan = buildMonthPlan({ currentMonth: "August" });
  assert.equal(plan?.dateLabel, "early August");
  assert.equal(plan?.nextFullMoon?.date, "August 6");
});

test("the month named in the question wins over the saved month", () => {
  assert.equal(buildMonthPlan({ currentMonth: "June", currentDate: "June 3" }, "What should I focus on in July?")?.nextFullMoon?.date, "July 7");
});

test("Social Links are split into open now and opening later this month", () => {
  const plan = buildMonthPlan({ currentMonth: "June", currentDate: "June 2" });
  const open = plan?.availableLinks.map((link) => link.character) ?? [];
  const later = plan?.laterThisMonth.map((link) => link.character) ?? [];
  assert.ok(open.includes("Yukari Takeba") === false, "Yukari's link opens in July");
  assert.ok(open.includes("Kenji Tomochika"));
  assert.ok(later.includes("Fuuka Yamagishi"));
  assert.ok(![...open, ...later].includes("Aigis"), "no future-month links");
});

test("the brief names the operation, warns against postponing Tartarus, and separates bosses from links", () => {
  const brief = monthPlanningBrief({ currentMonth: "October", currentDate: "October 1" });
  assert.match(brief, /October 4, Strength and Fortune/);
  assert.match(brief, /Do not advise postponing Tartarus/);
  assert.match(brief, /never call a boss a Social Link/);
  assert.equal(monthPlanningBrief({}), "");
});

test("planning and startable-link question detection", () => {
  assert.equal(asksForMonthPlan("What should I focus on in June?"), true);
  assert.equal(asksForMonthPlan("How should I split my time in July?"), true);
  assert.equal(asksForMonthPlan("What is Dancing Hand weak to?"), false);
  assert.equal(asksWhichLinksCanStart("Which Social Links can I start this month?"), true);
  assert.equal(asksWhichLinksCanStart("When does Yukari's Social Link start?"), false);
  assert.equal(asksWhichLinksCanStart("Which Social Links can I max?") , false);
});
