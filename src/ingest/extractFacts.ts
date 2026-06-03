import { createChatCompletion, normalizeName, supabase } from "../db/client";
import { FactExtractionResponseSchema, type ExtractedFact, type SourceRecord, type TextChunk } from "../types/schema";
import { upsertSource } from "./embedChunks";

export const factExtractionSystemPrompt = `You extract structured Persona 3 Reload guide facts from short source chunks.

Rules:
- Extract only factual game-guide information directly supported by the source chunk.
- Do not infer unsupported weaknesses, dates, fusions, deadlines, or strategies.
- Use null for a value only when the source explicitly says the detail is unknown or unavailable.
- Never invent entity names, aliases, weaknesses, rewards, floor ranges, or answer choices.
- Keep each fact atomic: one entity, one fact_type, one value.
- Separate enemies, bosses, personas, requests, social links, locations, items, equipment, mechanics, party members, Tartarus floors, activities, and skills.
- Capture aliases only when the chunk gives them.
- Confidence must be 0 to 1 and should reflect how directly the chunk supports the fact.
- Return strict JSON only, with this shape: {"facts":[{"entity_name":"Dancing Hand","entity_type":"enemy","aliases":[],"fact_type":"weakness","value":"Fire","confidence":0.94,"notes":"Optional short caveat"}]}.`;

const factExtractionUserPrompt = (chunk: TextChunk): string => `Source title: ${chunk.pageTitle}
Source URL: ${chunk.source.url}
Section: ${chunk.sectionTitle}

Chunk:
${chunk.text}`;

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

  if (error) {
    throw error;
  }
  return data.id as string;
}

async function insertFact(fact: ExtractedFact, entityId: string, source: SourceRecord): Promise<boolean> {
  if (!fact.value) {
    return false;
  }

  const { data: existing, error: existingError } = await supabase
    .from("facts")
    .select("id")
    .eq("entity_id", entityId)
    .eq("source_id", source.id)
    .eq("fact_type", fact.fact_type)
    .ilike("value", fact.value)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }
  if (existing) {
    return false;
  }

  const { error } = await supabase.from("facts").insert(
    {
      entity_id: entityId,
      source_id: source.id,
      fact_type: fact.fact_type,
      value: fact.value,
      confidence: fact.confidence,
      notes: fact.notes ?? null,
    },
  );

  if (error) {
    throw error;
  }
  return true;
}

export async function extractFactsForChunk(chunk: TextChunk): Promise<ExtractedFact[]> {
  const content = await createChatCompletion([
    { role: "system", content: factExtractionSystemPrompt },
    { role: "user", content: factExtractionUserPrompt(chunk) },
  ], { jsonObject: true });

  const json = JSON.parse(content) as unknown;
  const parsed = FactExtractionResponseSchema.parse(json);
  return parsed.facts.filter((fact) => fact.value !== null && fact.value.trim().length > 0);
}

export async function extractAndInsertFacts(chunks: TextChunk[]): Promise<number> {
  let inserted = 0;
  const sourceByUrl = new Map<string, SourceRecord>();

  for (const chunk of chunks) {
    let source = sourceByUrl.get(chunk.source.url);
    if (!source) {
      source = await upsertSource(chunk.source, chunk.pageTitle);
      sourceByUrl.set(chunk.source.url, source);
    }

    const facts = await extractFactsForChunk(chunk);
    for (const fact of facts) {
      const entityId = await upsertEntity(fact);
      const didInsert = await insertFact(fact, entityId, source);
      if (didInsert) {
        inserted += 1;
      }
    }
  }

  return inserted;
}
