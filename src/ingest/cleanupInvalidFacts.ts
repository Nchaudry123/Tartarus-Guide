import "dotenv/config";
import { normalizeName, supabase } from "../db/client";

const applyChanges = process.argv.includes("--apply");
const impossibleSingleOpponents = new Set(
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

type EntityRow = {
  id: string;
  name: string;
  type: string;
  normalized_name: string;
  facts: Array<{ id: string; source_id: string }> | null;
};

async function fetchAllEntities(): Promise<EntityRow[]> {
  const pageSize = 1000;
  const entities: EntityRow[] = [];

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("entities")
      .select("id,name,type,normalized_name,facts(id,source_id)")
      .order("name")
      .range(start, start + pageSize - 1);
    if (error) throw error;

    const page = (data ?? []) as EntityRow[];
    entities.push(...page);
    if (page.length < pageSize) break;
  }

  return entities;
}

function invalidReason(entity: EntityRow): string | null {
  const normalized = normalizeName(entity.normalized_name || entity.name);
  if (["enemy", "boss"].includes(entity.type) && impossibleSingleOpponents.has(normalized)) {
    return "party member incorrectly classified as an enemy or boss";
  }
  if (entity.type === "social_link" && linkedEpisodeNames.has(normalized)) {
    return "Linked Episode character incorrectly classified as a Social Link";
  }
  if (
    ["enemy", "boss"].includes(entity.type) &&
    (
      entity.name.includes("/") ||
      /\b(?:will be|most effective|best bet|recommended)\b/i.test(entity.name) ||
      /\b(?:boss guide|weaknesses and resistances|up next:)\b/i.test(entity.name)
    )
  ) {
    return "page headings or strategy prose incorrectly stored as a combat entity";
  }
  return null;
}

async function main(): Promise<void> {
  const invalid = (await fetchAllEntities())
    .map((entity) => ({ entity, reason: invalidReason(entity) }))
    .filter(
      (value): value is { entity: EntityRow; reason: string } => value.reason !== null,
    );

  if (!invalid.length) {
    console.log("No clearly invalid relationship or party-member entities were found.");
    return;
  }

  console.log(`${applyChanges ? "Deleting" : "Dry run found"} ${invalid.length} invalid entities:`);
  for (const { entity, reason } of invalid) {
    console.log(`- ${entity.name} [${entity.type}] (${entity.facts?.length ?? 0} facts): ${reason}`);
  }

  if (!applyChanges) {
    console.log("\nRun `npm run ingest:cleanup -- --apply` to delete these entities and their cascading facts.");
    return;
  }

  const { error: deleteError } = await supabase
    .from("entities")
    .delete()
    .in("id", invalid.map(({ entity }) => entity.id));
  if (deleteError) throw deleteError;
  console.log(`Deleted ${invalid.length} invalid entities and their cascading facts.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
