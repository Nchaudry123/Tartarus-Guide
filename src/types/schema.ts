import { z } from "zod";

export const entityTypes = [
  "enemy",
  "boss",
  "persona",
  "social_link",
  "request",
  "item",
  "equipment",
  "location",
  "mechanic",
  "party_member",
  "tartarus_floor",
  "activity",
  "skill",
] as const;

export const factTypes = [
  "weakness",
  "resistance",
  "nullifies",
  "drains",
  "repels",
  "location",
  "strategy",
  "recommended_party",
  "fusion_recipe",
  "unlock_condition",
  "deadline",
  "reward",
  "prerequisite",
  "floor_range",
  "tip",
  "schedule",
  "answer_choice",
  "item_effect",
] as const;

export type EntityType = (typeof entityTypes)[number];
export type FactType = (typeof factTypes)[number];

export const SourceInputSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  category: z.string(),
  sourceType: z.string().default("guide"),
  credibilityRank: z.number().int().min(1).default(50),
});

export type SourceInput = z.infer<typeof SourceInputSchema>;

export type SourceRecord = {
  id: string;
  title: string;
  url: string;
  domain: string;
  category: string;
  source_type: string;
  credibility_rank: number;
};

export type ContentSection = {
  title: string;
  text: string;
};

export type ExtractedPage = {
  source: SourceInput;
  pageTitle: string;
  sections: ContentSection[];
};

export type TextChunk = {
  source: SourceInput;
  pageTitle: string;
  sectionTitle: string;
  text: string;
  tokenCount: number;
  hash: string;
};

export const ExtractedFactSchema = z.object({
  entity_name: z.string().min(1),
  entity_type: z.enum(entityTypes),
  aliases: z.array(z.string()).default([]),
  fact_type: z.enum(factTypes),
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable().optional(),
});

export const FactExtractionResponseSchema = z.object({
  facts: z.array(ExtractedFactSchema),
});

export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

export type FactMatch = {
  id: string;
  fact_type: FactType;
  value: string;
  confidence: number;
  notes: string | null;
  entity: {
    id: string;
    name: string;
    type: EntityType;
    aliases: string[];
    normalized_name: string;
  };
  source: {
    id: string;
    title: string;
    url: string;
    domain: string;
    credibility_rank: number;
  };
};

export type ChunkMatch = {
  id: string;
  source_id: string;
  section_title: string | null;
  chunk_text: string;
  token_count: number;
  similarity?: number;
  source_title: string;
  source_url: string;
  source_domain: string;
  source_credibility_rank: number;
};
