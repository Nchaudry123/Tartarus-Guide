import type { DailyDashboard, DailyPlanItem, PlayerProfile } from "../../lib/types";
import type { FactMatch } from "../types/schema";
import { socialLinkStarts, type SocialLinkStart } from "./socialLinkStarts";

const monthOrder = [
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "January",
] as const;

type GameMonth = (typeof monthOrder)[number];

type GameDate = {
  month: GameMonth;
  day: number;
  year: number;
  weekday: string;
  ordinal: number;
  timestamp: number;
};

const storyDeadlines = [
  { month: "May", day: 9, title: "Priestess Full Moon operation" },
  { month: "June", day: 8, title: "Emperor and Empress Full Moon operation" },
  { month: "July", day: 7, title: "Hierophant and Lovers Full Moon operation" },
  { month: "August", day: 6, title: "Chariot and Justice Full Moon operation" },
  { month: "September", day: 5, title: "Hermit Full Moon operation" },
  { month: "October", day: 4, title: "Strength and Fortune Full Moon operation" },
  { month: "November", day: 3, title: "Hanged Man Full Moon operation" },
  { month: "December", day: 31, title: "December 31 story decision" },
  { month: "January", day: 31, title: "Final Tartarus mission" },
] as const;

const priorityOrder: Record<DailyPlanItem["priority"], number> = {
  urgent: 0,
  recommended: 1,
  optional: 2,
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function gameOrdinal(month: GameMonth, day: number): number {
  return monthOrder.indexOf(month) * 40 + day;
}

function gameYear(month: GameMonth): number {
  return month === "January" ? 2010 : 2009;
}

function validCalendarDay(month: GameMonth, day: number): boolean {
  if (!Number.isInteger(day) || day < 1) return false;
  const year = gameYear(month);
  return new Date(Date.UTC(year, new Date(`${month} 1, 2000`).getMonth(), day)).getUTCDate() === day;
}

export function parseGameDate(value?: string): GameDate | null {
  const text = value?.trim();
  if (!text) return null;

  const written = text.match(
    /\b(january|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
  );
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  let month: GameMonth | undefined;
  let day: number | undefined;

  if (written) {
    month = monthOrder.find(
      (candidate) => candidate.toLowerCase() === written[1].toLowerCase(),
    );
    day = Number(written[2]);
  } else if (numeric) {
    const calendarMonth = Number(numeric[1]);
    month = monthOrder.find(
      (candidate) => new Date(`${candidate} 1, 2000`).getMonth() + 1 === calendarMonth,
    );
    day = Number(numeric[2]);
  }

  if (!month || !day || !validCalendarDay(month, day)) return null;
  const year = gameYear(month);
  const calendarMonth = new Date(`${month} 1, 2000`).getMonth();
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, calendarMonth, day)));

  return {
    month,
    day,
    year,
    weekday,
    ordinal: gameOrdinal(month, day),
    timestamp: Date.UTC(year, calendarMonth, day),
  };
}

export function asksForDailyDashboard(question: string): boolean {
  return (
    /\b(?:what should i do|what can i do|plan my day|daily plan|today'?s plan|game day dashboard)\b/i.test(
      question,
    ) &&
    /\b(?:today|day|now|dashboard)\b/i.test(question)
  );
}

function parseStartOrdinal(link: SocialLinkStart): number | null {
  if (link.earliestStart === "No fixed date") return null;
  const parsed = parseGameDate(link.earliestStart);
  return parsed?.ordinal ?? null;
}

function availableOnWeekday(availability: string, weekday: string): boolean {
  const text = availability.toLowerCase();
  const day = weekday.toLowerCase();
  if (text.includes("every day")) return true;
  if (text.includes(day)) return true;

  const ranges: Array<[string, string]> = [
    ["monday", "sunday"],
    ["tuesday", "sunday"],
    ["thursday", "sunday"],
  ];
  const weekdays = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  return ranges.some(([start, end]) => {
    if (!text.includes(`${start} through ${end}`)) return false;
    const dayIndex = weekdays.indexOf(day);
    return dayIndex >= weekdays.indexOf(start) && dayIndex <= weekdays.indexOf(end);
  });
}

function trackedSocialLinks(profile: PlayerProfile, date: GameDate): SocialLinkStart[] {
  const tracked = profile.currentSocialLinks?.map(normalize).filter(Boolean) ?? [];
  if (!tracked.length) return [];
  return socialLinkStarts.filter((link) => {
    if (link.automatic || !availableOnWeekday(link.availability, date.weekday)) return false;
    const matches = tracked.some((value) =>
      [link.character, link.arcana, ...link.aliases].some((alias) => {
        const normalizedAlias = normalize(alias);
        return value === normalizedAlias || value.includes(normalizedAlias) || normalizedAlias.includes(value);
      }),
    );
    if (!matches) return false;
    const start = parseStartOrdinal(link);
    return start === null || start <= date.ordinal;
  });
}

function requestMatchesTracked(fact: FactMatch, tracked: string): boolean {
  const entityNames = [fact.entity.name, ...fact.entity.aliases].map(normalize);
  const value = normalize(tracked);
  if (!value) return false;
  if (entityNames.some((entity) => entity.includes(value) || value.includes(entity))) {
    return true;
  }
  const requestNumber = value.match(/\b\d{1,3}\b/)?.[0];
  return requestNumber
    ? entityNames.some((entity) => new RegExp(`\\b${requestNumber}\\b`).test(entity))
    : false;
}

function deadlineFromFact(fact: FactMatch): GameDate | null {
  if (fact.fact_type !== "deadline") return null;
  return parseGameDate(fact.value);
}

function requestItems(
  profile: PlayerProfile,
  date: GameDate,
  requestFacts: FactMatch[],
): DailyPlanItem[] {
  const tracked = profile.activeRequests?.filter(Boolean).slice(0, 8) ?? [];
  return tracked.map((request) => {
    const matchingFacts = requestFacts.filter((fact) => requestMatchesTracked(fact, request));
    const deadlineFact = matchingFacts.find((fact) => deadlineFromFact(fact));
    const deadline = deadlineFact ? deadlineFromFact(deadlineFact) : null;
    const details = matchingFacts.find((fact) => fact.fact_type === "strategy")?.value
      ?? matchingFacts.find((fact) => fact.fact_type === "prerequisite")?.value;
    const title = matchingFacts[0]?.entity.name ?? `Elizabeth request ${request}`;

    if (!deadline) {
      return {
        priority: "recommended",
        category: "Request",
        title,
        detail: details
          ? `${details} The indexed guide does not provide a confirmed deadline, so finish it when convenient.`
          : "This is marked active in Player Memory. Its deadline is not confirmed in the indexed guide, so review it before spending the day.",
        timing: "Check before choosing another activity",
      };
    }

    const daysRemaining = Math.round((deadline.timestamp - date.timestamp) / 86_400_000);
    const priority = daysRemaining <= 3 ? "urgent" : daysRemaining <= 7 ? "recommended" : "optional";
    const timing = daysRemaining < 0
      ? `Deadline passed ${titleCase(deadline.month)} ${deadline.day}`
      : daysRemaining === 0
        ? "Due today"
        : `Due ${deadline.month} ${deadline.day} · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`;
    return {
      priority,
      category: "Request",
      title,
      detail: details ?? "Complete the request before its confirmed deadline.",
      timing,
    };
  });
}

function nextStoryDeadline(date: GameDate): DailyPlanItem | null {
  const next = storyDeadlines
    .map((deadline) => ({
      ...deadline,
      ordinal: gameOrdinal(deadline.month, deadline.day),
      timestamp: Date.UTC(
        gameYear(deadline.month),
        new Date(`${deadline.month} 1, 2000`).getMonth(),
        deadline.day,
      ),
    }))
    .find((deadline) => deadline.ordinal >= date.ordinal);
  if (!next) return null;

  const daysRemaining = Math.round((next.timestamp - date.timestamp) / 86_400_000);
  const priority = daysRemaining <= 3 ? "urgent" : "recommended";
  return {
    priority,
    category: "Tartarus",
    title: next.title,
    detail:
      next.month === "December"
        ? "Finish urgent Social Links and requests, prepare endgame Personas, and keep a manual save."
        : "Use Tartarus time to reach the current border floor, update equipment, and preserve recovery items for the operation.",
    timing:
      daysRemaining === 0
        ? "Today"
        : `${next.month} ${next.day} · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} away`,
  };
}

function activityItem(profile: PlayerProfile, links: SocialLinkStart[]): DailyPlanItem {
  if (links.length) {
    return {
      priority: "optional",
      category: "Activity",
      title: "Use the remaining time slot deliberately",
      detail:
        "After your priority Social Link, use the next free slot for a Player Memory goal, a Social Stat requirement, equipment, or recovery.",
      timing: "After the priority activity",
    };
  }

  const stats = profile.socialStats ?? {};
  const numericStats = (["academics", "charm", "courage"] as const)
    .map((name) => ({ name, rank: Number.parseInt(stats[name] ?? "", 10) }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((left, right) => left.rank - right.rank);
  const target = numericStats[0]?.name;
  return {
    priority: "optional",
    category: "Activity",
    title: target ? `Raise ${titleCase(target)}` : "Build a Social Stat or finish a personal goal",
    detail: target
      ? `${titleCase(target)} is your lowest tracked Social Stat. Use a free slot on an activity that raises it.`
      : "No eligible tracked Social Link is available today. Use the open slot for Academics, Charm, Courage, equipment, or recovery.",
    timing: "Best open time slot",
  };
}

export function buildDailyDashboard(
  profile: PlayerProfile,
  requestFacts: FactMatch[] = [],
): DailyDashboard | null {
  const date = parseGameDate(profile.currentDate);
  if (!date) return null;

  const links = trackedSocialLinks(profile, date);
  const items: DailyPlanItem[] = [
    ...requestItems(profile, date, requestFacts),
    ...links.slice(0, 3).map((link): DailyPlanItem => ({
      priority: "recommended",
      category: "Social Link",
      title: `${link.character} · ${link.arcana}`,
      detail: `${link.location}. ${link.requirement}`,
      timing: link.availability,
    })),
  ];
  const deadline = nextStoryDeadline(date);
  if (deadline) items.push(deadline);

  if (!profile.currentSocialLinks?.length) {
    items.push({
      priority: "optional",
      category: "Social Link",
      title: "Track your active Social Links",
      detail:
        "Add the character or Arcana names in Player Memory and the dashboard will only rank links you have actually unlocked.",
      timing: "Player Memory",
    });
  }
  if (!profile.activeRequests?.length) {
    items.push({
      priority: "optional",
      category: "Request",
      title: "Track active Elizabeth requests",
      detail:
        "Add request numbers or names in Player Memory so expiring requests can move into the urgent lane automatically.",
      timing: "Player Memory",
    });
  }
  items.push(activityItem(profile, links));
  items.sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority]);

  return {
    date: `${date.month} ${date.day}`,
    weekday: date.weekday,
    items,
  };
}
