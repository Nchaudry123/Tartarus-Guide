/**
 * Expert conversation helpers: clarify-first for vague asks, keep replies
 * sounding like a friendly P3R veteran instead of a search UI.
 */

const vagueReferentialOnly =
  /\b(?:it|that|those|them|this|these|either|neither|both|the first|the second|the other|other options?|different routes?|none of those|same one|previous answer|that one|which one)\b/i;

/** Pronouns that only make sense as follow-ups when a prior assistant turn exists. */
export function hasBareReferentialLanguage(question: string): boolean {
  return vagueReferentialOnly.test(question);
}

/**
 * Vague craft/make/create/get asks with no named Persona/item/enemy.
 * Default: always clarify (do not invent early-game fusion tips).
 */
const creationPronouns = new Set([
  "it",
  "this",
  "that",
  "these",
  "those",
  "them",
  "one",
  "some",
  "any",
  "something",
  "anything",
]);

export function isVagueCreationQuestion(question: string): boolean {
  const text = question.toLowerCase().trim();
  if (
    !/\b(?:craft|make|create|fuse|fusion|recipe|how (?:do|can|should|would) i (?:get|obtain|summon))\b/i.test(
      text,
    )
  ) {
    return false;
  }

  // Named target after fuse/make/craft/get (any casing): "fuse Loki", "make jack frost"
  const stripped = text.replace(/[?.!]+$/g, "").trim();
  const namedTarget = stripped
    .match(
      /\b(?:fuse|make|craft|create|get|obtain|summon)\s+(?:a |an |the )?([a-z0-9][a-z0-9'’.\- ]{1,40})$/i,
    )?.[1]
    ?.trim();
  if (namedTarget) {
    const first = namedTarget.split(/\s+/)[0] ?? "";
    if (first && !creationPronouns.has(first)) return false;
  }

  // "how do i craft these" / "how do i make it" / "fusion recipes?"
  if (/\b(?:these|those|them|it|this|that)\b/i.test(text)) return true;
  if (text.split(/\s+/).filter(Boolean).length <= 7) return true;

  const residual = text
    .replace(
      /\b(?:how|do|can|should|would|i|a|an|the|to|for|with|my|me|please|craft|make|create|fuse|fusion|recipe|recipes|get|obtain|summon|what|which)\b/gi,
      " ",
    )
    .trim();
  return residual.length < 3;
}

export function expertVagueCreationClarify(): {
  answer: string;
  followUp: string;
  suggestedPrompts: string[];
  missingInfo: string;
} {
  return {
    answer:
      "Craft usually means fusion in Persona 3 Reload — but I need the target. Name the Persona you want (for example Jack Frost or Loki), or say whether you mean a heart item / equipment instead.",
    followUp: "What are you trying to craft or fuse?",
    suggestedPrompts: [
      "How do I fuse Jack Frost?",
      "How do I fuse Loki?",
      "I mean a heart item / equipment",
    ],
    missingInfo: "Name the Persona, item, or recipe you mean by “these.”",
  };
}

export function expertSuggestedPrompts(options: {
  intent?: string;
  answer?: string;
  missing?: string;
  hasSources?: boolean;
  fusionTarget?: string;
  needsDetail?: boolean;
  serverPrompts?: string[];
}): string[] {
  const prompts = [...(options.serverPrompts ?? [])];
  const intent = options.intent ?? "";
  const missing = (options.missing ?? "").toLowerCase();
  const answer = options.answer ?? "";

  if (options.fusionTarget) {
    prompts.push(
      `How do I fuse ${options.fusionTarget}?`,
      "Show another route",
      "What skills should I keep?",
    );
  } else if (/persona dlc/i.test(answer) || /persona dlc/i.test(missing)) {
    prompts.push("No Persona DLC", "I have all Persona DLC");
  } else if (options.needsDetail) {
    if (/fuse|fusion|craft|persona|recipe/i.test(missing + answer + intent)) {
      prompts.push(
        "How do I fuse Jack Frost?",
        "How do I fuse Loki?",
        "I mean equipment / heart items",
      );
    } else if (/boss|gatekeeper|full moon/i.test(missing + answer + intent)) {
      prompts.push("I'm fighting Priestess", "It's a Tartarus gatekeeper", "Next full moon prep");
    } else if (/social link|s-link|romance/i.test(missing + answer + intent)) {
      prompts.push("When does Yukari's Social Link start?", "Best early Social Links", "I'm in June");
    } else if (/weak|enemy|shadow|affinity/i.test(missing + answer + intent)) {
      prompts.push("What is Dancing Hand weak to?", "I'm on Thebel Block", "Floor 20 shadows");
    } else if (/month|date|calendar|schedule|today/i.test(missing + answer + intent)) {
      prompts.push("I'm in July", "What should I do before the full moon?", "Classroom answers this month");
    } else {
      // In-world defaults — never meta UI language.
      prompts.push(
        "I'm stuck on a boss",
        "Help me fuse a Persona",
        "What should I do before the full moon?",
      );
    }
  } else if (options.hasSources) {
    if (/weak|resist|nullif|drain|repel/i.test(answer)) {
      prompts.push("Safe opener for this fight", "What resists should I avoid?");
    } else if (/fuse|fusion|route|recipe/i.test(answer + intent)) {
      prompts.push("What skills should I keep?", "Show another route");
    } else {
      prompts.push("What should I do next?", "Any risks I should watch?");
    }
  }

  return prompts;
}

/** Soft status labels for veteran-coach tone (UI). */
export function expertStatusCopy(options: {
  needsDetail: boolean;
  hasSources: boolean;
  mode: string;
  missing?: string;
  sourceCount?: number;
}): { tone: string; label: string; detail: string } | null {
  if (options.needsDetail) {
    // Prefer showing the missing detail as conversational context, not a red flag.
    return {
      tone: "needs-detail",
      label: "Quick check",
      detail: options.missing?.trim() || "One more detail and I can be exact.",
    };
  }
  if (options.hasSources && options.mode === "rag") {
    // Hide chrome on pure chat; only show for sourced exact answers when useful.
    const count = options.sourceCount ?? 0;
    if (count <= 0) return null;
    return {
      tone: "verified",
      label: "Cross-checked",
      detail: count === 1 ? "Pulled from a trusted guide note." : `Pulled from ${count} trusted notes.`,
    };
  }
  if (options.mode === "error") {
    return {
      tone: "offline",
      label: "Connection blip",
      detail: "Conversation is saved — send that again.",
    };
  }
  return null;
}
