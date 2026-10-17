import type { PlayerProfile } from "../../lib/types";
import { battleFactContradictions, battleFactsForPrompt } from "./battleFacts";

export const combatPartyMembers = [
  "Yukari",
  "Junpei",
  "Akihiko",
  "Mitsuru",
  "Aigis",
  "Koromaru",
  "Ken",
  "Shinjiro",
] as const;

const combatMemberNames = new Map(
  combatPartyMembers.map((member) => [member.toLowerCase(), member]),
);

export function normalizeCombatParty(
  members: PlayerProfile["activeParty"],
): string[] | undefined {
  if (!members?.length) return undefined;
  const normalized = [
    ...new Set(
      members
        .map((member) => combatMemberNames.get(member.trim().toLowerCase()))
        .filter((member): member is (typeof combatPartyMembers)[number] => Boolean(member)),
    ),
  ].slice(0, 3);
  return normalized.length ? normalized : undefined;
}

/**
 * The combat party a message actually states, or undefined. Mentioning one member ("junpei
 * keeps dying") is not a party statement and must not replace the saved party; two or more
 * names, or a cue like "my party is" / "with Yukari", is.
 */
export function statedCombatParty(text: string): string[] | undefined {
  const named = combatPartyMembers.filter((member) => new RegExp(`\\b${member}\\b`, "i").test(text));
  if (!named.length) return undefined;
  const memberPattern = combatPartyMembers.join("|");
  const statesParty =
    named.length >= 2 ||
    new RegExp(
      `\\b(?:my (?:party|team|squad|lineup)|party (?:is|has)|team (?:is|has)|(?:with|using|running|bringing|brought|took|taking)\\s+(?:only\\s+)?(?:${memberPattern}))\\b`,
      "i",
    ).test(text);
  return statesParty ? normalizeCombatParty(named) : undefined;
}

export function partyRoleFactsForPrompt(): string {
  return [
    "Canonical Persona 3 Reload party-role facts:",
    "- After Fuuka joins SEES, she is the permanent navigator for exploration and battle support.",
    "- Fuuka is not a selectable frontline combatant and does not consume one of the three combat-party slots beside the protagonist.",
    "- Never frame party building as choosing Fuuka or a combat member. Aigis and every other selectable fighter compete only for frontline slots.",
    "- Describe a battle team as the protagonist plus three selectable combat members, with Fuuka supporting the team separately as navigator.",
    "- Only the protagonist (the Wild Card) can switch, fuse or equip different Personas. Every party member has one fixed Persona that evolves through the story; never suggest giving a party member a different Persona or fusing one for them.",
    "- To help a struggling party member, use their level, weapons, armor and accessories, healing and buffs (Dia, Rakukaja), Guard, tactics commands, or swapping them out for another joined member.",
    "- Battles have no front or back row and no formation; never suggest positioning a character.",
    "",
    battleFactsForPrompt(),
  ].join("\n");
}

function responseText(value: {
  answer: string;
  sections?: Array<{ title: string; content: string }>;
  tables?: Array<{ title: string; columns: string[]; rows: string[][] }>;
}): string {
  return [
    value.answer,
    ...(value.sections ?? []).flatMap((section) => [section.title, section.content]),
    ...(value.tables ?? []).flatMap((table) => [
      table.title,
      ...table.columns,
      ...table.rows.flat(),
    ]),
  ].join(" ");
}

// "Give Junpei a Persona..." / "give him a better Persona": party members can't switch Personas.
const personaForMemberPattern =
  /\b(?:give|giving|gave|equip|equipping|swap|swapping|switch|switching|change|changing|fuse|fusing)\b.{0,25}\b(?:Yukari|Junpei|Akihiko|Mitsuru|Aigis|Koromaru|Ken|Shinjiro|him|her)(?:'s)?\b.{0,30}\bPersona\b/i;
const battleRowPattern =
  /\b(?:back|front)\s+(?:row|line)\b|\b(?:in|to|into|at)\s+(?:the\s+)?back\b(?!\s+(?:of|to|on|up|home))|\b(?:put|putting|move|moving|keep|keeping|swap|swapping)\b.{0,25}\bin back\b/i;

/** True when a short chip or sentence breaks party rules (Persona swaps, battle rows). */
// "What Persona should Akihiko use?" — same rule, phrased as a question.
const personaQuestionPattern = /\b(?:which|what)\s+Persona\s+should\s+(?:Yukari|Junpei|Akihiko|Mitsuru|Aigis|Koromaru|Ken|Shinjiro|he|she)\s+(?:use|equip|have|run)\b/i;

export function breaksPartyRules(text: string): boolean {
  return (
    personaForMemberPattern.test(text) ||
    personaQuestionPattern.test(text) ||
    battleRowPattern.test(text) ||
    battleFactContradictions(text).length > 0
  );
}

/**
 * Removes sentences that break party rules (giving a party member a Persona, battle rows).
 * For reply paths without a regenerate step, such as casual chat.
 */
export function withoutPartyRuleViolations(text: string): string {
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !breaksPartyRules(sentence));
  return kept.length ? kept.join(" ") : text;
}

export function partyRoleContradictions(response: {
  answer: string;
  sections?: Array<{ title: string; content: string }>;
  tables?: Array<{ title: string; columns: string[]; rows: string[][] }>;
}): string[] {
  const text = responseText(response);
  const contradictions: string[] = [];

  if (/\b(?:Fuuka|Fuuka Yamagishi)\b.{0,70}\b(?:or|versus|vs\.?)\b.{0,70}\b(?:Aigis|Yukari|Junpei|Akihiko|Mitsuru|Koromaru|Ken|Shinjiro)\b/i.test(text)) {
    contradictions.push("Fuuka cannot be presented as an alternative to a frontline combat member.");
  }
  if (/\b(?:replace|swap(?:\s+out)?|bench|drop|remove)\s+Fuuka\b|\bFuuka\b.{0,50}\b(?:replace|swap(?:ped)? out|bench|drop|remove)\b/i.test(text)) {
    contradictions.push("Fuuka is the navigator and cannot be swapped out of a frontline slot.");
  }
  if (/\bFuuka\b.{0,60}\b(?:frontline|active party|combat slot|fighter|physical attacker|magic attacker|healer slot)\b/i.test(text)) {
    contradictions.push("Fuuka is not a selectable frontline combatant.");
  }

  if (personaForMemberPattern.test(text) ||
      /\b(?:Yukari|Junpei|Akihiko|Mitsuru|Aigis|Koromaru|Ken|Shinjiro)(?:'s)?\s+(?:new |different )?Persona\s+(?:to|for|with)\b.{0,40}\b(?:resist|null|block)/i.test(text)) {
    contradictions.push("Party members have one fixed Persona; only the protagonist can switch or fuse Personas.");
  }
  contradictions.push(...battleFactContradictions(text));
  if (battleRowPattern.test(text)) {
    contradictions.push("Persona 3 Reload battles have no front or back row.");
  }

  return [...new Set(contradictions)];
}

