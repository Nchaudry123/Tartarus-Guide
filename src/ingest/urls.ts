import type { SourceInput } from "../types/schema.js";

const ign = (title: string, path: string, category: string): SourceInput => ({
  title,
  url: `https://www.ign.com/wikis/persona-3-reload/${path}`,
  category,
  sourceType: "guide",
  credibilityRank: 10,
});

export const curatedSources: SourceInput[] = [
  ign("Persona 3 Reload Wiki Guide", "Persona_3_Reload_Guide", "overview"),
  ign("Walkthrough", "Walkthrough", "walkthrough"),
  ign("Tartarus", "Tartarus", "tartarus"),
  ign("Boss Guides", "Bosses", "bosses"),
  ign("Social Links", "Social_Links", "social_links"),
  ign("Elizabeth Requests", "Elizabeth_Requests", "requests"),
  ign("Persona Fusion", "Persona_Fusion", "fusion"),
  ign("Personas", "Personas", "personas"),
  ign("Enemies", "Enemies", "enemies"),
  ign("Beginner Tips", "Beginner%27s_Guide_-_Tips_and_Tricks", "beginner_strategy"),
];
