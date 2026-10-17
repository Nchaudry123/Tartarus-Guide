import { timed } from "../chat/requestTiming";
import type { FusionClaim, FusionRecipeRow } from "../quality/fusionClaims";

/**
 * Fusion tool lookups for checking fusion claims in answers: every Persona name (cached for
 * the life of the server instance) and the recipes that use a claim's ingredients.
 */

let personaNamesPromise: Promise<string[]> | null = null;
let loadedPersonaNames: string[] | null = null;

export function personaNames(): Promise<string[]> {
  personaNamesPromise ??= (async () => {
    const { supabase } = await import("../db/client");
    const { data, error } = await supabase.from("entities").select("name").eq("type", "persona").limit(2000);
    if (error) throw error;
    loadedPersonaNames = [...new Set((data ?? []).map((row) => row.name as string))];
    return loadedPersonaNames;
  })().catch((error) => {
    personaNamesPromise = null;
    throw error;
  });
  return personaNamesPromise;
}

/** The names if they have already loaded, for synchronous checks such as the stream gate. */
export function personaNamesIfLoaded(): string[] | null {
  return loadedPersonaNames;
}

function dlcModeOf(notes: string | null | undefined): FusionRecipeRow["dlcMode"] {
  const mode = notes?.match(/\bDLC mode:\s*(none|all|any)\b/i)?.[1]?.toLowerCase();
  return mode === "none" || mode === "all" ? mode : "any";
}

/** Fusion tool recipes containing all of each claim's ingredients. */
export async function recipesForClaims(claims: FusionClaim[]): Promise<FusionRecipeRow[]> {
  return timed("fusionLookup", async () => {
    // Loaded lazily: the client needs database env vars, and the chat route must load without them.
    const { supabase } = await import("../db/client");
    const results = await Promise.all(
      claims.map(async (claim) => {
        let query = supabase
          .from("facts")
          .select("value,notes,entity:entities!inner(name),source:sources!inner(url)")
          .eq("fact_type", "fusion_recipe")
          .like("source.url", "%megaten-fusion-tool%")
          .limit(20);
        for (const ingredient of claim.ingredients) query = query.ilike("value", `%${ingredient.replace(/[%_]/g, "")}%`);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map((row) => {
          const record = row as unknown as { value: string; notes: string | null; entity: { name: string } };
          return {
            ingredients: record.value.split(/\s*\+\s*/).map((name) => name.trim()).filter(Boolean),
            result: record.entity.name,
            dlcMode: dlcModeOf(record.notes),
          };
        });
      }),
    );
    return results.flat();
  });
}
