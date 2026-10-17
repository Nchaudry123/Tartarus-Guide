import type { PlayerProfile } from "../../lib/types";
import { buildMonthPlan } from "./monthPlanning";
import {
  tartarusGuardians,
  type Affinity,
  type AttackType,
  type TartarusGuardian,
} from "./tartarusGuardians";

/**
 * Canonical boss facts the model kept getting wrong from memory, taken from the indexed guides:
 * - Full Moon boss dates and recommended levels from Game8's boss list
 *   (https://game8.co/games/Persona-3-Reload/archives/440373);
 * - every Tartarus guardian's affinities, level and floor, from Game8's guardian table
 *   (see tartarusGuardians.ts), plus a few IGN boss-guide notes.
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

/** Extra guide notes for specific guardians (IGN boss guides); affinities come from the table. */
const guardianNotes: Record<string, string> = {
  "Bloody Maria": "Recommended party: Yukari, Junpei and Aigis (Pierce and Fire damage).",
};

const attackLabels: Record<AttackType, string> = {
  slash: "Slash",
  strike: "Strike",
  pierce: "Pierce",
  fire: "Fire",
  ice: "Ice",
  electric: "Electric",
  wind: "Wind",
  light: "Light",
  dark: "Dark",
};

const attackWords: Record<AttackType, RegExp> = {
  slash: /^slash/i,
  strike: /^strike/i,
  pierce: /^pierc/i,
  fire: /^(?:fire|agi)/i,
  ice: /^(?:ice|bufu)/i,
  electric: /^(?:elec|lightning|zio)/i,
  wind: /^(?:wind|garu)/i,
  light: /^(?:light|hama|bless)/i,
  dark: /^(?:dark|mudo|curse)/i,
};

const normalizeName = (value: string) => value.toLowerCase().replace(/[’'`.-]/g, "").replace(/\s+/g, " ");

function guardianNamePattern(guardian: TartarusGuardian): RegExp {
  const words = normalizeName(guardian.name).split(" ").map((word) => word.replace(/[^a-z0-9]/g, ""));
  return new RegExp(`\\b${words.join("\\s*")}\\b`, "i");
}

/** Guardians named in the text ("Executioner's Crown", "will o' wisp raven"). */
export function guardiansIn(text: string): TartarusGuardian[] {
  const normalized = normalizeName(text);
  return tartarusGuardians.filter((guardian) => guardianNamePattern(guardian).test(normalized));
}

function describeAffinities(guardian: TartarusGuardian): string {
  const byAffinity = new Map<Affinity, string[]>();
  for (const [attack, affinity] of Object.entries(guardian.affinities) as Array<[AttackType, Affinity]>) {
    byAffinity.set(affinity, [...(byAffinity.get(affinity) ?? []), attackLabels[attack]]);
  }
  const verbs: Record<Affinity, string> = { Weak: "weak to", Resist: "resists", Null: "nulls", Drain: "drains", Repel: "repels" };
  const parts = (["Weak", "Resist", "Null", "Drain", "Repel"] as Affinity[])
    .filter((affinity) => byAffinity.has(affinity))
    .map((affinity) => `${verbs[affinity]} ${byAffinity.get(affinity)!.join(", ")}`);
  const unknown = (guardian.unknown ?? []).map((attack) => attackLabels[attack]);
  if (!byAffinity.has("Weak") && !unknown.length) parts.unshift("has no weakness to any attack type");
  if (unknown.length) parts.push(`Game8's list has no data for ${unknown.join(", ")}`);
  return parts.join("; ");
}

function guardianLine(guardian: TartarusGuardian): string {
  const partners = tartarusGuardians.filter((other) => other.floor === guardian.floor && other.name !== guardian.name);
  return [
    `- ${guardian.name} (Tartarus ${guardian.floor}F guardian, recommended level ${guardian.level}+): ${describeAffinities(guardian)}.`,
    partners.length ? ` Fought together with ${partners.map((other) => `${other.name} (${describeAffinities(other)})`).join(" and ")}.` : "",
    guardianNotes[guardian.name] ? ` ${guardianNotes[guardian.name]}` : "",
  ].join("");
}

/** Full Moon boss affinities from the same Game8 boss list (normal/unknown omitted). */
const fullMoonAffinities: Record<string, TartarusGuardian["affinities"]> = {
  Priestess: { ice: "Null" },
  Emperor: { slash: "Resist", strike: "Null", pierce: "Null", fire: "Weak", ice: "Weak", electric: "Weak", wind: "Weak", light: "Null", dark: "Null" },
  Empress: { slash: "Weak", strike: "Weak", pierce: "Weak", fire: "Null", ice: "Null", electric: "Null", wind: "Null", light: "Null", dark: "Null" },
  Hierophant: { light: "Null", dark: "Null" },
  Lovers: { pierce: "Resist", fire: "Null", electric: "Resist" },
  Chariot: { slash: "Resist", strike: "Resist", pierce: "Resist" },
  Justice: { fire: "Resist", ice: "Resist", electric: "Resist", wind: "Resist", light: "Resist", dark: "Resist" },
  Hermit: { electric: "Null", wind: "Null", dark: "Null" },
  Fortune: { strike: "Weak", fire: "Drain", ice: "Drain", electric: "Weak", wind: "Drain", light: "Drain" },
  Strength: { slash: "Resist", strike: "Repel", pierce: "Resist" },
  "Hanged Man": { strike: "Resist", fire: "Null", dark: "Repel" },
};

/** Canonical weaknesses and defensive affinities for a named boss, for boss cards. */
export function canonicalBossAffinities(
  name: string,
): { weak: string[]; avoid: string[]; unknown: string[] } | null {
  const key = normalizeName(name);
  const guardian = tartarusGuardians.find((entry) => normalizeName(entry.name) === key);
  const affinities = guardian?.affinities ?? Object.entries(fullMoonAffinities).find(([boss]) => normalizeName(boss) === key)?.[1];
  if (!affinities) return null;
  const entries = Object.entries(affinities) as Array<[AttackType, Affinity]>;
  const verbs: Record<Affinity, string> = { Weak: "", Resist: "Resists", Null: "Nulls", Drain: "Drains", Repel: "Repels" };
  return {
    weak: entries.filter(([, affinity]) => affinity === "Weak").map(([attack]) => attackLabels[attack]),
    avoid: (["Repel", "Drain", "Null", "Resist"] as Affinity[]).flatMap((affinity) => {
      const attacks = entries.filter(([, value]) => value === affinity).map(([attack]) => attackLabels[attack]);
      return attacks.length ? [`${verbs[affinity]} ${attacks.join(", ")}`] : [];
    }),
    unknown: (guardian?.unknown ?? []).map((attack) => attackLabels[attack]),
  };
}

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
    const affinities = boss.names
      .filter((name) => fullMoonAffinities[name])
      .map((name) => `${name}: ${describeAffinities({ name, level: boss.level, floor: 0, affinities: fullMoonAffinities[name] })}`);
    lines.push(
      `- The ${bossLabel(boss)} Full Moon operation is on ${boss.date} at ${boss.location}; Game8's recommended level is ${boss.level}+. When asked what level to be, give that number.${affinities.length ? ` Affinities (Game8): ${affinities.join(". ")}.` : ""}${boss.names.includes("Emperor") ? " Their weaknesses swap during the fight, so follow Fuuka's analysis." : ""}`,
    );
  }
  const guardians = guardiansIn(text);
  for (const guardian of guardians) lines.push(guardianLine(guardian));
  if (guardians.length) {
    lines.push("- State guardian affinities exactly as listed above (from Game8's guardian table); do not add weaknesses that are not listed.");
  }
  return lines;
}

function weaknessesOf(guardian: TartarusGuardian): AttackType[] {
  return (Object.entries(guardian.affinities) as Array<[AttackType, Affinity]>)
    .filter(([, affinity]) => affinity === "Weak")
    .map(([attack]) => attack);
}

/** "X has no weakness" or "X is weak to Y" that the guardian table contradicts. */
function guardianClaimProblems(rawSentence: string): string[] {
  const problems: string[] = [];
  const named = guardiansIn(rawSentence);
  // Work on the punctuation-free form so names and claim positions line up.
  const sentence = normalizeName(rawSentence);
  if (!named.length) return problems;
  for (const guardian of named) {
    const weak = weaknessesOf(guardian);
    if ((weak.length || guardian.unknown?.length) && /\b(?:no|doesnt have any|does not have any|has no|without any)\s+(?:real\s+|elemental\s+)?weakness(?:es)?\b/i.test(sentence)) {
      problems.push(
        weak.length
          ? `${guardian.name} is weak to ${weak.map((attack) => attackLabels[attack]).join(" and ")}.`
          : `${guardian.name}'s weaknesses aren't fully listed; don't say it has none.`,
      );
    }
  }
  // Attribute each "weak to X" to the nearest guardian named before it in the sentence.
  for (const claim of sentence.matchAll(/\b(?:is |are )?(?:weak(?:ness)?(?: to| against)?|vulnerable to)\s+([a-z]+)/gi)) {
    const before = sentence.slice(0, claim.index);
    const owner = named
      .map((guardian) => ({ guardian, at: [...before.matchAll(new RegExp(guardianNamePattern(guardian).source, "gi"))].pop()?.index ?? -1 }))
      .filter(({ at }) => at >= 0)
      .sort((a, b) => b.at - a.at)[0];
    if (!owner) continue;
    const between = before.slice(owner.at);
    if (/\b(?:enem(?:y|ies)|shadows?|you|your|party|members?|they|them)\b/i.test(between.replace(guardianNamePattern(owner.guardian), ""))) continue;
    const attack = (Object.keys(attackWords) as AttackType[]).find((key) => attackWords[key].test(claim[1]));
    if (!attack) continue;
    const affinity = owner.guardian.affinities[attack];
    // An attack type the list marks unknown may be a weakness on the boss's own page.
    if (owner.guardian.unknown?.includes(attack)) continue;
    if (affinity !== "Weak") {
      const weak = weaknessesOf(owner.guardian);
      problems.push(
        `${owner.guardian.name} is not weak to ${attackLabels[attack]}${affinity ? ` (it ${affinity === "Resist" ? "resists" : `${affinity.toLowerCase()}s`} it)` : ""}; ${weak.length ? `its weakness is ${weak.map((key) => attackLabels[key]).join(" and ")}` : "it has no listed weakness"}.`,
      );
    }
  }
  return problems;
}

/** Claims that contradict the canonical boss facts, one message per problem. */
export function bossFactContradictions(text: string): string[] {
  const problems: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) {
    problems.push(...guardianClaimProblems(sentence));
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

/**
 * A direct answer to "what is <guardian> weak to?" from the table. `extraWeak` are weaknesses
 * from the boss's own Game8 page for attack types the table marks unknown.
 */
export function guardianAffinityAnswer(guardian: TartarusGuardian, extraWeak: string[] = []): string {
  const entries = Object.entries(guardian.affinities) as Array<[AttackType, Affinity]>;
  const unknown = guardian.unknown ?? [];
  const filled = extraWeak
    .map((value) => (Object.keys(attackWords) as AttackType[]).find((attack) => attackWords[attack].test(value)))
    .filter((attack): attack is AttackType => Boolean(attack) && unknown.includes(attack!));
  const weak = [...new Set([...entries.filter(([, affinity]) => affinity === "Weak").map(([attack]) => attack), ...filled])];
  const list = (attacks: AttackType[]) => {
    const labels = attacks.map((attack) => attackLabels[attack]);
    return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : labels[0] ?? "";
  };
  const defensive = (["Repel", "Drain", "Null", "Resist"] as Affinity[])
    .map((affinity) => [affinity, entries.filter(([, value]) => value === affinity).map(([attack]) => attack)] as const)
    .filter(([, attacks]) => attacks.length)
    .map(([affinity, attacks]) => `${affinity === "Resist" ? "resists" : `${affinity.toLowerCase()}s`} ${list(attacks)}`);
  const stillUnknown = unknown.filter((attack) => !filled.includes(attack));
  const where = `${guardian.name} (the Tartarus ${guardian.floor}F guardian, recommended level ${guardian.level}+)`;
  const lead = weak.length
    ? `${where} is weak to ${list(weak)}.`
    : stillUnknown.length
      ? `${where} has no confirmed weakness in Game8's data (it has no data for ${list(stillUnknown)}).`
      : `${where} has no weakness to any attack type.`;
  const physicalOpen = !weak.length && !stillUnknown.length
    ? (["slash", "strike", "pierce"] as AttackType[]).filter((attack) => !guardian.affinities[attack])
    : [];
  return [
    lead,
    defensive.length ? `It ${defensive.join(", ")}.` : "",
    physicalOpen.length ? `${list(physicalOpen)} hit${physicalOpen.length === 1 ? "s" : ""} it for normal damage, so lean on physical attacks.` : "",
    weak.length && stillUnknown.length ? `Game8's list has no data for ${list(stillUnknown)}.` : "",
  ].filter(Boolean).join(" ");
}
