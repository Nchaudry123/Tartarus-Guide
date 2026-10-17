/**
 * Canonical battle facts the model kept getting wrong from memory, taken from the indexed
 * sources rather than recalled:
 * - party members' elemental weaknesses/resistances, from IGN and Game8 boss and Tartarus
 *   strategy pages (only members the guides state explicitly; others are left out);
 * - what common support skills do, from the Megaten fusion tool skill data.
 */

type Element = "Fire" | "Ice" | "Electric" | "Wind" | "Light" | "Dark";

export const partyAffinities: Record<string, { weak?: Element; resists?: Element[] }> = {
  Yukari: { weak: "Electric", resists: ["Wind"] },
  Junpei: { weak: "Wind" },
  Akihiko: { weak: "Ice" },
  Mitsuru: { weak: "Fire" },
  Koromaru: { weak: "Light" },
  Ken: { resists: ["Light"] },
};

export const supportSkillEffects: Record<string, string> = {
  Patra: "cures Distress, Confuse, Charm and Rage on one ally (it does not remove buffs or debuffs)",
  "Me Patra": "cures Distress, Confuse, Charm and Rage on all allies",
  Dekaja: "removes the enemies' -kaja buffs",
  Dekunda: "removes -kunda debuffs from your party",
  Tarukaja: "raises one ally's attack",
  Rakukaja: "raises one ally's defense",
  Sukukaja: "raises one ally's hit rate and evasion",
  Tarunda: "lowers one foe's attack",
  Rakunda: "lowers one foe's defense",
  Sukunda: "lowers one foe's hit rate and evasion",
  Dia: "restores one ally's HP",
  Media: "restores all allies' HP",
  Recarm: "revives a downed ally",
};

export function battleFactsForPrompt(): string {
  const affinities = Object.entries(partyAffinities)
    .map(([member, facts]) =>
      [
        facts.weak ? `${member} is weak to ${facts.weak}` : undefined,
        facts.resists?.length ? `${member} resists ${facts.resists.join(" and ")}` : undefined,
      ]
        .filter(Boolean)
        .join("; "),
    )
    .join(". ");
  const skills = Object.entries(supportSkillEffects)
    .map(([skill, effect]) => `${skill} ${effect}`)
    .join("; ");
  return [
    "Canonical battle facts (from the indexed guides; do not contradict them, and don't state a party member's weakness unless it is listed here):",
    `- Party affinities: ${affinities}.`,
    `- Support skills: ${skills}.`,
  ].join("\n");
}

const elementWords: Record<Element, RegExp> = {
  Fire: /\bfire\b/i,
  Ice: /\bice\b/i,
  Electric: /\b(?:electric(?:ity)?|elec|lightning|zio)\b/i,
  Wind: /\bwind\b/i,
  Light: /\blight\b/i,
  Dark: /\bdark(?:ness)?\b/i,
};

/** Claims that contradict the canonical battle facts, one message per problem. */
export function battleFactContradictions(text: string): string[] {
  const problems: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) {
    for (const [member, facts] of Object.entries(partyAffinities)) {
      if (!facts.weak || !new RegExp(`\\b${member}\\b`, "i").test(sentence)) continue;
      const weaknessClaim = new RegExp(
        `\\b${member}(?:'s|’s)?\\b([^.]{0,30}?)\\b(?:weak(?:ness)?(?: to| against)?|vulnerable to)\\s+([a-z]+)`,
        "i",
      ).exec(sentence);
      if (!weaknessClaim) continue;
      // "Junpei's fire skills on enemies weak to Fire" is about the enemies, and
      // "Junpei ... and Akihiko is weak to Ice" belongs to Akihiko.
      const gap = weaknessClaim[1];
      const otherMember = Object.keys(partyAffinities).some((name) => name !== member && new RegExp(`\\b${name}\\b`, "i").test(gap));
      if (otherMember || /\b(?:enem(?:y|ies)|shadows?|foes?|boss(?:es)?|they|them|it|those|these|anything)\b/i.test(gap)) continue;
      const claimed = (Object.keys(elementWords) as Element[]).find((element) => elementWords[element].test(weaknessClaim[2]));
      if (claimed && claimed !== facts.weak) {
        problems.push(`${member} is weak to ${facts.weak}, not ${claimed}.`);
      }
    }
    if (/\bpatra\b/i.test(sentence) && /\b(?:buffs?|debuffs?|-kaja|-kunda|stat boosts?)\b/i.test(sentence) && !/\b(?:not|doesn['’]t|does not|won['’]t|can['’]t)\b/i.test(sentence)) {
      problems.push("Patra cures ailments (Distress, Confuse, Charm, Rage); Dekaja removes enemy buffs and Dekunda removes your debuffs.");
    }
    if (/\bdekaja\b/i.test(sentence) && /\b(?:your|ally|allies|party|team)(?:'s)?\s+(?:de)?buffs?\b|\bdebuffs?\b/i.test(sentence) && !/\bdekunda\b/i.test(sentence)) {
      problems.push("Dekaja removes enemy buffs; Dekunda removes debuffs from your party.");
    }
  }
  return [...new Set(problems)];
}
