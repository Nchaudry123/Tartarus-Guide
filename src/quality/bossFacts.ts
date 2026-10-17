import type { PlayerProfile } from "../../lib/types";
import { buildMonthPlan } from "./monthPlanning";

/**
 * Canonical boss facts the model kept getting wrong from memory, taken from the indexed guides:
 * - Full Moon boss dates and recommended levels from Game8's boss list
 *   (https://game8.co/games/Persona-3-Reload/archives/440373);
 * - Tartarus bosses players ask about, from Game8's Tartarus boss table and IGN's boss guides.
 */

export const FULL_MOON_BOSS_SOURCE = {
  title: "All Bosses and Boss Guides",
  url: "https://game8.co/games/Persona-3-Reload/archives/440373",
  domain: "game8.co",
} as const;

export type FullMoonBoss = { names: string[]; date: string; level: number; location: string };

export const fullMoonBosses: FullMoonBoss[] = [
  { names: ["Priestess"], date: "May 9", level: 10, location: "Iwatodai Station" },
  { names: ["Emperor", "Empress"], date: "June 8", level: 16, location: "Tartarus" },
  { names: ["Hierophant", "Lovers"], date: "July 7", level: 25, location: "Shirakawa Boulevard" },
  { names: ["Chariot", "Justice"], date: "August 6", level: 34, location: "the Underground Base" },
  { names: ["Hermit"], date: "September 5", level: 41, location: "Paulownia Mall" },
  { names: ["Strength", "Fortune"], date: "October 4", level: 48, location: "Iwatodai Station" },
  { names: ["Hanged Man"], date: "November 3", level: 54, location: "Moonlight Bridge" },
];

export type TartarusBoss = {
  name: string;
  floor: number;
  level: number;
  weak: string;
  nulls?: string;
  partner?: string;
  party?: string;
};

export const tartarusBosses: TartarusBoss[] = [
  {
    name: "Bloody Maria",
    floor: 105,
    level: 37,
    weak: "Pierce",
    nulls: "every element (Fire, Ice, Electric, Wind, Light, Dark)",
    partner: "an Executioner's Crown, which is weak to Fire and drains Wind",
    party: "Yukari, Junpei and Aigis (Pierce and Fire damage)",
  },
];

const bossLabel = (boss: FullMoonBoss) => boss.names.join(" and ");

const fullMoonContext = /\b(?:full moon|operation|boss(?:es)?|fight(?:ing)?|beat(?:ing)?|defeat(?:ing)?)\b/i;

function namesBoss(text: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`, "i").test(text);
}

/** Full Moon bosses the text is clearly about ("beat the Emperor and Empress", "the June 8 operation"). */
function fullMoonBossesIn(text: string): FullMoonBoss[] {
  return fullMoonBosses.filter(
    (boss) =>
      new RegExp(`\\b${boss.date}\\b`, "i").test(text) ||
      (boss.names.some((name) => namesBoss(text, name)) && fullMoonContext.test(text)),
  );
}

export function bossFactsForPrompt(profile: PlayerProfile, text = ""): string[] {
  const lines: string[] = [];
  const fullMoons = new Set(fullMoonBossesIn(text));
  const next = buildMonthPlan(profile)?.nextFullMoon;
  if (next) {
    const upcoming = fullMoonBosses.find((boss) => boss.date === next.date);
    if (upcoming) fullMoons.add(upcoming);
  }
  for (const boss of fullMoons) {
    lines.push(
      `- The ${bossLabel(boss)} Full Moon operation is on ${boss.date} at ${boss.location}; Game8's recommended level is ${boss.level}+. When asked what level to be, give that number.`,
    );
  }
  for (const boss of tartarusBosses) {
    if (!namesBoss(text, boss.name)) continue;
    lines.push(
      `- ${boss.name} (Tartarus floor ${boss.floor}, recommended level ${boss.level}+) is weak to ${boss.weak}${boss.nulls ? ` and nulls ${boss.nulls}` : ""}.${boss.partner ? ` It is flanked by ${boss.partner}.` : ""}${boss.party ? ` Recommended party: ${boss.party}.` : ""} Never say it has no weakness.`,
    );
  }
  return lines;
}

/** Claims that contradict the canonical boss facts, one message per problem. */
export function bossFactContradictions(text: string): string[] {
  const problems: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) {
    for (const boss of tartarusBosses) {
      if (namesBoss(sentence, boss.name) && /\b(?:no|doesn['’]t have any|does not have any|has no)\s+(?:real\s+)?weakness(?:es)?\b/i.test(sentence)) {
        problems.push(`${boss.name} is weak to ${boss.weak}.`);
      }
    }
    const levels = [...sentence.matchAll(/\b(?:level|lv\.?|lvl)\s*(\d{1,2})\b(?:\s*(?:to|-|–|or)\s*(\d{1,2}))?/gi)];
    if (!levels.length) continue;
    for (const boss of fullMoonBossesIn(sentence)) {
      const highest = Math.max(...levels.map((match) => Number(match[2] ?? match[1])));
      if (highest < boss.level - 2) {
        problems.push(`The ${bossLabel(boss)} fight's recommended level is ${boss.level}+, not ${highest}.`);
      }
    }
  }
  return [...new Set(problems)];
}

/** Drops sentences that still contradict the boss facts after a regenerate. */
export function withoutBossFactContradictions(text: string): string {
  const kept = text.split(/(?<=[.!?])\s+/).filter((sentence) => bossFactContradictions(sentence).length === 0);
  return kept.length ? kept.join(" ") : text;
}
