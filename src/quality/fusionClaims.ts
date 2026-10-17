/**
 * Fusion claims in a model-written answer ("Ananta + Asura fuses into Alilat", "make Loki by
 * fusing Pixie and Jack Frost"). Each claim is checked against the fusion tool recipes before
 * the answer is shown; the model once answered "Ananta and Asura make Ravana" (it's Alilat).
 */

export type FusionClaim = {
  ingredients: string[];
  result: string;
  /** The sentence the claim came from, so a wrong one can be dropped. */
  sentence: string;
};

const joiner = /^\s*(?:\+|and|with|&)\s*$/i;
// Text between the ingredient group and a following result name.
const forwardMarker =
  /^\s*(?:=|→|->|=>|,?\s*(?:which\s+)?(?:(?:can|will|would|should)\s+)?(?:be\s+)?(?:(?:fused|combined)\s+)?(?:together\s+)?(?:makes?|fuses?\s+into|fuse\s+to\s+(?:get|make)|creates?|gives?(?:\s+you)?|results?\s+in|becomes?|yields?|produces?|to\s+(?:get|make|create|fuse|unlock)|(?:in)?to(?:\s+get)?|for(?:\s+an?)?|gets?\s+you))\s*(?:an?\s+|the\s+)?$/i;
// Text between a preceding result name and the ingredient group.
const backwardMarker =
  /^\s*(?:=|:|←|<-|,?\s*(?:comes?\s+from|is\s+(?:made|fused)\s+(?:from|with|by\s+fusing)|from|by\s+fusing|via|using|with|needs?|requires?|recipe(?:\s+is)?:?|you\s+(?:can\s+)?(?:go\s+with|use|fuse|combine|need)|(?:go\s+with|use|fuse|combine))|,\s*(?:you\s+(?:can|could|should)\s+)?(?:go\s+with|use|fuse|combine|try))\s*(?:the\s+)?$/i;
const fusionVerb = /\b(?:fus(?:e|es|ed|ing|ion)|makes?|creates?|recipe|combine)\b|[+=→]/i;
// A capitalized name after a forward marker that isn't a known Persona ("...make Ravana").
const forwardMarkerThenName = new RegExp(
  `${forwardMarker.source.replace(/\$$/, "")}([A-Z][\\w'’-]*(?:\\s+[A-Z][\\w'’-]*){0,2})`,
  "i",
);
const notNames = new Set(["you", "your", "it", "its", "a", "an", "the", "this", "that", "them", "they", "something", "one", "both", "persona", "personas", "velvet", "elizabeth", "igor"]);

type Found = { name: string; start: number; end: number };

function findNames(sentence: string, sortedNames: string[]): Found[] {
  const found: Found[] = [];
  const taken = new Array<boolean>(sentence.length).fill(false);
  for (const name of sortedNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]");
    const pattern = new RegExp(`(?<![\\w'’-])${escaped}(?![\\w'’-])`, "gi");
    for (const match of sentence.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (taken.slice(start, end).some(Boolean)) continue;
      for (let i = start; i < end; i += 1) taken[i] = true;
      found.push({ name, start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/**
 * Extracts claims whose names are all known Personas. Longer names are matched first so
 * "Jack Frost" isn't read as "Jack".
 */
export function extractFusionClaims(text: string, personaNames: string[]): FusionClaim[] {
  const sortedNames = [...personaNames].sort((a, b) => b.length - a.length);
  const claims: FusionClaim[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (!fusionVerb.test(sentence)) continue;
    const names = findNames(sentence, sortedNames);
    if (names.length < 2) continue;
    let index = 0;
    while (index < names.length) {
      // Grow an ingredient group: A + B (+ C ...).
      let end = index;
      while (end + 1 < names.length && joiner.test(sentence.slice(names[end].end, names[end + 1].start))) end += 1;
      if (end === index) {
        index += 1;
        continue;
      }
      const group = names.slice(index, end + 1);
      const next = names[end + 1];
      const previous = names[index - 1];
      let result: Found | undefined;
      const after = sentence.slice(group[group.length - 1].end);
      const unknownResult = after.match(forwardMarkerThenName)?.[1];
      if (next && forwardMarker.test(sentence.slice(group[group.length - 1].end, next.start))) {
        result = next;
      } else if (unknownResult && /^[A-Z]/.test(unknownResult) && !notNames.has(unknownResult.split(/\s+/)[0]!.toLowerCase())) {
        // Not a Persona in this game at all, so the claim can't be right.
        const start = group[group.length - 1].end + after.indexOf(unknownResult);
        result = { name: unknownResult, start, end: start + unknownResult.length };
      } else if (previous && backwardMarker.test(sentence.slice(previous.end, group[0].start))) {
        result = previous;
      } else if (previous && /\b(?:fuse|make|get|create|unlock)\s+(?:an?\s+|the\s+)?$/i.test(sentence.slice(Math.max(0, previous.start - 30), previous.start))) {
        // "To fuse Alilat, go with Ananta + Asura."
        result = previous;
      }
      if (result && !group.some((item) => item.name.toLowerCase() === result!.name.toLowerCase())) {
        claims.push({ ingredients: group.map((item) => item.name), result: result.name, sentence });
      }
      index = end + 1;
    }
  }
  return claims;
}

const key = (names: string[]) => names.map((name) => name.toLowerCase()).sort().join(" + ");

export type FusionRecipeRow = { ingredients: string[]; result: string; dlcMode: "none" | "all" | "any" };

export type FusionClaimCheck = FusionClaim & {
  ok: boolean;
  /** What the ingredients really make (for the player's DLC setting), if known. */
  actualResult?: string;
};

/** True when the recipe holds for the player's DLC setting (unknown setting accepts either). */
function modeMatches(row: FusionRecipeRow, dlc?: string): boolean {
  if (row.dlcMode === "any" || !dlc || (dlc !== "none" && dlc !== "all")) return true;
  return row.dlcMode === dlc;
}

export function checkFusionClaims(
  claims: FusionClaim[],
  recipes: FusionRecipeRow[],
  dlc?: string,
): FusionClaimCheck[] {
  return claims.map((claim) => {
    const wanted = key(claim.ingredients);
    const matching = recipes.filter((row) => key(row.ingredients) === wanted && modeMatches(row, dlc));
    const ok = matching.some((row) => row.result.toLowerCase() === claim.result.toLowerCase());
    return { ...claim, ok, actualResult: ok ? undefined : matching[0]?.result };
  });
}

export function fusionCorrectionNotes(checks: FusionClaimCheck[]): string[] {
  return checks
    .filter((check) => !check.ok)
    .map((check) =>
      check.actualResult
        ? `${check.ingredients.join(" + ")} fuses into ${check.actualResult}, not ${check.result}.`
        : `${check.ingredients.join(" + ")} is not a verified recipe for ${check.result}; don't state it.`,
    );
}

/** Drops sentences with wrong fusion claims, adding the verified result where one is known. */
export function withoutWrongFusionClaims(text: string, checks: FusionClaimCheck[]): string {
  const wrong = checks.filter((check) => !check.ok);
  if (!wrong.length) return text;
  const badSentences = new Set(wrong.map((check) => check.sentence));
  const kept = text.split(/(?<=[.!?])\s+/).filter((sentence) => !badSentences.has(sentence));
  const corrections = [...new Set(wrong.filter((check) => check.actualResult).map((check) => `${check.ingredients.join(" + ")} fuses into ${check.actualResult}.`))];
  return [...corrections, ...kept].join(" ").trim();
}

/** "What do Ananta and Asura make?" / "If I fuse Ananta with Asura what do I get?" */
const asksPairResult =
  /\b(?:what|which)\b.*\b(?:make|makes|create|creates|get|result|become|fuse into|turn into)\b|\b(?:make|makes|create|creates)\b.*\b(?:what|which)\b/i;

/** The ingredient Personas named in a "what do these make?" question, in order (2 or 3), or null. */
export function pairResultIngredients(question: string, personaNames: string[]): string[] | null {
  if (!asksPairResult.test(question) || !/\b(?:and|with|plus)\b|\+/i.test(question)) return null;
  const found = findNames(question, [...personaNames].sort((a, b) => b.length - a.length));
  if (found.length < 2 || found.length > 3) return null;
  return found.map((item) => item.name);
}

/** The verified result(s) of fusing exactly these ingredients for the player's DLC setting. */
export function pairResults(ingredients: string[], recipes: FusionRecipeRow[], dlc?: string): string[] {
  const wanted = key(ingredients);
  return [...new Set(recipes.filter((row) => key(row.ingredients) === wanted && modeMatches(row, dlc)).map((row) => row.result))];
}
