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

export function ultimatePersonaUnlockForQuestion(
  question: string,
): SocialLinkUltimatePersona | null {
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

export function canonicalRelationshipAnswer(question: string): string | null {
  if (!/\b(social links?|s-?links?|arcana|hang out|relationship)\b/i.test(question)) return null;

  const linkedCharacter = linkedEpisodeCharacter(question);
  if (linkedCharacter) {
    return `${linkedCharacter} does not have a Social Link in Persona 3 Reload. Their character story is handled through Linked Episodes, which are separate events and do not use Social Link ranks or a matching Arcana Persona.`;
  }

  if (
    /\b(?:which|what|best|recommend|prioriti[sz]e|focus)\b/i.test(question) &&
    /\b(?:early|first|start|priorit|focus|social links?)\b/i.test(question)
  ) {
    return [
      "There is no single best Social Link order without knowing your current date and Social Stats.",
      "As a general rule, protect after-school time for school-limited links such as Kenji (Magician), Kazushi (Chariot), Yuko (Strength), Chihiro (Justice), and Hidetoshi (Emperor), because school breaks and exam periods can block them.",
      "Use evenings for night links such as Mutatsu (Tower) and President Tanaka (Devil) so they do not compete with daytime links.",
      "Bring a Persona of the matching Arcana when the link awards affinity points; Social Link ranks increase fusion EXP for that Arcana.",
      "Tell me your in-game date and Social Stats and I can give you a specific priority order.",
    ].join(" ");
  }

  if (/\bclassmate social links?\b/i.test(question)) {
    return "Which classmate do you mean? The school-based Social Links include Kenji Tomochika (Magician), Kazushi Miyamoto (Chariot), Yuko Nishiwaki (Strength), Chihiro Fushimi (Justice), Hidetoshi Odagiri (Emperor), Keisuke Hiraga (Fortune), and Bebe (Temperance).";
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
