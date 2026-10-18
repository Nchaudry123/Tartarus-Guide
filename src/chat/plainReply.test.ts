import assert from "node:assert/strict";
import test from "node:test";
import { clipReply, parsePlainReply, separateInlineList, withoutFieldLabels } from "./plainReply";

const leaked =
  "Yo! With the Emperor and Empress Full Moon op just 2 days away on June 8, your focus should be getting your party ready for that fight. " +
  "Keep stocking healing items. Recommendation: - Title: Prep for June 8 Full Moon - Primary: Hit Tartarus in Thebel to grind XP and reach level 16+ " +
  "Reason: Ensures your party can survive - Alternatives: - Name: Start available Social Links Tradeoff: Better long-term bonuses " +
  '- Deciding Factor: How close your party is to level 16+ - Next Step: Head into Tartarus now Confidence: 0.9 ' +
  'Missing Info: Exact levels of Yukari, Junpei, and Akihiko Suggested Replies: "What level should Yukari be?", "Where do I grind in Thebel?"';

test("labelled fields written inline are cut from the reply and recovered", () => {
  const reply = parsePlainReply(leaked);
  assert.equal(
    reply.answer,
    "Yo! With the Emperor and Empress Full Moon op just 2 days away on June 8, your focus should be getting your party ready for that fight. Keep stocking healing items.",
  );
  assert.deepEqual(reply.suggestedReplies, ["What level should Yukari be?", "Where do I grind in Thebel?"]);
  assert.equal(reply.missingInfo, "Exact levels of Yukari, Junpei, and Akihiko");
  assert.equal(reply.confidence, 0.9);
});

test("labelled fields on their own lines, with paragraph breaks and lists kept", () => {
  const reply = parsePlainReply(
    "Get ready for the June 8 Full Moon.\n\n- Grind Thebel to level 16\n- Stock healing items\n\n**Recommendation:**\n- Title: Prep\nConfidence: 0.8\nSuggested Replies:\n- What level should Yukari be?\n- Should I fuse first?",
  );
  assert.equal(reply.answer, "Get ready for the June 8 Full Moon.\n\n- Grind Thebel to level 16\n- Stock healing items");
  assert.deepEqual(reply.suggestedReplies, ["What level should Yukari be?", "Should I fuse first?"]);
});

test("ordinary prose that mentions a field word is left alone", () => {
  const text = "My recommendation: fuse Orpheus first. Your confidence in Junpei is fine, and the sources agree.";
  assert.equal(parsePlainReply(text).answer, text);
  assert.equal(parsePlainReply("Answer: Swift Axle is weak to Electric.").answer, "Swift Axle is weak to Electric.");
});

test("a reply that opens with a label keeps that text", () => {
  assert.equal(parsePlainReply("Recommendation: grind Thebel to 16 first. Confidence: 0.7").answer, "grind Thebel to 16 first.");
});

test("long replies are clipped at a sentence boundary", () => {
  assert.equal(clipReply("One two three four. Five six seven eight.", 30), "One two three four.");
  assert.equal(clipReply("short", 20), "short");
});

test("a list started mid-line moves onto its own line; a lone dash stays", () => {
  assert.equal(
    separateInlineList("Watch Fuuka's analysis. - Keep Tartarus steady\n- Stock healing items"),
    "Watch Fuuka's analysis.\n- Keep Tartarus steady\n- Stock healing items",
  );
  const prose = "Bring Yukari. - She heals. Then fight.";
  assert.equal(separateInlineList(prose), prose);
});

test("labels folded into a JSON answer are dropped, including one-word key spellings", () => {
  assert.equal(
    withoutFieldLabels("Prioritize exploiting the current weakness each turn. SuggestedReplies: What Persona should I fuse?"),
    "Prioritize exploiting the current weakness each turn.",
  );
  assert.equal(withoutFieldLabels("Hit it with Fire.\nmissingInfo: party level"), "Hit it with Fire.");
  const clean = "My recommendation: fuse Orpheus first.";
  assert.equal(withoutFieldLabels(clean), clean);
});
