import type { PlayerProfile } from "../../lib/types";
import { parseGameDate } from "./dailyPlanner";
import { bossFactsForPrompt } from "./bossFacts";

/**
 * Canonical, spoiler-safe progress facts the answer model must not get wrong:
 * which Tartarus block a floor belongs to, and which combat members have joined by the
 * player's date. Joins only: departures and story events stay out (spoilers).
 * Sources: the indexed IGN/Game8 Tartarus block and monthly walkthrough pages.
 */

export const tartarusBlockRanges = [
  { block: "Thebel", first: 2, last: 22 },
  { block: "Arqa", first: 23, last: 69 },
  { block: "Yabbashah", first: 70, last: 118 },
  { block: "Tziah", first: 119, last: 172 },
  { block: "Harabah", first: 173, last: 226 },
  { block: "Adamah", first: 227, last: 264 },
] as const;

export function tartarusBlockForFloor(floor: number): (typeof tartarusBlockRanges)[number] | null {
  return tartarusBlockRanges.find((range) => floor >= range.first && floor <= range.last) ?? null;
}

/** Combat party members and the in-game date each can first join Tartarus runs. */
export const combatMemberJoinDates = [
  { member: "Yukari", joins: "April 1" },
  { member: "Junpei", joins: "April 1" },
  { member: "Akihiko", joins: "May 23" },
  { member: "Mitsuru", joins: "June 13" },
  { member: "Aigis", joins: "July 24" },
  { member: "Koromaru", joins: "August 8" },
  { member: "Ken", joins: "August 28" },
  { member: "Shinjiro", joins: "September 2" },
] as const;

const monthNames = ["January", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function playerOrdinal(profile: PlayerProfile): { ordinal: number; label: string } | null {
  const exact = parseGameDate(profile.currentDate);
  if (exact) return { ordinal: exact.ordinal, label: `${exact.month} ${exact.day}` };
  const month = monthNames.find((name) => name.toLowerCase() === profile.currentMonth?.trim().toLowerCase());
  const start = month ? parseGameDate(`${month} 1`) : null;
  // Month only: use the 1st, so nobody who joins later that month is assumed available.
  return start ? { ordinal: start.ordinal, label: `early ${start.month}` } : null;
}

export function combatMembersJoinedBy(profile: PlayerProfile): { label: string; members: string[] } | null {
  const date = playerOrdinal(profile);
  if (!date) return null;
  return {
    label: date.label,
    members: combatMemberJoinDates
      .filter((entry) => (parseGameDate(entry.joins)?.ordinal ?? Infinity) <= date.ordinal)
      .map((entry) => entry.member),
  };
}

/** Floor the player mentioned: saved profile first, then "floor 18" / "18F" in the text. */
export function playerFloor(profile: PlayerProfile, text = ""): number | null {
  const fromProfile = profile.tartarusFloor?.match(/\d{1,3}/)?.[0];
  const fromText =
    text.match(/\b(?:floor|fl\.?)\s*(\d{1,3})\b/i)?.[1] ?? text.match(/\b(\d{1,3})\s*(?:f|th floor)\b/i)?.[1];
  const value = Number(fromProfile ?? fromText);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function progressFactsForPrompt(profile: PlayerProfile, text = ""): string {
  const lines: string[] = [];
  const floor = playerFloor(profile, text);
  const block = floor ? tartarusBlockForFloor(floor) : null;
  if (floor && block) {
    lines.push(`- Tartarus floor ${floor} is in the ${block.block} block (floors ${block.first}-${block.last}).`);
  }
  const roster = combatMembersJoinedBy(profile);
  if (roster) {
    lines.push(
      `- Combat party members who have joined by ${roster.label}: ${roster.members.join(", ")}. Only suggest or name these fighters; never mention anyone who has not joined yet.`,
    );
  }
  lines.push(...bossFactsForPrompt(profile, text));
  return lines.length ? ["Canonical progress facts:", ...lines].join("\n") : "";
}
