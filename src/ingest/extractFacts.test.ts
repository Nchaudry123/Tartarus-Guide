import assert from "node:assert/strict";
import test from "node:test";
import type { SourceInput, TextChunk } from "../types/schema";
import {
  extractDeterministicBossFacts,
  extractDeterministicCalendarFacts,
  extractDeterministicLocationFacts,
  extractDeterministicPersonaFacts,
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

test("stores Persona Arcana and base level as dedicated exact fields", () => {
  const facts = extractDeterministicPersonaFacts(
    chunks(
      "All Magician Personas",
      "personas",
      "Persona: Jack Frost (lvl 8)",
    ).map((chunk) => ({ ...chunk, sectionTitle: "All Magician Personas" })),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "Jack Frost" &&
        fact.fact_type === "arcana" &&
        fact.value === "Magician",
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "Jack Frost" &&
        fact.fact_type === "base_level" &&
        fact.value === "8",
    ),
  );
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

test("extracts broad Game8 request list facts", () => {
  const facts = extractDeterministicRequestFacts(
    chunks(
      "List of All Elizabeth's Requests",
      "requests",
      "Table data: No. | Request | Unlock Duration || 1 | Bring me a Muscle Drink | 5/10 || How to Complete: - Explore Tartarus and open chests. - Purchase it from the pharmacy. || 6 | Create a Persona with Kouha | Complete Request 5 || How to Complete: Fuse a Persona that knows Kouha.",
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "Request 1: Bring me a Muscle Drink" &&
        fact.fact_type === "schedule" &&
        fact.value === "5/10",
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "Request 6: Create a Persona with Kouha" &&
        fact.fact_type === "prerequisite" &&
        fact.value === "Complete Request 5",
    ),
  );
  assert(facts.some((fact) => fact.fact_type === "strategy" && fact.value?.includes("Fuse")));
});

test("extracts IGN request deadline, solution, and reward rows", () => {
  const facts = extractDeterministicRequestFacts(
    chunks(
      "Elizabeth Requests Guide",
      "requests",
      "| 12 | Bring me pine resin | 6/6 | Accept the request and speak to Yukari in the dorm. | x1 Toy Bow | Elizabeth Request 12 |",
    ),
  );
  assert(facts.some((fact) => fact.fact_type === "deadline" && fact.value === "6/6"));
  assert(facts.some((fact) => fact.fact_type === "reward" && fact.value === "x1 Toy Bow"));
  assert(
    facts.some(
      (fact) => fact.fact_type === "strategy" && fact.value?.includes("speak to Yukari"),
    ),
  );
});

test("extracts dated calendar actions and classroom answers", () => {
  const facts = extractDeterministicCalendarFacts(
    chunks(
      "April Walkthrough",
      "walkthrough",
      "[April 23] Table data: Classroom Answer? | None || After School | Free time recommendation: Head to Gym. || Evening | Go to Tartarus and reach floor 11. [April 24] Table data: Date: April 24 | Question: Q: What phrase is used? A: Vivid Carp Streamers",
    ),
  );
  assert(facts.some((fact) => fact.fact_type === "schedule" && fact.value === "April 23"));
  assert(
    facts.some(
      (fact) => fact.fact_type === "strategy" && fact.value?.includes("Head to Gym"),
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "April 24 Classroom Question" &&
        fact.fact_type === "answer_choice" &&
        fact.value?.includes("Vivid Carp Streamers"),
    ),
  );
});

test("extracts IGN boss affinities, floor, party, and strategy", () => {
  const facts = extractDeterministicBossFacts(
    chunks(
      "Bloody Maria Boss Guide - Persona 3 Reload Guide - IGN",
      "bosses",
      "[Bloody Maria Weaknesses and Resistances] The Bloody Maria is weak to pierce attacks and nulls fire, ice, electric, wind, light and dark. The Executioner's Crown is weak to fire and resists wind and electric. [Bloody Maria Boss Guide] The Bloody Maria is found on Floor 105 and is flanked by an Executioner's Crown. Your best bet is to bring Yukari, Junpei and Aigis. Focus the crown first, then use Pierce attacks.",
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "Bloody Maria" &&
        fact.fact_type === "weakness" &&
        fact.value === "Pierce",
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "Bloody Maria" &&
        fact.fact_type === "nullifies" &&
        fact.value === "Fire",
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "Bloody Maria" &&
        fact.fact_type === "floor_range" &&
        fact.value === "Floor 105",
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "Bloody Maria" &&
        fact.fact_type === "recommended_party" &&
        fact.value?.includes("Yukari"),
    ),
  );
});

test("does not turn recommended party members into boss affinity entities", () => {
  const facts = extractDeterministicBossFacts(
    chunks(
      "Strength and Fortune Boss Guide - Persona 3 Reload Guide - IGN",
      "bosses",
      "[Strength and Fortune Weaknesses and Resistances] Strength is weak to Strike. Fortune resists Wind. Junpei and Yukari will be the most effective here as the Surveillants use physical attacks.",
    ),
  );
  assert(
    facts.some(
      (fact) =>
        fact.entity_name === "Strength" &&
        fact.fact_type === "weakness" &&
        fact.value === "Strike",
    ),
  );
  assert.equal(
    facts.some((fact) => ["Junpei", "Yukari"].includes(fact.entity_name)),
    false,
  );
  assert.equal(
    facts.some((fact) => /will be the most effective/i.test(fact.entity_name)),
    false,
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
