import assert from "node:assert/strict";
import test from "node:test";
import { bossFactContradictions, bossFactsForPrompt, withoutBossFactContradictions } from "./bossFacts";

test("prompt facts give the upcoming Full Moon level and named Tartarus bosses", () => {
  const june = bossFactsForPrompt({ currentDate: "June 4" }).join("\n");
  assert.match(june, /Emperor and Empress Full Moon operation is on June 8.*16\+/);
  const maria = bossFactsForPrompt({}, "how do i beat bloody maria").join("\n");
  assert.match(maria, /weak to Pierce/);
  assert.match(maria, /Yukari, Junpei and Aigis/);
  // A Social Link Arcana name alone is not a boss reference.
  assert.deepEqual(bossFactsForPrompt({}, "How do I rank up Lovers?"), []);
});

test("flags a too-low level and a missing weakness, not correct advice", () => {
  assert.equal(
    bossFactContradictions("By June 4, be around level 10 to 12, but focus on beating the Emperor and Empress first.").length,
    1,
  );
  assert.deepEqual(bossFactContradictions("Aim for level 16 or higher before the Emperor and Empress fight."), []);
  assert.equal(bossFactContradictions("Since Bloody Maria has no weaknesses, just level up.").length, 1);
  assert.deepEqual(bossFactContradictions("Bloody Maria is weak to Pierce, so bring Junpei."), []);
  assert.equal(
    withoutBossFactContradictions("Bring Aigis. Bloody Maria has no weaknesses. Guard on Evil Smile."),
    "Bring Aigis. Guard on Evil Smile.",
  );
});
