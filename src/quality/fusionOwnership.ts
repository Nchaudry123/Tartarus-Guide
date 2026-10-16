/**
 * Fusion ingredient ownership. Only two things count as "owned":
 *  - Personas saved in the player's own Player Memory (the request's ownedPersonas), and
 *  - Personas the player explicitly said they have in the conversation ("I have Apsaras").
 * Profile guesses made by the controller LLM never count, and only the first source is ever
 * labelled "In Player Memory".
 */
export type IngredientOwnership = {
  owned: boolean;
  inPlayerMemory: boolean;
};

const normalize = (name: string) => name.trim().toLowerCase();

export function fusionOwnershipChecker(options: {
  savedOwnedPersonas?: string[];
  mentionedOwnedPersonas?: string[];
}): (name: string) => IngredientOwnership {
  const saved = new Set((options.savedOwnedPersonas ?? []).map(normalize).filter(Boolean));
  const mentioned = new Set((options.mentionedOwnedPersonas ?? []).map(normalize).filter(Boolean));
  return (name: string) => {
    const key = normalize(name);
    const inPlayerMemory = saved.has(key);
    return { owned: inPlayerMemory || mentioned.has(key), inPlayerMemory };
  };
}

export function fusionIngredientLabel(ingredient: { inPlayerMemory?: boolean }): string {
  return ingredient.inPlayerMemory ? "In Player Memory" : "Ingredient";
}
