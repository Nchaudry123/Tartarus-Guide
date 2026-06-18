export type SocialLinkStart = {
  character: string;
  arcana: string;
  aliases: string[];
  earliestStart: string;
  requirement: string;
  location: string;
  availability: string;
  automatic: boolean;
};

export const SOCIAL_LINK_START_SOURCE = {
  title: "All Social Links and How to Unlock Them",
  url: "https://game8.co/games/Persona-3-Reload/archives/435602",
  domain: "game8.co",
} as const;

export const socialLinkStarts: SocialLinkStart[] = [
  {
    character: "SEES",
    arcana: "Fool",
    aliases: ["sees", "fool"],
    earliestStart: "April 18",
    requirement: "Starts automatically through the story.",
    location: "Story event",
    availability: "Ranks advance automatically.",
    automatic: true,
  },
  {
    character: "Kenji Tomochika",
    arcana: "Magician",
    aliases: ["kenji", "kenji tomochika", "magician"],
    earliestStart: "April 22",
    requirement: "Speak with Kenji after school.",
    location: "Classroom 2F",
    availability: "Tuesday, Thursday, and Friday after school",
    automatic: false,
  },
  {
    character: "Fuuka Yamagishi",
    arcana: "Priestess",
    aliases: ["fuuka", "fuuka yamagishi", "priestess"],
    earliestStart: "June 19",
    requirement: "Reach Courage Rank 6 and start Keisuke's Fortune Social Link.",
    location: "Outside Classroom 2F",
    availability: "Monday, Friday, and Saturday after school",
    automatic: false,
  },
  {
    character: "Mitsuru Kirijo",
    arcana: "Empress",
    aliases: ["mitsuru", "mitsuru kirijo", "empress"],
    earliestStart: "November 21",
    requirement: "Reach Academics Rank 6.",
    location: "Faculty Office Hallway",
    availability: "Tuesday, Thursday, and Saturday after school",
    automatic: false,
  },
  {
    character: "Hidetoshi Odagiri",
    arcana: "Emperor",
    aliases: ["hidetoshi", "hidetoshi odagiri", "emperor"],
    earliestStart: "April 27",
    requirement: "Join the Student Council when Mitsuru invites you.",
    location: "Student Council Room",
    availability: "Monday, Wednesday, Friday, and Saturday after school",
    automatic: false,
  },
  {
    character: "Bunkichi and Mitsuko",
    arcana: "Hierophant",
    aliases: ["bunkichi", "mitsuko", "bunkichi and mitsuko", "old couple", "hierophant"],
    earliestStart: "April 25",
    requirement: "Bring them the Persimmon Leaf from the tree at Gekkoukan High.",
    location: "Bookworms Used Books",
    availability: "Tuesday through Sunday during the day",
    automatic: false,
  },
  {
    character: "Yukari Takeba",
    arcana: "Lovers",
    aliases: ["yukari", "yukari takeba", "lovers", "lover"],
    earliestStart: "July 25",
    requirement: "Reach Charm Rank 6.",
    location: "Classroom 2F",
    availability: "Monday, Wednesday, Thursday, and Saturday after school",
    automatic: false,
  },
  {
    character: "Kazushi Miyamoto",
    arcana: "Chariot",
    aliases: ["kazushi", "kazushi miyamoto", "chariot"],
    earliestStart: "April 23",
    requirement: "Join the Track Team, Swim Team, or Kendo Team.",
    location: "School sports club",
    availability: "Monday, Tuesday, Thursday, and Friday after school",
    automatic: false,
  },
  {
    character: "Chihiro Fushimi",
    arcana: "Justice",
    aliases: ["chihiro", "chihiro fushimi", "justice"],
    earliestStart: "May 7",
    requirement: "Start Emperor, then speak with Chihiro on three separate days.",
    location: "Student Council Room hallway",
    availability: "Tuesday, Thursday, and Saturday after school",
    automatic: false,
  },
  {
    character: "Maya",
    arcana: "Hermit",
    aliases: ["maya", "hermit"],
    earliestStart: "April 29",
    requirement: "Play Innocent Sin Online on the dorm laptop.",
    location: "Dorm room laptop",
    availability: "Sunday during the day",
    automatic: false,
  },
  {
    character: "Keisuke Hiraga",
    arcana: "Fortune",
    aliases: ["keisuke", "keisuke hiraga", "fortune"],
    earliestStart: "June 17",
    requirement: "Join the Art Club.",
    location: "Art Room",
    availability: "Tuesday, Wednesday, and Thursday after school",
    automatic: false,
  },
  {
    character: "Yuko Nishiwaki",
    arcana: "Strength",
    aliases: ["yuko", "yuko nishiwaki", "strength"],
    earliestStart: "April 24",
    requirement: "Accept Yuko's walk-home invitations during Chariot Ranks 1 and 2.",
    location: "Classroom 2F hallway",
    availability: "Wednesday and Saturday after school",
    automatic: false,
  },
  {
    character: "Maiko Oohashi",
    arcana: "Hanged Man",
    aliases: ["maiko", "maiko oohashi", "hanged man", "hanged"],
    earliestStart: "May 6",
    requirement: "Give Maiko a Weird Takoyaki and a Mad Bull.",
    location: "Naganaki Shrine",
    availability: "Monday, Wednesday, and Saturday after school",
    automatic: false,
  },
  {
    character: "Pharos",
    arcana: "Death",
    aliases: ["pharos", "death"],
    earliestStart: "June 12",
    requirement: "Starts automatically through the story.",
    location: "Story event",
    availability: "Ranks advance automatically.",
    automatic: true,
  },
  {
    character: "Bebe",
    arcana: "Temperance",
    aliases: ["bebe", "andre laurent jean geraux", "temperance"],
    earliestStart: "May 26",
    requirement: "Reach Academics Rank 2 and Hierophant Rank 3, then join the Fashion Club.",
    location: "Home Economics Room",
    availability: "Tuesday, Wednesday, and Friday after school",
    automatic: false,
  },
  {
    character: "President Tanaka",
    arcana: "Devil",
    aliases: ["tanaka", "president tanaka", "devil"],
    earliestStart: "No fixed date",
    requirement:
      "Reach Hermit Rank 4 and Charm Rank 4, then pay Tanaka 40,000 yen across his meetings.",
    location: "Paulownia Mall",
    availability: "Tuesday and Saturday at night",
    automatic: false,
  },
  {
    character: "Mutatsu",
    arcana: "Tower",
    aliases: ["mutatsu", "tower"],
    earliestStart: "No fixed date",
    requirement:
      "Reach Strength Rank 4, speak with Yuko about the monk, and reach Courage Rank 4.",
    location: "Club Escapade",
    availability: "Thursday through Sunday at night",
    automatic: false,
  },
  {
    character: "Mamoru Hayase",
    arcana: "Star",
    aliases: ["mamoru", "mamoru hayase", "star"],
    earliestStart: "August 2",
    requirement: "Reach Courage Rank 4 and meet Mamoru at the sports competition.",
    location: "Iwatodai Strip Mall",
    availability: "Tuesday, Wednesday, Friday, and Sunday during the day",
    automatic: false,
  },
  {
    character: "Nozomi Suemitsu",
    arcana: "Moon",
    aliases: ["nozomi", "nozomi suemitsu", "gourmet king", "moon"],
    earliestStart: "No fixed date",
    requirement:
      "Wait until Kenji mentions the Gourmet King, reach Charm Rank 2, pass Nozomi's quiz, and give him an Odd Morsel.",
    location: "Paulownia Mall",
    availability: "Every day during the day",
    automatic: false,
  },
  {
    character: "Akinari Kamiki",
    arcana: "Sun",
    aliases: ["akinari", "akinari kamiki", "sun"],
    earliestStart: "August 23",
    requirement:
      "Reach Academics Rank 4 and Hanged Man Rank 3, then return Akinari's Red Fountain Pen.",
    location: "Naganaki Shrine",
    availability: "Sunday during the day",
    automatic: false,
  },
  {
    character: "Nyx Annihilation Team",
    arcana: "Judgement",
    aliases: ["nyx annihilation team", "judgement", "judgment"],
    earliestStart: "December 31",
    requirement: "Choose to continue toward the true ending.",
    location: "Story event",
    availability: "Ranks advance automatically with Tartarus progress.",
    automatic: true,
  },
  {
    character: "Aigis",
    arcana: "Aeon",
    aliases: ["aigis", "aeon"],
    earliestStart: "January 8",
    requirement: "Speak with Aigis after school; no Social Stat rank is required.",
    location: "Classroom 2F",
    availability: "Monday, Wednesday, Friday, and Saturday after school",
    automatic: false,
  },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesAlias(question: string, alias: string): boolean {
  const normalizedQuestion = ` ${normalize(question)} `;
  return normalizedQuestion.includes(` ${normalize(alias)} `);
}

export function asksForAllSocialLinkStarts(question: string): boolean {
  return (
    /\b(?:all|every|complete|full)\b/i.test(question) &&
    /\b(?:social links?|s-?links?|arcana)\b/i.test(question) &&
    /\b(?:start|unlock|available|availability|begin|date|when|who)\b/i.test(question)
  );
}

export function socialLinkStartForQuestion(question: string): SocialLinkStart | null {
  const explicitSocialLink = /\b(?:social links?|s-?links?|arcana)\b/i.test(question);
  const asksForStartAction =
    /\b(?:start|unlock|available|availability|begin|earliest)\b/i.test(question);
  if (!asksForStartAction && !(explicitSocialLink && /\bwhen\b/i.test(question))) {
    return null;
  }
  if (asksForAllSocialLinkStarts(question)) return null;

  const requestedDate = question.match(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/i,
  )?.[0];
  if (requestedDate) {
    const dateMatches = socialLinkStarts.filter(
      (record) => normalize(record.earliestStart) === normalize(requestedDate),
    );
    if (dateMatches.length === 1) return dateMatches[0];
  }

  for (const record of socialLinkStarts) {
    const matchedAlias = record.aliases.find((alias) => includesAlias(question, alias));
    if (!matchedAlias) continue;

    const characterAlias =
      normalize(matchedAlias) === normalize(record.character) ||
      record.character
        .split(/\s+/)
        .some((namePart) => normalize(namePart) === normalize(matchedAlias));
    if (characterAlias || explicitSocialLink) return record;
  }

  return null;
}

export function socialLinkStartFactsForPrompt(): string {
  const rows = socialLinkStarts.map(
    (record) =>
      `- ${record.arcana}: ${record.character}; earliest start ${record.earliestStart}; ${record.requirement}`,
  );
  return [
    "Canonical Persona 3 Reload Social Link start facts:",
    "- There are 22 Arcana Social Links total. Fool, Death, and Judgement are story-automatic; the other 19 are player-managed.",
    ...rows,
    "- Never substitute another link's date. In particular, April 23 is Kazushi's Chariot start; Yukari's Lovers link starts July 25 and requires Charm Rank 6.",
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

export function socialLinkStartContradictions(response: {
  answer: string;
  sections?: Array<{ title: string; content: string }>;
  tables?: Array<{ title: string; columns: string[]; rows: string[][] }>;
}): string[] {
  const text = responseText(response);
  const matchedRecords = socialLinkStarts.filter((record) =>
    record.aliases.some((alias) => includesAlias(text, alias)),
  );
  if (matchedRecords.length !== 1) return [];

  const record = matchedRecords[0];
  if (record.earliestStart === "No fixed date") return [];
  const dates = [...text.matchAll(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/gi)]
    .map((match) => match[0]);
  const wrongDates = dates.filter(
    (date) => normalize(date) !== normalize(record.earliestStart),
  );
  return wrongDates.length
    ? [
        `${record.character}'s ${record.arcana} Social Link starts ${record.earliestStart}, not ${wrongDates[0]}.`,
      ]
    : [];
}
