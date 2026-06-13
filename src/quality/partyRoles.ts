import type { PlayerProfile } from "../../lib/types";

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

export function partyRoleFactsForPrompt(): string {
  return [
    "Canonical Persona 3 Reload party-role facts:",
    "- After Fuuka joins SEES, she is the permanent navigator for exploration and battle support.",
    "- Fuuka is not a selectable frontline combatant and does not consume one of the three combat-party slots beside the protagonist.",
    "- Never frame party building as choosing Fuuka or a combat member. Aigis and every other selectable fighter compete only for frontline slots.",
    "- Describe a battle team as the protagonist plus three selectable combat members, with Fuuka supporting the team separately as navigator.",
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

  return [...new Set(contradictions)];
}

