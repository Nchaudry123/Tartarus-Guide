import { z } from "zod";
import { config, createChatCompletion, normalizeName, sleep, supabase } from "../db/client";
import {
  ExtractedFactSchema,
  FactExtractionResponseSchema,
  entityTypes,
  factTypes,
  type ExtractedFact,
  type SourceRecord,
  type TextChunk,
} from "../types/schema";
import { upsertSource } from "./embedChunks";

export const factExtractionSystemPrompt = `You extract structured Persona 3 Reload guide facts from short IGN or Game8 source excerpts.

Rules:
- Extract only factual game-guide information directly supported by the source excerpts.
- The page title and section title may identify the subject, but never use outside knowledge.
- Do not infer unsupported weaknesses, dates, fusions, deadlines, floors, rewards, or strategies.
- Never convert a neutral affinity into a weakness or resistance.
- Use null only when the source explicitly says the detail is unknown or unavailable.
- Keep each fact atomic: one entity, one fact_type, one value.
- Separate enemies, bosses, personas, requests, social links, locations, items, equipment, mechanics, party members, Tartarus floors, activities, and skills.
- A character mentioned as a recommended party member is not the boss or enemy subject. Never assign weaknesses, resistances, or boss mechanics to Junpei, Yukari, Akihiko, Mitsuru, Aigis, Koromaru, Ken, Shinjiro, or Fuuka unless the excerpt explicitly presents that character as the battle opponent.
- Junpei, Akihiko, Shinjiro, Ken, Koromaru, and Ryoji use Linked Episodes in Persona 3 Reload, not Social Links. Do not create Social Link facts for them.
- Capture aliases only when an excerpt gives them.
- Prefer concise values. Preserve exact dates, floor ranges, answer choices, item names, skills, and elements.
- Confidence must be 0 to 1 and should reflect how directly the excerpt supports the fact.
- entity_type must be exactly one of: ${entityTypes.join(", ")}.
- fact_type must be exactly one of: ${factTypes.join(", ")}.
- Return strict JSON only, with this shape: {"facts":[{"entity_name":"Dancing Hand","entity_type":"enemy","aliases":[],"fact_type":"weakness","value":"Fire","confidence":0.94,"notes":"Optional short caveat"}]}.`;

const exactFactTypes = new Set([
  "weakness",
  "resistance",
  "nullifies",
  "drains",
  "repels",
  "fusion_recipe",
  "arcana",
  "base_level",
  "deadline",
  "reward",
  "floor_range",
  "answer_choice",
]);

const factSignalPattern =
  /\b(weak|weakness|resist|resistance|nullif|drain|repel|affinit|located|location|floor|strategy|recommended|party|fuse|fusion|recipe|unlock|available|deadline|reward|prerequisite|schedule|answer|choice|effect|attack|skill|level)\b/i;

export function candidateScore(chunk: TextChunk): number {
  const title = `${chunk.pageTitle} ${chunk.sectionTitle}`;
  let score = 0;
  if (!["overview", "guide"].includes(chunk.source.category)) score += 20;
  if (factSignalPattern.test(title)) score += 25;
  if (factSignalPattern.test(chunk.text)) score += 20;
  if (/\b(boss|shadow|social link|request|persona|tartarus|classroom|exam)\b/i.test(title)) score += 15;
  if (/\b(contents|navigation|related guides|popular articles|comment|advertisement)\b/i.test(title)) score -= 30;
  return score;
}

export function isFactCandidate(chunk: TextChunk): boolean {
  return chunk.text.length >= 160 && candidateScore(chunk) >= 35;
}

const RawFactResponseSchema = z.object({ facts: z.array(z.record(z.unknown())).default([]) });
let activeFactExtractionModel: string | undefined;

const entityTypeAliases: Record<string, string> = {
  persona: "persona",
  personas: "persona",
  fusion: "persona",
  character: "party_member",
  partymember: "party_member",
  sociallink: "social_link",
  tartarusfloor: "tartarus_floor",
};

const factTypeAliases: Record<string, string> = {
  fusion: "fusion_recipe",
  recipe: "fusion_recipe",
  result: "fusion_recipe",
  level: "base_level",
  baselevel: "base_level",
  arcana: "arcana",
  requiredskill: "prerequisite",
  baseskill: "prerequisite",
  requiredpersona: "prerequisite",
  requirement: "prerequisite",
  requirements: "prerequisite",
  unlock: "unlock_condition",
  date: "schedule",
  availability: "schedule",
  answer: "answer_choice",
  effect: "item_effect",
};

function enumKey(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeRawFact(value: Record<string, unknown>): ExtractedFact | null {
  const rawEntityType = enumKey(value.entity_type);
  const rawFactType = enumKey(value.fact_type);
  const normalized = {
    ...value,
    entity_type: entityTypeAliases[rawEntityType] ?? String(value.entity_type ?? "").toLowerCase().replace(/[\s-]+/g, "_"),
    fact_type: factTypeAliases[rawFactType] ?? String(value.fact_type ?? "").toLowerCase().replace(/[\s-]+/g, "_"),
    aliases: Array.isArray(value.aliases) ? value.aliases : [],
    confidence: typeof value.confidence === "number" ? value.confidence : Number(value.confidence ?? 0.5),
    notes: value.notes == null ? null : String(value.notes),
    value: value.value == null ? null : String(value.value),
    entity_name: String(value.entity_name ?? ""),
  };
  const parsed = ExtractedFactSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

function factExtractionUserPrompt(chunks: TextChunk[]): string {
  const first = chunks[0];
  return `Source title: ${first.pageTitle}
Source URL: ${first.source.url}
Category: ${first.source.category}

${chunks
  .map(
    (chunk, index) => `Excerpt ${index + 1}
Section: ${chunk.sectionTitle}
${chunk.text}`,
  )
  .join("\n\n")}`;
}

async function upsertEntity(fact: ExtractedFact): Promise<string> {
  const normalizedName = normalizeName(fact.entity_name);
  const { data, error } = await supabase
    .from("entities")
    .upsert(
      {
        name: fact.entity_name,
        type: fact.entity_type,
        aliases: fact.aliases,
        normalized_name: normalizedName,
      },
      { onConflict: "normalized_name,type" },
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function insertOrRefreshFact(
  fact: ExtractedFact,
  entityId: string,
  source: SourceRecord,
): Promise<boolean> {
  if (!fact.value) return false;

  const { data: existing, error: existingError } = await supabase
    .from("facts")
    .select("id,confidence,notes")
    .eq("entity_id", entityId)
    .eq("source_id", source.id)
    .eq("fact_type", fact.fact_type)
    .ilike("value", fact.value)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    const previousConfidence = Number(existing.confidence);
    if (fact.confidence > previousConfidence || (!existing.notes && fact.notes)) {
      const { error } = await supabase
        .from("facts")
        .update({
          confidence: Math.max(previousConfidence, fact.confidence),
          notes: fact.notes ?? existing.notes,
        })
        .eq("id", existing.id);
      if (error) throw error;
      return true;
    }
    return false;
  }

  const { error } = await supabase.from("facts").insert({
    entity_id: entityId,
    source_id: source.id,
    fact_type: fact.fact_type,
    value: fact.value,
    confidence: fact.confidence,
    notes: fact.notes ?? null,
  });
  if (error) throw error;
  return true;
}

function meaningfulTerms(value: string): string[] {
  return normalizeName(value)
    .split(" ")
    .filter((term) => term.length >= 2 && !["the", "and", "with", "from", "none"].includes(term));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAffinityEvidence(fact: ExtractedFact, chunks: TextChunk[]): boolean {
  const labelByFactType: Partial<Record<ExtractedFact["fact_type"], string>> = {
    weakness: "weak|weakness",
    resistance: "resist|resistant|resistance",
    nullifies: "null|nullifies|negates",
    drains: "drain|drains",
    repels: "repel|repels|reflects",
  };
  const label = labelByFactType[fact.fact_type];
  if (!label || !fact.value) return true;

  const value = escapeRegExp(fact.value.toLowerCase());
  const names = [fact.entity_name, ...fact.aliases]
    .map((name) => escapeRegExp(name.toLowerCase()))
    .filter(Boolean)
    .join("|");

  return chunks.some((chunk) => {
    const text = `${chunk.pageTitle} ${chunk.sectionTitle} ${chunk.text}`.toLowerCase();
    const tableStatus = text.match(
      new RegExp(
        `\\b${value}\\s*:\\s*(weak|weakness|resist|resistant|resistance|null|nullifies|negates|drain|drains|repel|repels|reflects|normal|unknown)\\b`,
        "i",
      ),
    )?.[1];
    if (tableStatus) {
      return new RegExp(`^(?:${label})$`, "i").test(tableStatus);
    }
    if (!names) return false;
    const namedEvidence = [
      new RegExp(`(?:${names}).{0,100}\\b(?:${label})(?:\\s+to)?\\b.{0,45}\\b${value}\\b`, "i"),
      new RegExp(`\\b${value}\\b.{0,45}\\b(?:${label})\\b.{0,100}(?:${names})`, "i"),
      new RegExp(`(?:${names}).{0,100}\\b(?:${label})\\b.{0,45}\\b${value}\\b`, "i"),
    ];
    return namedEvidence.some((pattern) => pattern.test(text));
  });
}

const affinityStatusToFactType: Record<string, ExtractedFact["fact_type"] | undefined> = {
  weak: "weakness",
  weakness: "weakness",
  resist: "resistance",
  resistant: "resistance",
  resistance: "resistance",
  null: "nullifies",
  nullifies: "nullifies",
  negates: "nullifies",
  drain: "drains",
  drains: "drains",
  repel: "repels",
  repels: "repels",
  reflects: "repels",
};

const affinityElements: Record<string, string> = {
  slash: "Slash",
  "slash attack": "Slash",
  "slash attacks": "Slash",
  strike: "Strike",
  "strike attack": "Strike",
  "strike attacks": "Strike",
  pierce: "Pierce",
  "pierce attack": "Pierce",
  "pierce attacks": "Pierce",
  fire: "Fire",
  ice: "Ice",
  electric: "Electric",
  electricity: "Electric",
  wind: "Wind",
  light: "Light",
  dark: "Dark",
};

function affinityValues(value: string): string[] {
  if (!value || /^(?:-|none|n\/a)$/i.test(value.trim())) return [];
  const matches = value.match(
    /Slash(?:\s+Attacks?)?|Strike(?:\s+Attacks?)?|Pierce(?:\s+Attacks?)?|Fire|Ice|Electricity|Electric|Wind|Light|Dark/gi,
  );
  return [
    ...new Set(
      (matches ?? [])
        .map((match) => affinityElements[match.toLowerCase()])
        .filter((element): element is string => Boolean(element)),
    ),
  ];
}

function extractIgnEnemyTableFacts(chunks: TextChunk[]): ExtractedFact[] {
  const facts = new Map<string, ExtractedFact>();
  const tablePattern =
    /Table data:\s*(?:Enemy|Shadow)\s*\|\s*Level\s*\|\s*Weak to\s*\|\s*Resistant Against\s*\|\|\s*([\s\S]*?)(?=\n\[|$)/gi;

  for (const chunk of chunks) {
    for (const table of chunk.text.matchAll(tablePattern)) {
      for (const rawRow of table[1].split(/\s*\|\|\s*/)) {
        const columns = rawRow.split(/\s*\|\s*/).map((column) => column.trim());
        if (columns.length < 4) continue;
        const [entityName, level, weaknesses, resistances] = columns;
        if (!entityName || !/^\d{1,3}$/.test(level)) continue;

        const shared = {
          entity_name: entityName,
          entity_type: "enemy" as const,
          aliases: [],
          confidence: 0.99,
          notes: "Extracted directly from the IGN enemy affinity table.",
        };
        for (const value of affinityValues(weaknesses)) {
          facts.set(`${normalizeName(entityName)}:weakness:${value}`, {
            ...shared,
            fact_type: "weakness",
            value,
          });
        }
        for (const value of affinityValues(resistances)) {
          facts.set(`${normalizeName(entityName)}:resistance:${value}`, {
            ...shared,
            fact_type: "resistance",
            value,
          });
        }
      }
    }
  }

  return [...facts.values()];
}

function subjectFromPageTitle(pageTitle: string): {
  name: string;
  type: ExtractedFact["entity_type"];
} | null {
  const isBoss = /\bboss(?:es)?\b/i.test(pageTitle);
  const suffixPatterns = [
    /\s+-\s+persona 3 reload guide\s+-\s+ign.*$/i,
    /\s+-\s+persona 3 reload.*$/i,
    /\s+boss guide(?::.*)?$/i,
    /\s+boss guide\b.*$/i,
    /\s+weakness(?:es)? and how to beat.*$/i,
    /\s+weakness(?:es)? and location.*$/i,
    /\s+weakness(?:es)?(?::.*)?$/i,
  ];
  let name = pageTitle.trim().replace(/^the\s+/i, "");
  for (const pattern of suffixPatterns) name = name.replace(pattern, "").trim();
  if (
    !name ||
    name === pageTitle.trim() ||
    /\b(list of|all |guide|persona 3 reload)\b/i.test(name)
  ) {
    return null;
  }
  return {
    name,
    type: isBoss ? "boss" : "enemy",
  };
}

export function extractDeterministicAffinityFacts(chunks: TextChunk[]): ExtractedFact[] {
  const subject = subjectFromPageTitle(chunks[0]?.pageTitle ?? "");
  const facts = new Map<string, ExtractedFact>();
  for (const fact of extractIgnEnemyTableFacts(chunks)) {
    facts.set(
      `${normalizeName(fact.entity_name)}:${fact.fact_type}:${fact.value}`,
      fact,
    );
  }

  if (!subject) return [...facts.values()];

  const pairPattern =
    /\b(Slash|Strike|Pierce|Fire|Ice|Electricity|Electric|Wind|Light|Dark)\s*:\s*(Weakness|Weak|Resistance|Resistant|Resist|Nullifies|Null|Negates|Drains|Drain|Repels|Repel|Reflects|Normal|Unknown)\b/gi;

  for (const chunk of chunks) {
    const text = `${chunk.sectionTitle}\n${chunk.text}`;
    for (const match of text.matchAll(pairPattern)) {
      const value = affinityElements[match[1].toLowerCase()];
      const factType = affinityStatusToFactType[match[2].toLowerCase()];
      if (!value || !factType) continue;
      const key = `${normalizeName(subject.name)}:${factType}:${value}`;
      facts.set(key, {
        entity_name: subject.name,
        entity_type: subject.type,
        aliases: [],
        fact_type: factType,
        value,
        confidence: 0.99,
        notes: "Extracted directly from the source affinity table.",
      });
    }
  }
  return [...facts.values()];
}

export function extractDeterministicPersonaFacts(chunks: TextChunk[]): ExtractedFact[] {
  const pageTitle = chunks[0]?.pageTitle ?? "";
  const arcana = pageTitle.match(/^All (.+?) Personas\b/i)?.[1]?.trim();
  if (!arcana) return [];

  const facts = new Map<string, ExtractedFact>();
  const personaPattern =
    /(?:\bPersona:\s*|\|\|\s*)([^|]+?)\s*\(lvl\s*(\d{1,3})\)/gi;

  for (const chunk of chunks) {
    if (!/\bAll .+ Personas\b/i.test(chunk.sectionTitle)) continue;
    for (const match of chunk.text.matchAll(personaPattern)) {
      const name = match[1].trim().replace(/\s+/g, " ");
      const level = Number(match[2]);
      if (!name || !Number.isInteger(level) || level < 1 || level > 99) continue;

      const shared = {
        entity_name: name,
        entity_type: "persona" as const,
        aliases: [],
        confidence: 0.99,
        notes: "Extracted directly from the source Persona table.",
      };
      facts.set(`${normalizeName(name)}:arcana`, {
        ...shared,
        fact_type: "arcana",
        value: arcana,
      });
      facts.set(`${normalizeName(name)}:base_level`, {
        ...shared,
        fact_type: "base_level",
        value: String(level),
      });
    }
  }

  return [...facts.values()];
}

function deterministicFact(
  entityName: string,
  entityType: ExtractedFact["entity_type"],
  factType: ExtractedFact["fact_type"],
  value: string,
  notes: string,
): ExtractedFact {
  return {
    entity_name: entityName.trim(),
    entity_type: entityType,
    aliases: [],
    fact_type: factType,
    value: value.trim(),
    confidence: 0.99,
    notes,
  };
}

function addDeterministicFact(
  facts: Map<string, ExtractedFact>,
  fact: ExtractedFact,
): void {
  if (!fact.entity_name || !fact.value) return;
  const key = `${normalizeName(fact.entity_name)}:${fact.fact_type}:${normalizeName(fact.value)}`;
  facts.set(key, fact);
}

function cleanExactValue(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+\[(?:[^\]]+)\].*$/s, "")
    .trim();
}

function conciseValue(value: string, maxLength = 520): string {
  const cleaned = cleanExactValue(value)
    .replace(/^(?:-|•)\s*/g, "")
    .replace(/\s*\|\s*/g, "; ");
  if (cleaned.length <= maxLength) return cleaned;
  const shortened = cleaned.slice(0, maxLength);
  const sentenceEnd = Math.max(
    shortened.lastIndexOf(". "),
    shortened.lastIndexOf("; "),
  );
  return `${shortened.slice(0, sentenceEnd > maxLength * 0.55 ? sentenceEnd + 1 : maxLength).trim()}…`;
}

function isUsefulExactValue(value: string): boolean {
  return Boolean(value) && !/^(?:-|none|n\/a|unknown)$/i.test(value.trim());
}

export function extractDeterministicRequestFacts(chunks: TextChunk[]): ExtractedFact[] {
  const facts = new Map<string, ExtractedFact>();
  const requestPattern =
    /Table data:\s*(Request\s+\d+\s*:\s*[^|]+?)\s*\|\|\s*Objective\s*\|\s*([^|]+?)\s*\|\|\s*Start Date\s*\|\s*([^|]+?)\s*\|\|\s*End Date\s*\|\s*([^|]+?)\s*\|\|\s*Reward\s*\|\s*([^\[]+?)(?=\s*\[[^\]]+\]|$)/gi;

  for (const chunk of chunks) {
    for (const match of chunk.text.matchAll(requestPattern)) {
      const entityName = cleanExactValue(match[1]);
      const objective = cleanExactValue(match[2]);
      const start = cleanExactValue(match[3]);
      const end = cleanExactValue(match[4]);
      const reward = cleanExactValue(match[5]);
      const note = "Extracted directly from the Game8 request overview table.";

      if (objective) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "request", "strategy", objective, note),
        );
      }
      if (start && !/^(?:-|none|n\/a)$/i.test(start)) {
        const factType = /^complete\b/i.test(start) ? "prerequisite" : "schedule";
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "request", factType, start, note),
        );
      }
      if (end && !/^(?:-|none|n\/a)$/i.test(end)) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "request", "deadline", end, note),
        );
      }
      if (reward && !/^(?:-|none|n\/a)$/i.test(reward)) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "request", "reward", reward, note),
        );
      }
    }

    const game8ListPattern =
      /(?:Table data:\s*(?:No\.\s*\|\s*Request\s*\|\s*Unlock Duration\s*\|\|\s*)?)?(\d{1,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\|\s*How to Complete:\s*([\s\S]*?)(?=\s*\|\|\s*\d{1,3}\s*\||\s*\[[^\]]+\]|$)/gi;
    for (const match of chunk.text.matchAll(game8ListPattern)) {
      const number = match[1];
      const title = cleanExactValue(match[2]);
      const unlock = cleanExactValue(match[3]);
      const solution = conciseValue(match[4]);
      if (!title || /^(?:request|unlock duration)$/i.test(title)) continue;
      const entityName = `Request ${number}: ${title}`;
      const note = "Extracted directly from the Game8 Elizabeth request list.";

      if (isUsefulExactValue(unlock)) {
        const factType = /^complete request\b/i.test(unlock) ? "prerequisite" : "schedule";
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "request", factType, unlock, note),
        );
      }
      if (isUsefulExactValue(solution)) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "request", "strategy", solution, note),
        );
      }
    }

    const ignRowPattern =
      /\|\s*(\d{1,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*Elizabeth Request\s+\1\s*\|/gi;
    for (const match of chunk.text.matchAll(ignRowPattern)) {
      const number = match[1];
      const title = cleanExactValue(match[2]);
      const deadline = cleanExactValue(match[3]);
      const solution = conciseValue(match[4]);
      const reward = cleanExactValue(match[5]);
      if (!title || /^request$/i.test(title)) continue;
      const entityName = `Request ${number}: ${title}`;
      const note = "Extracted directly from the IGN Elizabeth request table.";

      if (isUsefulExactValue(deadline)) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "request", "deadline", deadline, note),
        );
      }
      if (isUsefulExactValue(solution)) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "request", "strategy", solution, note),
        );
      }
      if (isUsefulExactValue(reward)) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "request", "reward", reward, note),
        );
      }
    }
  }

  return [...facts.values()];
}

const calendarMonthPattern =
  "January|February|March|April|May|June|July|August|September|October|November|December";

function addCalendarEntry(
  facts: Map<string, ExtractedFact>,
  date: string,
  actions: string,
  note: string,
): void {
  const entityName = cleanExactValue(date);
  const cleanedActions = conciseValue(actions);
  if (!entityName) return;
  addDeterministicFact(
    facts,
    deterministicFact(entityName, "activity", "schedule", entityName, note),
  );
  if (isUsefulExactValue(cleanedActions)) {
    addDeterministicFact(
      facts,
      deterministicFact(entityName, "activity", "strategy", cleanedActions, note),
    );
  }

  const answer =
    cleanedActions.match(/\b(?:answer|a)\s*:\s*([^;|.]+(?:\.)?)/i)?.[1] ??
    cleanedActions.match(/\bchoose\s+[“"]?([^”";.]+)[”"]?/i)?.[1];
  if (answer) {
    addDeterministicFact(
      facts,
      deterministicFact(
        `${entityName} Classroom Question`,
        "activity",
        "answer_choice",
        cleanExactValue(answer),
        note,
      ),
    );
  }
}

export function extractDeterministicCalendarFacts(chunks: TextChunk[]): ExtractedFact[] {
  const category = chunks[0]?.source.category ?? "";
  if (!["walkthrough", "classroom"].includes(category)) return [];

  const facts = new Map<string, ExtractedFact>();
  const note = "Extracted directly from the dated walkthrough or classroom answer table.";
  const date = `(?:${calendarMonthPattern})\\s+\\d{1,2}(?:st|nd|rd|th)?`;

  for (const chunk of chunks) {
    const text = chunk.text;

    const datedQuestionPattern = new RegExp(
      `(?:Table data:\\s*Date:\\s*|\\|\\|\\s*)(${date})\\s*\\|\\s*(?:Question:\\s*)?(?:Q:\\s*)?([\\s\\S]*?)(?:\\s+A(?:nswer)?\\s*:\\s*)([^|]+?)(?=\\s*\\|\\||\\s*\\[[^\\]]+\\]|$)`,
      "gi",
    );
    for (const match of text.matchAll(datedQuestionPattern)) {
      const entityName = `${cleanExactValue(match[1])} Classroom Question`;
      const question = conciseValue(match[2], 280);
      const answer = cleanExactValue(match[3]);
      addDeterministicFact(
        facts,
        deterministicFact(entityName, "activity", "schedule", cleanExactValue(match[1]), note),
      );
      if (isUsefulExactValue(answer)) {
        addDeterministicFact(
          facts,
          deterministicFact(
            entityName,
            "activity",
            "answer_choice",
            question ? `${answer} — ${question}` : answer,
            note,
          ),
        );
      }
    }

    const recommendedActionsPattern = new RegExp(
      `(?:Table data:\\s*Date\\s*\\|\\s*Recommended Actions\\s*\\|\\|\\s*|\\|\\|\\s*)?(${date})\\s*\\|\\s*([\\s\\S]*?)(?=\\s*\\|\\|\\s*${date}\\s*\\||\\s*\\[[^\\]]+\\]|$)`,
      "gi",
    );
    for (const match of text.matchAll(recommendedActionsPattern)) {
      addCalendarEntry(facts, match[1], match[2], note);
    }

    const headingPattern = new RegExp(
      `\\[(${date})\\]\\s*([\\s\\S]*?)(?=\\s*\\[(?:${date})\\]|$)`,
      "gi",
    );
    for (const match of text.matchAll(headingPattern)) {
      const dateValue = cleanExactValue(match[1]);
      const section = match[2];
      const activityPattern =
        /\b(After School|Evening|Daytime|Morning)\s*\|\s*([\s\S]*?)(?=\s*\|\|\s*(?:After School|Evening|Daytime|Morning)\s*\||$)/gi;
      let foundActivity = false;
      for (const activity of section.matchAll(activityPattern)) {
        foundActivity = true;
        addCalendarEntry(
          facts,
          dateValue,
          `${cleanExactValue(activity[1])}: ${conciseValue(activity[2], 360)}`,
          note,
        );
      }
      if (!foundActivity) addCalendarEntry(facts, dateValue, section, note);
    }
  }

  return [...facts.values()];
}

function socialLinkSubject(pageTitle: string): string | null {
  const match = pageTitle.match(/^(.+?)\s+-\s+[^-]+$/);
  return match?.[1]?.trim() || null;
}

export function extractDeterministicSocialLinkFacts(chunks: TextChunk[]): ExtractedFact[] {
  const facts = new Map<string, ExtractedFact>();
  const pageSubject = socialLinkSubject(chunks[0]?.pageTitle ?? "");
  const note = "Extracted directly from the Social Link guide schedule or answer section.";

  for (const chunk of chunks) {
    const text = chunk.text;
    const tablePattern =
      /Table data:\s*([^|[\]]+?)\s*\(([^)]+)\)\s*\|\|\s*Start Date:\s*([^|]+?)\s*\|\|\s*Pre-Requisites:\s*([^|]+?)\s*\|\|\s*Days Available:\s*([^|]+?)\s*\|\|\s*Location:\s*([^\[]+?)(?=\s*\[[^\]]+\]|$)/gi;
    for (const match of text.matchAll(tablePattern)) {
      const entityName = cleanExactValue(match[1]);
      const start = cleanExactValue(match[3]);
      const prerequisites = cleanExactValue(match[4]);
      const days = cleanExactValue(match[5]);
      const location = cleanExactValue(match[6]);
      if (start && !/^(?:-|none|n\/a)$/i.test(start)) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "social_link", "unlock_condition", `Starts ${start}`, note),
        );
      }
      if (prerequisites && !/^(?:-|none|n\/a)$/i.test(prerequisites)) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "social_link", "prerequisite", prerequisites, note),
        );
      }
      if (days) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "social_link", "schedule", days, note),
        );
      }
      if (location) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "social_link", "location", location, note),
        );
      }
    }

    if (pageSubject) {
      const unlock = text.match(
        /\b(?:automatically unlocks|can begin(?: starting)?|can begin on|isn't available until)\s+(?:on\s+)?([^,.]+(?:\s+or later)?)/i,
      )?.[1];
      if (unlock) {
        addDeterministicFact(
          facts,
          deterministicFact(
            pageSubject,
            "social_link",
            "unlock_condition",
            cleanExactValue(unlock),
            note,
          ),
        );
      }
      const availability = text.match(
        /\b(?:is|he's|she's)\s+available\s+on\s+([^.]*)/i,
      )?.[1];
      if (availability) {
        addDeterministicFact(
          facts,
          deterministicFact(
            pageSubject,
            "social_link",
            "schedule",
            cleanExactValue(availability),
            note,
          ),
        );
      }

      for (const section of text.matchAll(
        /\[(Rank\s+\d+\s*->\s*Rank\s+\d+)\]\s*([\s\S]*?)(?=\s*\[[^\]]+\]|$)/gi,
      )) {
        const choices = [...section[2].matchAll(/[“"]([^”"]+)[”"]\s*\(#(\d)\)/g)].map(
          (choice) => ({ text: cleanExactValue(choice[1]), points: Number(choice[2]) }),
        );
        const maxPoints = Math.max(0, ...choices.map((choice) => choice.points));
        for (const choice of choices.filter((candidate) => candidate.points === maxPoints)) {
          addDeterministicFact(
            facts,
            deterministicFact(
              pageSubject,
              "social_link",
              "answer_choice",
              `${cleanExactValue(section[1])}: "${choice.text}" (+${choice.points})`,
              note,
            ),
          );
        }
      }
    }
  }

  return [...facts.values()];
}

export function extractDeterministicBossFacts(chunks: TextChunk[]): ExtractedFact[] {
  const facts = new Map<string, ExtractedFact>();
  const tableNote = "Extracted directly from the Game8 boss overview table.";
  const proseNote = "Extracted directly from the boss guide's stated mechanics.";
  const pageSubject = subjectFromPageTitle(chunks[0]?.pageTitle ?? "");

  for (const chunk of chunks) {
    for (const overview of chunk.text.matchAll(
      /Table data:\s*Boss:\s*([^|]+?)(?:\s+Arcana:\s*[^|]+)?\s*\|\|\s*Date ＆ Location:\s*([\s\S]*?)(?=\s*\[[^\]]+\]|$)/gi,
    )) {
      const entityName = cleanExactValue(overview[1]);
      const details = overview[2];
      const date = details.match(/\bDate:\s*([^|]+?)(?=\s+Location:|\s+Recommended Level:|$)/i)?.[1];
      const requirement = details.match(
        /\bRequirement:\s*([^|]+?)(?=\s+Location:|\s+Recommended Level:|$)/i,
      )?.[1];
      const location = details.match(
        /\bLocation:\s*([^|]+?)(?=\s+Recommended Level:|\s+Stats:|$)/i,
      )?.[1];
      const level = details.match(/\bRecommended Level:\s*([^|]+?)(?=\s+Stats:|$)/i)?.[1];

      if (date) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "boss", "schedule", cleanExactValue(date), tableNote),
        );
      }
      if (requirement) {
        addDeterministicFact(
          facts,
          deterministicFact(
            entityName,
            "boss",
            "prerequisite",
            cleanExactValue(requirement),
            tableNote,
          ),
        );
      }
      if (location) {
        addDeterministicFact(
          facts,
          deterministicFact(entityName, "boss", "location", cleanExactValue(location), tableNote),
        );
      }
      if (level) {
        addDeterministicFact(
          facts,
          deterministicFact(
            entityName,
            "boss",
            "prerequisite",
            `Recommended level: ${cleanExactValue(level)}`,
            tableNote,
          ),
        );
      }
    }

    const sectionSubject =
      chunk.sectionTitle.match(/^(.+?)\s+(?:Weaknesses and Resistances|Boss Guide)$/i)?.[1] ??
      pageSubject?.name;
    const prose = chunk.text.replace(/\[[^\]]+\]/g, " ");
    const relationSentencePattern =
      /\b((?:The\s+)?[A-Z][A-Za-z0-9'’ -]{1,70}?)\s+((?:is|are|has|have|will)\s+(?:weak to|resistant to|resists|nulls|nullifies|absorbs|drains|reflects|repels|blocks)\s+[^.!?]+)/gi;
    const predicatePattern =
      /(?:(?:is|are|has|have|will)\s+)?(weak to|resistant to|resists|nulls|nullifies|absorbs|drains|reflects|repels|blocks)\s+([\s\S]*?)(?=\s+and\s+(?:(?:is|are|has|have|will)\s+)?(?:weak to|resistant to|resists|nulls|nullifies|absorbs|drains|reflects|repels|blocks)\b|$)/gi;
    for (const relationSentence of prose.matchAll(relationSentencePattern)) {
      const entityName = cleanExactValue(relationSentence[1]).replace(/^the\s+/i, "");
      if (
        !entityName ||
        /\b(?:strategy|party|player|protagonist|attack|will be|most effective|best bet|bring|recommended)\b/i.test(
          entityName,
        ) ||
        partyMemberNames.has(normalizeName(entityName))
      ) {
        continue;
      }
      for (const predicate of relationSentence[2].matchAll(predicatePattern)) {
        const relationName = predicate[1].toLowerCase();
        const factType: ExtractedFact["fact_type"] =
          relationName === "weak to"
            ? "weakness"
            : /resist/.test(relationName)
              ? "resistance"
              : /null|block/.test(relationName)
                ? "nullifies"
                : /drain|absorb/.test(relationName)
                  ? "drains"
                  : "repels";
        for (const value of affinityValues(predicate[2])) {
          addDeterministicFact(
            facts,
            deterministicFact(entityName, "boss", factType, value, proseNote),
          );
        }
      }
    }

    if (pageSubject) {
      const foundFloor = prose.match(/\bfound\s+(?:on|at)\s+(?:Tartarus\s+)?Floor\s+(\d{1,3})\b/i)?.[1];
      if (foundFloor) {
        addDeterministicFact(
          facts,
          deterministicFact(pageSubject.name, "boss", "floor_range", `Floor ${foundFloor}`, proseNote),
        );
      }

      const party =
        prose.match(/\b(?:best bet is to bring|party I brought was|bring)\s+([A-Z][^.!?]{3,100})/i)?.[1] ??
        chunk.text.match(
          /Table data:\s*Character:\s*([^|]+?)(?:\s*\|[^|]*)?\s*\|\|\s*([A-Z][^|]+?)(?:\s*\|[^|]*)?\s*\|\|\s*([A-Z][^|]+?)(?=\s*\||$)/i,
        )?.slice(1).join(", ");
      if (party) {
        const members = affinityValues(party).length
          ? ""
          : cleanExactValue(party)
              .replace(/\b(?:for|because|since|as)\b[\s\S]*$/i, "")
              .replace(/\s+(?:and|&)\s+/g, ", ")
              .replace(/\s*,\s*/g, ", ");
        if (members && members.length <= 120) {
          addDeterministicFact(
            facts,
            deterministicFact(pageSubject.name, "boss", "recommended_party", members, proseNote),
          );
        }
      }

      if (sectionSubject && /\bboss guide\b/i.test(chunk.sectionTitle)) {
        const strategy = conciseValue(prose, 520);
        if (strategy.length >= 60) {
          addDeterministicFact(
            facts,
            deterministicFact(sectionSubject, "boss", "strategy", strategy, proseNote),
          );
        }
      }
    }
  }

  return [...facts.values()];
}

export function extractDeterministicLocationFacts(chunks: TextChunk[]): ExtractedFact[] {
  const facts = new Map<string, ExtractedFact>();
  const note = "Extracted directly from a Tartarus floor or location table.";
  const pageTitle = chunks[0]?.pageTitle ?? "";
  const block = pageTitle.match(/^(.+?)\s+\(Floors?\s+(\d+)\s*[-–]\s*(\d+)\)\s+Tartarus/i);
  if (block) {
    const entityName = `${cleanExactValue(block[1])} Block`;
    addDeterministicFact(
      facts,
      deterministicFact(entityName, "tartarus_floor", "floor_range", `${block[2]}F-${block[3]}F`, note),
    );
  }

  for (const chunk of chunks) {
    for (const location of chunk.text.matchAll(
      /\[([^\]]+?) Location\]\s*Table data:\s*Block:\s*([^|]+?)\s*\|\s*Floors?:\s*([0-9]+F?\s*(?:-|to|–)\s*[0-9]+F?)/gi,
    )) {
      const entityName = cleanExactValue(location[1]);
      addDeterministicFact(
        facts,
        deterministicFact(entityName, "enemy", "location", cleanExactValue(location[2]), note),
      );
      addDeterministicFact(
        facts,
        deterministicFact(entityName, "enemy", "floor_range", cleanExactValue(location[3]), note),
      );
    }
    for (const location of chunk.text.matchAll(
      /Table data:\s*Boss Overview:\s*Floor:\s*([0-9]+F?\s*(?:-|to|–)\s*[0-9]+F?)\s+Tartarus Block:\s*([^|]+?)(?=\s+Recommended Level:|\s+Boss Type:|$)/gi,
    )) {
      const subject = subjectFromPageTitle(pageTitle);
      if (!subject) continue;
      addDeterministicFact(
        facts,
        deterministicFact(subject.name, "boss", "floor_range", cleanExactValue(location[1]), note),
      );
      addDeterministicFact(
        facts,
        deterministicFact(subject.name, "boss", "location", cleanExactValue(location[2]), note),
      );
    }
  }

  return [...facts.values()];
}

export function extractDeterministicFacts(chunks: TextChunk[]): ExtractedFact[] {
  return [
    ...extractDeterministicAffinityFacts(chunks),
    ...extractDeterministicPersonaFacts(chunks),
    ...extractDeterministicRequestFacts(chunks),
    ...extractDeterministicCalendarFacts(chunks),
    ...extractDeterministicSocialLinkFacts(chunks),
    ...extractDeterministicBossFacts(chunks),
    ...extractDeterministicLocationFacts(chunks),
  ];
}

function isSupportedFact(fact: ExtractedFact, chunks: TextChunk[]): boolean {
  if (!fact.value || fact.confidence < 0.65) return false;
  if (!isPlausibleEntityFact(fact, chunks)) return false;
  if (!hasAffinityEvidence(fact, chunks)) return false;

  const sourceText = normalizeName(
    chunks
      .map((chunk) => `${chunk.pageTitle} ${chunk.sectionTitle} ${chunk.text}`)
      .join(" "),
  );
  const entityNames = [fact.entity_name, ...fact.aliases].map(normalizeName).filter(Boolean);
  if (!entityNames.some((name) => sourceText.includes(name))) return false;

  if (exactFactTypes.has(fact.fact_type)) {
    const terms = meaningfulTerms(fact.value);
    if (terms.length > 0 && !terms.some((term) => sourceText.includes(term))) return false;
  }
  return true;
}

const partyMemberNames = new Set(
  [
    "Yukari",
    "Yukari Takeba",
    "Junpei",
    "Junpei Iori",
    "Akihiko",
    "Akihiko Sanada",
    "Mitsuru",
    "Mitsuru Kirijo",
    "Aigis",
    "Koromaru",
    "Ken",
    "Ken Amada",
    "Shinjiro",
    "Shinjiro Aragaki",
    "Fuuka",
    "Fuuka Yamagishi",
  ].map(normalizeName),
);

const linkedEpisodeNames = new Set(
  [
    "Junpei",
    "Junpei Iori",
    "Akihiko",
    "Akihiko Sanada",
    "Shinjiro",
    "Shinjiro Aragaki",
    "Ken",
    "Ken Amada",
    "Koromaru",
    "Ryoji",
    "Ryoji Mochizuki",
  ].map(normalizeName),
);

function isPlausibleEntityFact(fact: ExtractedFact, chunks: TextChunk[]): boolean {
  const normalizedEntity = normalizeName(fact.entity_name);
  if (
    normalizedEntity.split(" ").length > 8 ||
    /\b(?:will be|most effective|best bet|bring|party|recommended)\b/i.test(fact.entity_name)
  ) {
    return false;
  }

  if (fact.entity_type === "social_link" && linkedEpisodeNames.has(normalizedEntity)) {
    return false;
  }

  if (["enemy", "boss"].includes(fact.entity_type) && partyMemberNames.has(normalizedEntity)) {
    const title = chunks[0]?.pageTitle ?? "";
    const explicitOpponentTitle = new RegExp(
      `^${escapeRegExp(fact.entity_name)}\\b.*\\b(?:boss|weakness|how to beat|battle)\\b`,
      "i",
    );
    return explicitOpponentTitle.test(title);
  }

  return true;
}

async function extractFactsForChunks(chunks: TextChunk[]): Promise<ExtractedFact[]> {
  const deterministicFacts = extractDeterministicFacts(chunks);
  if (chunks[0]?.source.category === "personas" && deterministicFacts.length > 0) {
    return deterministicFacts;
  }
  const models = activeFactExtractionModel
    ? [activeFactExtractionModel]
    : [
        ...new Set([
          config.factExtractionModel,
          "qwen/qwen3-32b",
          "meta-llama/llama-4-scout-17b-16e-instruct",
          config.chatModel,
        ]),
      ];
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const content = await createChatCompletion(
          [
            { role: "system", content: factExtractionSystemPrompt },
            { role: "user", content: factExtractionUserPrompt(chunks) },
          ],
          {
            jsonObject: true,
            model,
            maxCompletionTokens: 2_500,
          },
        );
        const raw = RawFactResponseSchema.parse(JSON.parse(content) as unknown);
        const normalized = raw.facts
          .map(normalizeRawFact)
          .filter((fact): fact is ExtractedFact => fact !== null);
        const parsed = FactExtractionResponseSchema.parse({ facts: normalized });
        activeFactExtractionModel = model;
        const modelFacts = parsed.facts.filter((fact) => isSupportedFact(fact, chunks));
        const facts = new Map<string, ExtractedFact>();
        for (const fact of [...modelFacts, ...deterministicFacts]) {
          const key = `${normalizeName(fact.entity_name)}:${fact.fact_type}:${normalizeName(fact.value ?? "")}`;
          facts.set(key, fact);
        }
        return [...facts.values()];
      } catch (error) {
        lastError = error;
        const message = String(error instanceof Error ? error.message : error);
        if (/model_permission_blocked_project|model .* is blocked/i.test(message)) {
          console.warn(`Fact extraction model ${model} is unavailable; trying the next extraction model.`);
          break;
        }
        if (attempt < 3) {
          const retrySeconds = Number(message.match(/try again in ([\d.]+)s/i)?.[1] ?? 0);
          await sleep(Math.max(1_000 * retrySeconds + 500, 1_500 * attempt));
        }
      }
    }
  }
  if (deterministicFacts.length > 0) return deterministicFacts;
  throw lastError;
}

function batchCandidates(chunks: TextChunk[], maxFactChunks: number): TextChunk[][] {
  const candidates = chunks.filter(isFactCandidate).sort((a, b) => candidateScore(b) - candidateScore(a));
  const categoryOrder = [
    "enemies",
    "bosses",
    "social_links",
    "requests",
    "fusion",
    "personas",
    "classroom",
    "tartarus",
    "walkthrough",
    "beginner_strategy",
    "guide",
    "overview",
  ];
  const categoryBuckets = new Map<string, TextChunk[]>();
  for (const chunk of candidates) {
    const bucket = categoryBuckets.get(chunk.source.category) ?? [];
    bucket.push(chunk);
    categoryBuckets.set(chunk.source.category, bucket);
  }
  const selected: TextChunk[] = [];
  while (selected.length < maxFactChunks) {
    let added = false;
    for (const category of categoryOrder) {
      const chunk = categoryBuckets.get(category)?.shift();
      if (!chunk) continue;
      selected.push(chunk);
      added = true;
      if (selected.length >= maxFactChunks) break;
    }
    if (!added) break;
  }

  const bySource = new Map<string, TextChunk[]>();
  for (const chunk of selected) {
    const group = bySource.get(chunk.source.url) ?? [];
    group.push(chunk);
    bySource.set(chunk.source.url, group);
  }

  const batches: TextChunk[][] = [];
  for (const sourceChunks of bySource.values()) {
    let batch: TextChunk[] = [];
    let characters = 0;
    for (const chunk of sourceChunks) {
      if (batch.length >= 2 || characters + chunk.text.length > 5_500) {
        if (batch.length) batches.push(batch);
        batch = [];
        characters = 0;
      }
      batch.push(chunk);
      characters += chunk.text.length;
    }
    if (batch.length) batches.push(batch);
  }
  return batches;
}

export async function extractAndInsertFacts(
  chunks: TextChunk[],
  options: {
    maxFactChunks?: number;
    categories?: string[];
    deterministicOnly?: boolean;
  } = {},
): Promise<number> {
  const maxFactChunks = options.maxFactChunks ?? Number.POSITIVE_INFINITY;
  const eligibleChunks = options.categories?.length
    ? chunks.filter((chunk) => options.categories?.includes(chunk.source.category))
    : chunks;
  const batches = options.deterministicOnly
    ? []
    : batchCandidates(eligibleChunks, maxFactChunks);
  let changed = 0;
  let completed = 0;
  const sourceByUrl = new Map<string, SourceRecord>();

  const chunksBySource = new Map<string, TextChunk[]>();
  for (const chunk of eligibleChunks) {
    const sourceChunks = chunksBySource.get(chunk.source.url) ?? [];
    sourceChunks.push(chunk);
    chunksBySource.set(chunk.source.url, sourceChunks);
  }
  for (const sourceChunks of chunksBySource.values()) {
    const deterministicFacts = extractDeterministicFacts(sourceChunks);
    if (deterministicFacts.length === 0) continue;
    const first = sourceChunks[0];
    const source = await upsertSource(first.source, first.pageTitle);
    sourceByUrl.set(first.source.url, source);
    for (const fact of deterministicFacts) {
      const entityId = await upsertEntity(fact);
      if (await insertOrRefreshFact(fact, entityId, source)) changed += 1;
    }
  }

  if (options.deterministicOnly) {
    console.log(`Loaded ${changed} deterministic facts; skipped model extraction.`);
    return changed;
  }

  console.log(
    `Loaded ${changed} deterministic facts; extracting broader facts from ${Math.min(eligibleChunks.filter(isFactCandidate).length, maxFactChunks)} focused chunks in ${batches.length} batched model calls.`,
  );

  for (const batch of batches) {
    const first = batch[0];
    let source = sourceByUrl.get(first.source.url);
    if (!source) {
      source = await upsertSource(first.source, first.pageTitle);
      sourceByUrl.set(first.source.url, source);
    }

    try {
      const facts = await extractFactsForChunks(batch);
      for (const fact of facts) {
        const entityId = await upsertEntity(fact);
        if (await insertOrRefreshFact(fact, entityId, source)) changed += 1;
      }
    } catch (error) {
      console.warn(
        `Fact extraction skipped ${first.pageTitle}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    completed += 1;
    if (completed % 5 === 0 || completed === batches.length) {
      console.log(`Fact extraction progress: ${completed}/${batches.length} calls, ${changed} facts changed.`);
    }
    if (completed < batches.length) await sleep(config.factExtractionDelayMs);
  }

  return changed;
}
