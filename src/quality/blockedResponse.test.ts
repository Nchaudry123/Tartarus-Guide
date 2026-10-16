import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ChatResponse } from "../../lib/types";
import { blockedChatResponse, hasAnswerCardContent } from "./blockedResponse";

function fullyLoadedDraft(): ChatResponse {
  return {
    answer: "Advance Priestess with Fuuka today, then Lovers and Fortune.",
    sections: [{ title: "Quick Strategy", content: "Spend the evening with Fuuka." }],
    tables: [{ title: "Links", columns: ["Arcana", "Rank"], rows: [["Priestess", "3"]] }],
    bossPrep: { boss: "Dancing Hand", weakness: "Fire" },
    fusionWorkshop: {
      target: "Jack Frost",
      dlcMode: "none",
      recipes: [{ ingredients: [{ name: "Apsaras", owned: true }], special: false, ready: true }],
    },
    dailyDashboard: {
      date: "June 6",
      weekday: "Saturday",
      items: [{ priority: "urgent", category: "Social Link", title: "Priestess", detail: "Fuuka" }],
    },
    recommendation: {
      title: "Today's pick",
      primary: { name: "Advance Priestess with Fuuka", reason: "Highest priority link." },
      alternatives: [{ name: "Lovers", tradeoff: "Charm gated." }],
    },
    sources: [{ title: "Guide", url: "https://www.ign.com/x", domain: "ign.com" }],
    confidence: 0.9,
    retrievalMode: "rag",
    companion: { intent: "Daily Schedule Planning", suggestedPrompts: ["What about tomorrow?"] },
    diagnostics: { groundingStatus: "verified" },
  };
}

test("blocked responses carry no recommendation or other card content", () => {
  const blocked = blockedChatResponse(fullyLoadedDraft(), {
    answer: "I don’t want to invent a Priestess / Lovers / Fortune detail for that.",
    confidence: 0.4,
    missingInfo: "Tell me which links you have unlocked.",
  });

  assert.equal(blocked.recommendation, undefined);
  assert.equal(blocked.fusionWorkshop, undefined);
  assert.equal(blocked.dailyDashboard, undefined);
  assert.equal(blocked.bossPrep, undefined);
  assert.deepEqual(blocked.sections, []);
  assert.deepEqual(blocked.tables, []);
  assert.deepEqual(blocked.sources, []);
  assert.equal(hasAnswerCardContent(blocked), false);
  assert.match(blocked.answer, /don’t want to invent/);
  assert.equal(blocked.confidence, 0.4);
});

test("blocked responses only keep non-content metadata from the draft", () => {
  const blocked = blockedChatResponse(fullyLoadedDraft(), { answer: "Blocked." });
  const allowed = new Set([
    "answer",
    "sections",
    "tables",
    "sources",
    "confidence",
    "missingInfo",
    "retrievalMode",
    "companion",
    "diagnostics",
  ]);
  for (const key of Object.keys(blocked)) {
    assert.ok(allowed.has(key), `blocked response leaked "${key}"`);
  }
  // Confidence from the confident draft must not survive unless explicitly overridden.
  assert.equal(blocked.confidence, undefined);
  assert.equal(blocked.retrievalMode, "rag");
});

test("an unknown future card field is dropped from blocked responses", () => {
  const draft = { ...fullyLoadedDraft(), futureCard: { title: "Confident claim" } } as ChatResponse;
  const blocked = blockedChatResponse(draft, { answer: "Blocked." });
  assert.equal((blocked as Record<string, unknown>).futureCard, undefined);
});

test("chat route builds every grounding-blocked answer through blockedChatResponse", () => {
  const route = readFileSync(new URL("../../app/api/chat/route.ts", import.meta.url), "utf8");
  for (const phrase of ["I don’t want to invent a", "I’m not solid enough on"]) {
    const index = route.indexOf(phrase);
    assert.ok(index > 0, `missing blocked phrase: ${phrase}`);
    const preceding = route.slice(Math.max(0, index - 160), index);
    assert.match(preceding, /blockedChatResponse\(response, \{\s*answer: `$/, `${phrase} is not built via blockedChatResponse`);
  }
  // Cards must be attached before the grounding gate, never after it.
  assert.doesNotMatch(route, /withBossPrep\(\s*applyGroundingGuardrails\(/);
});
