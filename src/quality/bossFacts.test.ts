import assert from "node:assert/strict";
import test from "node:test";
import { bossFactContradictions, bossFactsForPrompt, canonicalBossAffinities, withoutBossFactContradictions } from "./bossFacts";

test("prompt facts give the upcoming Full Moon level and named Tartarus bosses", () => {
  const june = bossFactsForPrompt({ currentDate: "June 4" }).join("\n");
  assert.match(june, /Emperor and Empress Full Moon operation is on June 8.*16\+/);
  const maria = bossFactsForPrompt({}, "how do i beat bloody maria").join("\n");
  assert.match(maria, /Bloody Maria \(Tartarus 105F guardian, recommended level 37\+\): weak to Pierce; nulls Fire, Ice, Electric, Wind, Light, Dark/);
  assert.match(maria, /Fought together with Executioner's Crown \(weak to Fire; nulls Light; drains Wind\)/);
  assert.match(maria, /Yukari, Junpei and Aigis/);
  assert.match(bossFactsForPrompt({}, "tips for the will o' wisp raven?").join(" "), /Will O Wisp Raven \(Tartarus 28F/);
  assert.match(bossFactsForPrompt({}, "Lascivious Lady").join(" "), /has no listed weakness/);
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
  assert.deepEqual(bossFactContradictions("Bloody Maria is weak to Fire."), [
    "Bloody Maria is not weak to Fire (it nulls it); its weakness is Pierce.",
  ]);
  // The claim belongs to the nearest guardian before it.
  assert.deepEqual(bossFactContradictions("Hit Bloody Maria with Pierce, and the Executioner's Crown is weak to Fire."), []);
  assert.equal(bossFactContradictions("The Swift Axle is weak to Ice, so use Bufu.").length, 1);
  assert.deepEqual(bossFactContradictions("The Swift Axle is weak to Electric."), []);
  // A weakness about other enemies on the floor is not a claim about the guardian.
  assert.deepEqual(bossFactContradictions("Before the Swift Axle, use Fire on enemies weak to Fire."), []);
  assert.equal(
    withoutBossFactContradictions("Bring Aigis. Bloody Maria has no weaknesses. Guard on Evil Smile."),
    "Bring Aigis. Guard on Evil Smile.",
  );
});

test("boss cards get canonical weaknesses for guardians and Full Moon bosses", () => {
  assert.deepEqual(canonicalBossAffinities("Bloody Maria")?.weak, ["Pierce"]);
  assert.deepEqual(canonicalBossAffinities("executioner's crown")?.weak, ["Fire"]);
  assert.deepEqual(canonicalBossAffinities("Empress")?.weak, ["Slash", "Strike", "Pierce"]);
  assert.deepEqual(canonicalBossAffinities("Priestess"), { weak: [], avoid: ["Nulls Ice"] });
  assert.equal(canonicalBossAffinities("Jack Frost"), null);
});
