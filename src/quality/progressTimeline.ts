import type { PlayerProfile } from "../../lib/types";

type MonthProgress = {
  month: string;
  completedBefore: string[];
  currentSituation: string;
  currentFocus: string;
  currentMilestones: Array<{ day: number; summary: string }>;
};

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

const progressByMonth: Record<(typeof monthOrder)[number], Omit<MonthProgress, "month">> = {
  April: {
    completedBefore: [],
    currentSituation:
      "The protagonist has arrived at Gekkoukan, awakened to Persona, joined SEES, and begun investigating the Dark Hour and Tartarus.",
    currentFocus: "Learn the combat loop, establish early Social Links, and push through Thebel without overextending SP.",
    currentMilestones: [],
  },
  May: {
    completedBefore: [
      "The protagonist joined SEES and began exploring Tartarus during the Dark Hour.",
    ],
    currentSituation:
      "SEES is entering its first planned Full Moon operation while the Tartarus investigation expands beyond routine exploration.",
    currentFocus: "Prepare for the May 9 Priestess operation and keep early Social Links and Academics moving.",
    currentMilestones: [
      { day: 9, summary: "SEES defeated Priestess during the first major Full Moon operation." },
    ],
  },
  June: {
    completedBefore: [
      "SEES formed and began investigating the Dark Hour and Tartarus.",
      "Priestess was defeated during the May 9 Full Moon operation.",
    ],
    currentSituation:
      "The team is following the pattern of Arcana Shadows and dealing with the consequences of the next Full Moon operation.",
    currentFocus: "Prepare for Emperor and Empress, then account for Fuuka becoming SEES's navigator as the team grows.",
    currentMilestones: [
      { day: 8, summary: "SEES defeated Emperor and Empress during the Full Moon operation." },
      { day: 17, summary: "Fuuka joined SEES as the team's navigator after the Tartarus rescue." },
    ],
  },
  July: {
    completedBefore: [
      "SEES began investigating Tartarus and the Dark Hour.",
      "Priestess, Emperor, and Empress were defeated in the May and June Full Moon operations.",
      "Fuuka joined SEES as navigator.",
    ],
    currentSituation:
      "The Full Moon operations are becoming more dangerous and the investigation is broadening beyond Tartarus.",
    currentFocus: "Prepare for Hierophant and Lovers, then use the summer schedule to build stats, Social Links, and party depth.",
    currentMilestones: [
      { day: 7, summary: "SEES defeated Hierophant and Lovers at Shirakawa Boulevard." },
    ],
  },
  August: {
    completedBefore: [
      "SEES established the Tartarus investigation and added Fuuka as navigator.",
      "The team defeated Priestess, Emperor, Empress, Hierophant, and Lovers.",
    ],
    currentSituation:
      "SEES has entered the summer phase of the investigation, with the combat roster expanding and another paired Arcana operation approaching.",
    currentFocus: "Handle Chariot and Justice, then develop the expanded roster and use summer activities efficiently.",
    currentMilestones: [
      { day: 6, summary: "SEES defeated Chariot and Justice during the Full Moon operation." },
    ],
  },
  September: {
    completedBefore: [
      "SEES grew from its original group into a larger combat team.",
      "The Full Moon Shadows through Chariot and Justice were defeated.",
    ],
    currentSituation:
      "The team is past the halfway point of the known Full Moon operations and is confronting the Hermit operation.",
    currentFocus: "Prepare for Hermit's Electric pressure, keep Tartarus current, and protect school-time Social Link opportunities.",
    currentMilestones: [
      { day: 5, summary: "SEES defeated Hermit during the Full Moon operation." },
    ],
  },
  October: {
    completedBefore: [
      "SEES defeated the Full Moon Shadows from Priestess through Hermit.",
      "The team expanded its roster while continuing to climb Tartarus.",
    ],
    currentSituation:
      "The October operation marks a major turning point: the conflict with Strega and the cost of the mission become impossible to ignore.",
    currentFocus: "Prepare for Strength and Fortune, then reassess the party and story situation after the October 4 operation.",
    currentMilestones: [
      { day: 4, summary: "SEES defeated Strength and Fortune; the operation ended with a major loss for the team." },
    ],
  },
  November: {
    completedBefore: [
      "SEES defeated the Arcana Shadows from Priestess through Strength and Fortune.",
      "The October operation brought a major loss and pushed the Strega conflict to the foreground.",
    ],
    currentSituation:
      "SEES is approaching what it believes is the final Arcana Shadow operation, while Strega directly opposes the plan.",
    currentFocus: "Prepare for the November 3 battles and keep a manual save before major story transitions.",
    currentMilestones: [
      { day: 3, summary: "SEES fought Strega and defeated Hanged Man, the final Arcana Shadow in the operation plan." },
      { day: 4, summary: "The expected end of the Dark Hour did not occur, changing the team's understanding of the mission." },
    ],
  },
  December: {
    completedBefore: [
      "SEES completed every planned Full Moon operation through Hanged Man.",
      "Defeating the Arcana Shadows did not end the Dark Hour, and the truth behind the Fall became the central threat.",
    ],
    currentSituation:
      "The story has shifted from hunting Arcana Shadows to deciding whether SEES will remember the truth and face Nyx.",
    currentFocus: "Finish urgent Social Links and requests, strengthen endgame Personas, and keep a manual save before December 31.",
    currentMilestones: [
      { day: 31, summary: "The decisive choice was made to remember the truth and confront Nyx, opening the January endgame." },
    ],
  },
  January: {
    completedBefore: [
      "SEES formed, investigated Tartarus, and defeated every planned Full Moon Arcana Shadow from Priestess through Hanged Man.",
      "The team learned that defeating those Shadows did not end the Dark Hour and that the Fall remained ahead.",
      "The December 31 decision was made to remember the truth and fight Nyx rather than accept the alternate ending.",
    ],
    currentSituation:
      "This is the final preparation month. SEES is training for the promised January 31 mission to climb Tartarus and confront Nyx.",
    currentFocus: "Finish remaining Social Links and requests, reach the top of Adamah, build an endgame Persona roster, and stock recovery items for January 31.",
    currentMilestones: [
      { day: 31, summary: "SEES begins the final Tartarus mission and the battle against Nyx." },
    ],
  },
};

const bossMonths: Record<string, (typeof monthOrder)[number]> = {
  priestess: "May",
  emperor: "June",
  empress: "June",
  hierophant: "July",
  lovers: "July",
  chariot: "August",
  justice: "August",
  hermit: "September",
  fortune: "October",
  strength: "October",
  "hanged man": "November",
  nyx: "January",
  "nyx avatar": "January",
};

function normalizedMonth(value?: string): (typeof monthOrder)[number] | undefined {
  return monthOrder.find((month) => month.toLowerCase() === value?.trim().toLowerCase());
}

function currentDay(
  profile: PlayerProfile,
  currentMonth: (typeof monthOrder)[number],
): number | undefined {
  const value = profile.currentDate?.trim();
  if (!value) return undefined;
  const written = value.match(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i);
  if (written) {
    const writtenMonth = value.match(/^[a-z]+/i)?.[0];
    if (writtenMonth?.toLowerCase() !== currentMonth.toLowerCase()) return undefined;
    return Number(written[1]) || undefined;
  }
  const numeric = value.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (!numeric) return undefined;
  const calendarMonth = new Date(`${currentMonth} 1, 2000`).getMonth() + 1;
  if (Number(numeric[1]) !== calendarMonth) return undefined;
  return Number(numeric[2]) || undefined;
}

export type ProgressSnapshot = {
  month: string;
  completedMilestones: string[];
  currentSituation: string;
  currentFocus: string;
  staleProfileNote?: string;
};

export function getProgressSnapshot(profile: PlayerProfile): ProgressSnapshot | null {
  const month = normalizedMonth(profile.currentMonth);
  if (!month) return null;
  const chapter = progressByMonth[month];
  const day = currentDay(profile, month);
  const completedMilestones = [
    ...chapter.completedBefore,
    ...(day
      ? chapter.currentMilestones
          .filter((milestone) => milestone.day <= day)
          .map((milestone) => milestone.summary)
      : []),
  ];

  let staleProfileNote: string | undefined;
  const recentBoss = profile.recentBoss?.trim().toLowerCase();
  const bossMonth = recentBoss ? bossMonths[recentBoss] : undefined;
  if (
    bossMonth &&
    monthOrder.indexOf(bossMonth) < monthOrder.indexOf(month)
  ) {
    staleProfileNote =
      `${profile.recentBoss} belongs to the ${bossMonth} chapter, so it is historical context rather than the player's current story position.`;
  }

  return {
    month,
    completedMilestones,
    currentSituation: chapter.currentSituation,
    currentFocus: chapter.currentFocus,
    staleProfileNote,
  };
}

export function formatProgressContext(profile: PlayerProfile): string {
  const snapshot = getProgressSnapshot(profile);
  if (!snapshot) return "Canonical progress timeline: current month is not set.";
  return [
    `Canonical progress timeline for ${snapshot.month}:`,
    `Completed before or by the stated date: ${snapshot.completedMilestones.join(" ") || "No earlier monthly milestone is assumed."}`,
    `Current chapter: ${snapshot.currentSituation}`,
    `Appropriate current focus: ${snapshot.currentFocus}`,
    snapshot.staleProfileNote ? `Profile reconciliation: ${snapshot.staleProfileNote}` : "",
    "Do not treat a boss from an earlier month as recent. Do not assume a dated event later in the current month has happened unless the player supplied a date at or after it.",
  ].filter(Boolean).join("\n");
}
