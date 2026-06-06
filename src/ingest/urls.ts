import type { SourceInput } from "../types/schema";

const guide = (
  title: string,
  url: string,
  category: string,
  credibilityRank: number,
): SourceInput => ({
  title,
  url: url.replace(/\/$/, ""),
  category,
  sourceType: "guide",
  credibilityRank,
});

const ign = (title: string, path: string, category: string): SourceInput =>
  guide(
    title,
    `https://www.ign.com/wikis/persona-3-reload${path ? `/${path}` : ""}`,
    category,
    10,
  );

const game8 = (title: string, archiveId: string | null, category: string): SourceInput =>
  guide(
    title,
    archiveId
      ? `https://game8.co/games/Persona-3-Reload/archives/${archiveId}`
      : "https://game8.co/games/Persona-3-Reload",
    category,
    20,
  );

/**
 * These are discovery entry points, not the full corpus. Focused child pages
 * found under these pages are ranked and balanced by discoverSources.
 */
export const curatedSources: SourceInput[] = [
  ign("Persona 3 Reload Wiki Guide", "", "overview"),
  ign("Persona 3 Reload Walkthrough", "Persona_3_Reload_Walkthrough", "walkthrough"),
  ign("Calendar Walkthrough", "Calendar_Walkthrough", "walkthrough"),
  ign("Tartarus Walkthrough", "Tartarus_Walkthrough", "tartarus"),
  ign("Boss Guides", "Boss_Guides", "bosses"),
  ign("Social Links Guide", "Social_Links_Guide", "social_links"),
  ign("Elizabeth Requests Guide", "Elizabeth%27s_Requests_Guide", "requests"),
  ign("Missing Person Locations and Dates", "Missing_Person_Locations_and_Dates", "requests"),
  ign("Classroom Answers", "Persona_3_Reload_Classroom_Answers", "classroom"),
  game8("Persona 3 Reload Walkthrough and Guides", null, "overview"),
  game8("Beginner's Guide to Persona 3 Reload", "435585", "beginner_strategy"),
  game8("Rare and Greedy Shadows Weaknesses and Locations", "443460", "enemies"),
  game8("Guardian Bosses", "440374", "bosses"),
  game8("Walkthrough and 100% Social Link Guide", "439345", "social_links"),
  game8("Romance Guide", "439868", "social_links"),
  game8("List of All Elizabeth's Requests", "439673", "requests"),
  game8("Dyad and Special Fusion Guide", "439718", "fusion"),
  game8("Priestess Boss Guide", "441827", "bosses"),
  game8("Swift Axle Boss Guide", "443253", "bosses"),
  game8("Terminal Table Boss Guide", "444325", "bosses"),
  game8("Nemean Beast Boss Guide", "443644", "bosses"),
  game8("Lovers Boss Guide", "441988", "bosses"),
  game8("Strength and Fortune Boss Guide", "445016", "bosses"),
];
