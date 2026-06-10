import assert from "node:assert/strict";
import test from "node:test";
import type { SourceInput, TextChunk } from "../types/schema";
import {
  extractDeterministicBossFacts,
  extractDeterministicLocationFacts,
  extractDeterministicRequestFacts,
  extractDeterministicSocialLinkFacts,
} from "./extractFacts";

function chunks(pageTitle: string, category: string, text: string): TextChunk[] {
  const source: SourceInput = {
    title: pageTitle,
    url: `https://game8.co/games/Persona-3-Reload/archives/${pageTitle.length}`,
    category,
    sourceType: "guide",
    credibilityRank: 80,
  };
  return [
    {
      source,
      pageTitle,
      sectionTitle: pageTitle,
      text,
      tokenCount: text.length,
      hash: `${pageTitle.length}`,
    },
  ];
}

test("extracts request schedule, deadline, reward, and prerequisite without inference", () => {
  const facts = extractDeterministicRequestFacts(
    chunks(
      "Request Guide",
      "requests",
      "Table data: Request 36: Defeat a rare Shadow #1 || Objective | Defeat a rare Shadow #1 || Start Date | Complete Request 31 || End Date | 8/4 || Reward | Onyx x1",
    ),
  );
  assert(facts.some((fact) => fact.fact_type === "prerequisite" && fact.value === "Complete Request 31"));
  assert(facts.some((fact) => fact.fact_type === "deadline" && fact.value === "8/4"));
  assert(facts.some((fact) => fact.fact_type === "reward" && fact.value === "Onyx x1"));
});

test("extracts Social Link unlocks, schedules, locations, and highest-point answers", () => {
  const facts = extractDeterministicSocialLinkFacts(
    chunks(
      "Kenji Tomochika - Magician",
      "social_links",
      `[Kenji Tomochika Social Link Guide] Kenji's Social Link automatically unlocks on 4/22, and he's available on Tuesdays, Thursdays, and Fridays after school. [Rank 1 -> Rank 2] “No way.” (#2) / “That’s a secret.” (#3)`,
    ),
  );
  assert(facts.some((fact) => fact.fact_type === "unlock_condition" && fact.value === "4/22"));
  assert(
    facts.some(
      (fact) =>
        fact.fact_type === "schedule" &&
        fact.value === "Tuesdays, Thursdays, and Fridays after school",
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.fact_type === "answer_choice" &&
        fact.value === `Rank 1 -> Rank 2: "That’s a secret." (+3)`,
    ),
  );
});

test("extracts exact boss overview fields", () => {
  const facts = extractDeterministicBossFacts(
    chunks(
      "Priestess Boss Guide: Weakness and Resistances",
      "bosses",
      "Table data: Boss: Priestess Arcana: Priestess || Date ＆ Location: Date: May 9th Location: Iwatodai Station Recommended Level: 10+",
    ),
  );
  assert(facts.some((fact) => fact.fact_type === "schedule" && fact.value === "May 9th"));
  assert(facts.some((fact) => fact.fact_type === "location" && fact.value === "Iwatodai Station"));
  assert(
    facts.some(
      (fact) => fact.fact_type === "prerequisite" && fact.value === "Recommended level: 10+",
    ),
  );
});

test("extracts Tartarus block and enemy floor ranges", () => {
  const facts = extractDeterministicLocationFacts(
    chunks(
      "Tziah (Floors 119 - 144) Tartarus Walkthrough",
      "tartarus",
      "[Invaluable Hand Location] Table data: Block: Yabbashah Block(Upper) | Floors: 92F to 117F",
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "Tziah Block" &&
        fact.fact_type === "floor_range" &&
        fact.value === "119F-144F",
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "Invaluable Hand" &&
        fact.fact_type === "floor_range" &&
        fact.value === "92F to 117F",
    ),
  );
});
