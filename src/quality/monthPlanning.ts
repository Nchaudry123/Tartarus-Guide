import type { PlayerProfile } from "../../lib/types";
import { parseGameDate, storyDeadlines } from "./dailyPlanner";
import { getProgressSnapshot } from "./progressTimeline";
import { socialLinkStarts, type SocialLinkStart } from "./socialLinkStarts";

/**
 * Canonical month-level planning facts (next Full Moon operation, Social Links that can be
 * started, the chapter's focus) for vague planning questions such as "What should I focus on
 * in June?". The same text is given to the model and counted as grounding evidence, so the
 * answer can name the operation and the links without the named-claim gate blocking it.
 */

const monthNames = ["January", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const planningQuestion =
  /\b(?:focus|prioriti[sz]e|priorities|plan(?:ning)?|split my time|spend (?:my )?(?:time|evenings|days)|should i (?:do|be doing|spend)|what should i|this (?:month|week)|prepare|before the (?:\w+ )?full moon|next full moon|grind(?:ing)?)\b/i;

export function asksForMonthPlan(question: string, intent?: string): boolean {
  return intent === "Daily Schedule Planning" || planningQuestion.test(question);
}

type PlanningDate = { month: string; day: number; ordinal: number; exactDay: boolean };

function questionMonth(question: string): string | undefined {
  return monthNames.find((month) =>
    month === "May" ? /\bMay\b|\bmay\s+\d{1,2}\b/.test(question) : new RegExp(`\\b${month}\\b`, "i").test(question),
  );
}

export function planningDate(profile: PlayerProfile, question = ""): PlanningDate | null {
  const exact = parseGameDate(question) ?? parseGameDate(profile.currentDate);
  const askedMonth = questionMonth(question);
  if (exact && (!askedMonth || askedMonth === exact.month)) {
    return { month: exact.month, day: exact.day, ordinal: exact.ordinal, exactDay: true };
  }
  const month = askedMonth ?? monthNames.find((name) => name.toLowerCase() === profile.currentMonth?.trim().toLowerCase());
  if (!month) return null;
  const first = parseGameDate(`${month} 1`);
  return first ? { month: first.month, day: 1, ordinal: first.ordinal, exactDay: false } : null;
}

function startOrdinal(link: SocialLinkStart): number | null {
  return parseGameDate(link.earliestStart)?.ordinal ?? null;
}

function monthEndOrdinal(month: string): number {
  for (const day of [31, 30, 29, 28]) {
    const parsed = parseGameDate(`${month} ${day}`);
    if (parsed) return parsed.ordinal;
  }
  return Number.POSITIVE_INFINITY;
}

export type MonthPlan = {
  month: string;
  dateLabel: string;
  nextFullMoon?: { title: string; date: string; daysAway: number };
  availableLinks: SocialLinkStart[];
  laterThisMonth: SocialLinkStart[];
  focus?: string;
};

export function buildMonthPlan(profile: PlayerProfile, question = ""): MonthPlan | null {
  const date = planningDate(profile, question);
  if (!date) return null;
  const nextFullMoon = storyDeadlines
    .filter((deadline) => /full moon/i.test(deadline.title))
    .map((deadline) => ({ deadline, parsed: parseGameDate(`${deadline.month} ${deadline.day}`) }))
    .find(({ parsed }) => parsed && parsed.ordinal >= date.ordinal);
  const end = monthEndOrdinal(date.month);
  const startable = socialLinkStarts.filter((link) => !link.automatic && startOrdinal(link) !== null);
  return {
    month: date.month,
    dateLabel: date.exactDay ? `${date.month} ${date.day}` : `early ${date.month}`,
    nextFullMoon: nextFullMoon?.parsed
      ? {
          title: nextFullMoon.deadline.title,
          date: `${nextFullMoon.deadline.month} ${nextFullMoon.deadline.day}`,
          daysAway: nextFullMoon.parsed.ordinal - date.ordinal,
        }
      : undefined,
    availableLinks: startable.filter((link) => (startOrdinal(link) ?? Infinity) <= date.ordinal),
    laterThisMonth: startable.filter((link) => {
      const start = startOrdinal(link) ?? Infinity;
      return start > date.ordinal && start <= end;
    }),
    focus: getProgressSnapshot({ ...profile, currentMonth: date.month })?.currentFocus,
  };
}

const linkLabel = (link: SocialLinkStart) => `${link.character} (${link.arcana})`;

export function monthPlanningBrief(profile: PlayerProfile, question = ""): string {
  const plan = buildMonthPlan(profile, question);
  if (!plan) return "";
  const lines = [`Canonical month plan for ${plan.dateLabel}:`];
  if (plan.nextFullMoon) {
    const when =
      plan.nextFullMoon.daysAway === 0 ? "today" : `in ${plan.nextFullMoon.daysAway} day${plan.nextFullMoon.daysAway === 1 ? "" : "s"}`;
    lines.push(
      `- Next Full Moon operation: ${plan.nextFullMoon.date}, ${plan.nextFullMoon.title.replace(/ Full Moon operation$/, "")} (${when}).`,
      "- Before a Full Moon operation, keep Tartarus progress and party levels on track and stock recovery items. Do not advise postponing Tartarus until after the operation.",
      "- Full Moon bosses share Arcana names with Social Links but are unrelated Shadows; never call a boss a Social Link.",
    );
  }
  if (plan.availableLinks.length) {
    lines.push(`- Social Links that can already be started: ${plan.availableLinks.map(linkLabel).join(", ")}.`);
  }
  if (plan.laterThisMonth.length) {
    lines.push(
      `- Social Links that open later in ${plan.month}: ${plan.laterThisMonth
        .map((link) => `${linkLabel(link)} from ${link.earliestStart}`)
        .join(", ")}.`,
    );
  }
  if (plan.focus) lines.push(`- Chapter focus: ${plan.focus}`);
  return lines.join("\n");
}

export function asksWhichLinksCanStart(question: string): boolean {
  return (
    /\b(?:which|what)\b/i.test(question) &&
    /\b(?:social links?|s-?links?)\b/i.test(question) &&
    /\b(?:available|unlock|start|begin|open)\b/i.test(question) &&
    !/\b(?:all|every)\b/i.test(question)
  );
}
