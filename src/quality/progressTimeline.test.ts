import assert from "node:assert/strict";
import test from "node:test";
import { getProgressSnapshot } from "./progressTimeline";

test("January includes the completed story path through December", () => {
  const snapshot = getProgressSnapshot({
    currentMonth: "January",
    recentBoss: "Priestess",
  });
  assert(snapshot);
  assert.match(snapshot.completedMilestones.join(" "), /Priestess through Hanged Man/);
  assert.match(snapshot.completedMilestones.join(" "), /December 31/);
  assert.match(snapshot.currentSituation, /final preparation month/i);
  assert.match(snapshot.staleProfileNote ?? "", /May chapter/);
});

test("current-month dated events are not assumed without a date", () => {
  const earlyNovember = getProgressSnapshot({ currentMonth: "November" });
  assert(earlyNovember);
  assert.doesNotMatch(earlyNovember.completedMilestones.join(" "), /Hanged Man/);

  const afterOperation = getProgressSnapshot({
    currentMonth: "November",
    currentDate: "November 4",
  });
  assert(afterOperation);
  assert.match(afterOperation.completedMilestones.join(" "), /Hanged Man/);
});

test("a stale date from another month does not advance the current chapter", () => {
  const snapshot = getProgressSnapshot({
    currentMonth: "January",
    currentDate: "June 8",
  });
  assert(snapshot);
  assert.doesNotMatch(snapshot.completedMilestones.join(" "), /final Tartarus mission/);
});
