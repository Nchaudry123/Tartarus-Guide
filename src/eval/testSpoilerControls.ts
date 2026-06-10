import assert from "node:assert/strict";
import {
  evaluateSpoilerPolicy,
  hasExplicitSpoilerPermission,
} from "../quality/spoilers";

assert.equal(hasExplicitSpoilerPermission("Full spoilers are fine"), true);
assert.equal(hasExplicitSpoilerPermission("Keep it spoiler free"), false);

assert.equal(
  evaluateSpoilerPolicy({
    question: "Who is the final boss?",
    intent: "Story Guidance",
  }).allow,
  false,
);

assert.equal(
  evaluateSpoilerPolicy({
    question: "Who is the final boss? Full spoilers are fine.",
    intent: "Story Guidance",
    preference: "strict",
  }).allow,
  true,
);

const progressUnknown = evaluateSpoilerPolicy({
  question: "What happens next?",
  intent: "Story Guidance",
  preference: "progress-aware",
});
assert.equal(progressUnknown.allow, false);
assert.match(progressUnknown.followUp ?? "", /month/i);

const progressSafe = evaluateSpoilerPolicy({
  question: "Can you explain the scene I just watched?",
  intent: "Story Guidance",
  preference: "progress-aware",
  currentMonth: "June",
});
assert.equal(progressSafe.allow, true);
assert.match(progressSafe.promptInstruction, /June/);

assert.equal(
  evaluateSpoilerPolicy({
    question: "How should I build my party?",
    intent: "Team Building",
    preference: "strict",
  }).allow,
  true,
);

console.log("Spoiler control tests passed.");
