export const socialLinkArcana = {
  SEES: "Fool",
  "Kenji Tomochika": "Magician",
  "Fuuka Yamagishi": "Priestess",
  "Mitsuru Kirijo": "Empress",
  "Hidetoshi Odagiri": "Emperor",
  "Bunkichi and Mitsuko": "Hierophant",
  "Yukari Takeba": "Lovers",
  "Kazushi Miyamoto": "Chariot",
  "Chihiro Fushimi": "Justice",
  Maya: "Hermit",
  "Keisuke Hiraga": "Fortune",
  "Yuko Nishiwaki": "Strength",
  "Maiko Oohashi": "Hanged Man",
  Pharos: "Death",
  Bebe: "Temperance",
  "President Tanaka": "Devil",
  Mutatsu: "Tower",
  "Mamoru Hayase": "Star",
  "Nozomi Suemitsu": "Moon",
  "Akinari Kamiki": "Sun",
  "Nyx Annihilation Team": "Judgement",
  Aigis: "Aeon",
} as const;

export const socialLinkUltimatePersonas = {
  Fool: { persona: "Susano-o", item: null },
  Magician: { persona: "Futsunushi", item: "Handmade Choker" },
  Priestess: { persona: "Scathach", item: "Headphones" },
  Empress: { persona: "Alilat", item: "Motorcycle Key" },
  Emperor: { persona: "Odin", item: "Cheap Light" },
  Hierophant: { persona: "Kohryu", item: "Persimmon Fruit" },
  Lovers: { persona: "Cybele", item: "Yukari's Strap" },
  Chariot: { persona: "Thor", item: "Sports Tape" },
  Justice: { persona: "Melchizedek", item: "Manga" },
  Hermit: { persona: "Arahabaki", item: "Screenshot Data" },
  Fortune: { persona: "Lakshmi", item: "Award Letter" },
  Strength: { persona: "Atavaka", item: "Kids' Letter" },
  "Hanged Man": { persona: "Attis", item: "Bead Ring" },
  Death: { persona: "Thanatos", item: null },
  Temperance: { persona: "Yurlungur", item: "Money Pouch" },
  Devil: { persona: "Beelzebub", item: "Thank-you Letter" },
  Tower: { persona: "Chi You", item: "Reserve Tag" },
  Star: { persona: "Helel", item: "Car Key" },
  Moon: { persona: "Sandalphon", item: "Gourmet License" },
  Sun: { persona: "Asura", item: "Worn Notebook" },
  Judgement: { persona: "Messiah", item: null },
  Aeon: { persona: "Metatron", item: "Charred Screw" },
} as const;

export type SocialLinkUltimatePersona = {
  arcana: keyof typeof socialLinkUltimatePersonas;
  persona: string;
  item: string | null;
};

export function allSocialLinkUltimatePersonasRequested(question: string): boolean {
  return (
    /\b(?:all|every|each|list|complete|full)\b/i.test(question) &&
    /\b(?:social links?|s-?links?|arcana|rank\s*10)\b/i.test(question) &&
    (/\bpersonas\b/i.test(question) ||
      /\b(?:each|every)\s+(?:one|arcana)\b/i.test(question) ||
      /\b(?:list|table|show)\b.{0,60}\bpersona\b/i.test(question) ||
      /\brank\s*10\b.{0,60}\bpersona\b/i.test(question))
  );
}

export function socialLinkUltimatePersonaRecords(): Array<
  SocialLinkUltimatePersona & { character: string }
> {
  return Object.entries(socialLinkUltimatePersonas).map(([arcana, unlock]) => ({
    arcana: arcana as SocialLinkUltimatePersona["arcana"],
    character:
      Object.entries(socialLinkArcana).find(([, linkedArcana]) => linkedArcana === arcana)?.[0] ??
      arcana,
    ...unlock,
  }));
}

export function ultimatePersonaUnlockForQuestion(
  question: string,
): SocialLinkUltimatePersona | null {
  if (allSocialLinkUltimatePersonasRequested(question)) return null;
  const asksWhichPersona =
    /\b(?:what|which)\b.{0,80}\bpersona\b/i.test(question) ||
    /\bpersona\b.{0,80}\b(?:get|receive|unlock|reward)\b/i.test(question);
  const asksRankReward =
    /\b(unlock|reward|rank\s*10|max|maxed|maxing|ultimate)\b/i.test(question);
  if (!asksWhichPersona && !asksRankReward) {
    return null;
  }

  const normalized = question.toLowerCase();
  const matchedArcana = (
    Object.keys(socialLinkUltimatePersonas) as Array<keyof typeof socialLinkUltimatePersonas>
  ).find((arcana) => normalized.includes(arcana.toLowerCase()));
  const arcana = matchedArcana ?? (/\baigis\b/i.test(question) ? "Aeon" : null);
  if (!arcana) return null;

  return {
    arcana,
    ...socialLinkUltimatePersonas[arcana],
  };
}

export function ultimatePersonaFollowUpRecords(
  question: string,
  previousTopic?: string,
  previousAssistant?: string,
): Array<SocialLinkUltimatePersona & { character: string }> {
  if (
    !/^(?:what|which|who)\s+(?:is|are)\s+(?:it|they|that|those|the persona)|^tell me about (?:it|that|them)|^how do i fuse (?:it|that|them)/i.test(
      question.trim().replace(/[?.!]+$/g, ""),
    )
  ) {
    return [];
  }

  const records = socialLinkUltimatePersonaRecords();
  const topic = previousTopic ?? "";
  const assistant = previousAssistant ?? "";
  const topicMatches = records.filter((record) =>
    [record.character, record.arcana, record.persona].some((value) =>
      new RegExp(`\\b${value.replace(/\s+/g, "\\s+")}\\b`, "i").test(topic),
    ),
  );
  if (topicMatches.length) return topicMatches;

  return records.filter((record) =>
    [record.character, record.arcana, record.persona].some((value) =>
      new RegExp(`\\b${value.replace(/\s+/g, "\\s+")}\\b`, "i").test(assistant),
    ),
  );
}

export function socialLinkEntityAliasesForQuestion(question: string): string[] {
  if (!/\b(social links?|s-?links?|arcana|rank|hang out|relationship)\b/i.test(question)) {
    return [];
  }

  return Object.entries(socialLinkArcana)
    .filter(([name, arcana]) => {
      const namePattern = name.replace(/\s+/g, "\\s+");
      const arcanaPattern = arcana.replace(/\s+/g, "\\s+");
      return (
        new RegExp(`\\b${namePattern}\\b`, "i").test(question) ||
        new RegExp(`\\b${arcanaPattern}\\b`, "i").test(question)
      );
    })
    .flatMap(([name, arcana]) => [name, arcana]);
}

export const linkedEpisodeCharacters = [
  "Junpei Iori",
  "Akihiko Sanada",
  "Shinjiro Aragaki",
  "Ken Amada",
  "Koromaru",
  "Ryoji Mochizuki",
] as const;

const linkedEpisodeAliases: Record<string, (typeof linkedEpisodeCharacters)[number]> = {
  junpei: "Junpei Iori",
  "junpei iori": "Junpei Iori",
  akihiko: "Akihiko Sanada",
  "akihiko sanada": "Akihiko Sanada",
  shinjiro: "Shinjiro Aragaki",
  "shinjiro aragaki": "Shinjiro Aragaki",
  ken: "Ken Amada",
  "ken amada": "Ken Amada",
  koromaru: "Koromaru",
  ryoji: "Ryoji Mochizuki",
  "ryoji mochizuki": "Ryoji Mochizuki",
};

export function relationshipFactsForPrompt(): string {
  return [
    "Canonical Persona 3 Reload relationship facts:",
    "- Junpei Iori, Akihiko Sanada, Shinjiro Aragaki, Ken Amada, Koromaru, and Ryoji Mochizuki have Linked Episodes, not Social Links.",
    "- Magician is Kenji Tomochika, not Junpei.",
    "- Priestess is Fuuka Yamagishi, not Yukari.",
    "- Emperor is Hidetoshi Odagiri, not Akihiko.",
    "- Lovers is Yukari Takeba; Empress is Mitsuru Kirijo; Aeon is Aigis.",
    "- Maxing Aigis's Aeon Social Link unlocks Metatron for fusion through the Charred Screw.",
    "- Social Links grant matching-Arcana fusion EXP and their rank-10 Persona unlock. Do not claim that they unlock party-member combat perks.",
  ].join("\n");
}

function linkedEpisodeCharacter(question: string): (typeof linkedEpisodeCharacters)[number] | null {
  for (const [alias, character] of Object.entries(linkedEpisodeAliases)) {
    const pattern = alias.replace(/\s+/g, "\\s+");
    if (new RegExp(`\\b${pattern}\\b`, "i").test(question)) return character;
  }
  return null;
}

export type RelationshipProfileHint = {
  currentMonth?: string;
  currentDate?: string;
  socialStats?: {
    academics?: string;
    charm?: string;
    courage?: string;
  };
};

function monthFromQuestion(question: string): string | undefined {
  const match = question.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
  );
  if (!match) return undefined;
  return match[1][0]!.toUpperCase() + match[1].slice(1).toLowerCase();
}

function hasSocialStats(profile?: RelationshipProfileHint): boolean {
  const stats = profile?.socialStats;
  return Boolean(stats?.academics || stats?.charm || stats?.courage);
}

export function canonicalRelationshipAnswer(
  question: string,
  profile?: RelationshipProfileHint,
): string | null {
  if (!/\b(social links?|s-?links?|arcana|hang out|relationship)\b/i.test(question)) return null;

  const linkedCharacter = linkedEpisodeCharacter(question);
  if (linkedCharacter) {
    return `${linkedCharacter} does not have a Social Link in Persona 3 Reload. Their character story is handled through Linked Episodes, which are separate events and do not use Social Link ranks or a matching Arcana Persona.`;
  }

  if (
    /\b(?:best|recommend|prioriti[sz]e|priority|focus|order)\b/i.test(question) &&
    /\b(?:early|first|start|priorit|focus|order|social links?)\b/i.test(question)
  ) {
    const month = profile?.currentMonth || monthFromQuestion(question);
    const statsKnown = hasSocialStats(profile);
    const summerish = month && /july|august/i.test(month);

    if (month && !statsKnown) {
      if (summerish) {
        return [
          `You're in ${month} — if school’s still out (summer vacation runs into late August), school Social Links are locked.`,
          "Lean on evening/city options that still work (Mutatsu, Tanaka when available, and any non-school links you’ve already opened), and don’t burn days waiting on classmates who can’t hang out yet.",
          "The day school resumes, snap back to after-school links like Kenji, Kazushi, Yuko, Chihiro, and Hidetoshi before exam season squeezes them.",
          "Rough ranks for Charm, Academics, and Courage and I’ll order the next few ranks for your stats.",
        ].join(" ");
      }
      return [
        `You're in ${month}, so the priority is protecting time-limited school links before the calendar blocks them.`,
        "After school: Kenji (Magician), Kazushi (Chariot), Yuko (Strength), Chihiro (Justice), Hidetoshi (Emperor) when they’re free.",
        "Evenings: Mutatsu (Tower) and President Tanaka (Devil) so they don’t steal daytime slots.",
        "Bring a matching-Arcana Persona when a hangout awards points.",
        "If you share Charm / Academics / Courage ranks (even roughly), I’ll rank the next few targets for you.",
      ].join(" ");
    }

    if (month && statsKnown) {
      return [
        `With you in ${month}, keep school-day links moving whenever they’re free, and park night links in the evening so they don’t compete.`,
        "School-limited: Kenji, Kazushi, Yuko, Chihiro, Hidetoshi (plus anyone else already unlocked who only appears after school).",
        "Nights: Mutatsu and Tanaka when open.",
        "Use a matching-Arcana Persona on rank-ups for free affinity.",
        "If a required social stat is low for a link you care about, spend a day or two on that stat before forcing ranks.",
      ].join(" ");
    }

    return [
      "There isn’t one perfect Social Link order for every save — it depends on your date and social stats.",
      "As a baseline: protect after-school school links (Kenji, Kazushi, Yuko, Chihiro, Hidetoshi) before breaks and exams lock them, and use evenings for night-only people like Mutatsu and Tanaka.",
      "Matching-Arcana Personas help on rank-ups.",
      "Tell me your month (or date) and rough Charm / Academics / Courage and I’ll prioritize for your file.",
    ].join(" ");
  }

  if (/\bclassmate social links?\b/i.test(question)) {
    return "Which classmate do you mean? School Social Links include Kenji Tomochika (Magician), Kazushi Miyamoto (Chariot), Yuko Nishiwaki (Strength), Chihiro Fushimi (Justice), Hidetoshi Odagiri (Emperor), Keisuke Hiraga (Fortune), and Bebe (Temperance).";
  }

  return null;
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

export function relationshipContradictions(response: {
  answer: string;
  sections?: Array<{ title: string; content: string }>;
  tables?: Array<{ title: string; columns: string[]; rows: string[][] }>;
}): string[] {
  const text = responseText(response);
  const contradictions: string[] = [];
  const invalidSocialLinks = [
    ["Junpei", "Magician"],
    ["Akihiko", "Emperor"],
    ["Shinjiro", ""],
    ["Ken Amada", ""],
    ["Koromaru", ""],
    ["Ryoji", ""],
  ] as const;

  for (const [name, arcana] of invalidSocialLinks) {
    const namePattern = name.replace(/\s+/g, "\\s+");
    if (
      new RegExp(`\\b${namePattern}\\b.{0,80}\\b(?:social link|s-?link)\\b`, "i").test(text) ||
      new RegExp(`\\b(?:social link|s-?link)\\b.{0,80}\\b${namePattern}\\b`, "i").test(text) ||
      (arcana && new RegExp(`\\b${namePattern}\\s*\\(${arcana}\\)`, "i").test(text))
    ) {
      contradictions.push(`${name} has Linked Episodes, not a Social Link.`);
    }
  }

  const wrongArcana: Array<[string, string]> = [
    ["Yukari", "Priestess"],
    ["Fuuka", "Lovers"],
    ["Mitsuru", "Priestess"],
    ["Aigis", "Fool"],
  ];
  for (const [name, arcana] of wrongArcana) {
    if (new RegExp(`\\b${name}\\s*\\(${arcana}\\)`, "i").test(text)) {
      contradictions.push(`${name} is paired with the wrong Arcana.`);
    }
  }

  if (
    /\bsocial links?\b.{0,120}\b(?:unlock|grant|provide).{0,60}\bcombat (?:benefits?|skills?|abilities?)\b/i.test(
      text,
    )
  ) {
    contradictions.push("Social Links do not grant party-member combat perks.");
  }

  return [...new Set(contradictions)];
}
