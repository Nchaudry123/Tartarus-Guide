/**
 * Expert conversation helpers: clarify-first for vague asks, intent-first
 * follow-up chips, friendly-veteran tone (ChatGPT/Grok style).
 */

const vagueReferentialOnly =
  /\b(?:it|that|those|them|this|these|either|neither|both|the first|the second|the other|other options?|different routes?|none of those|same one|previous answer|that one|which one)\b/i;

/** Pronouns that only make sense as follow-ups when a prior assistant turn exists. */
export function hasBareReferentialLanguage(question: string): boolean {
  return vagueReferentialOnly.test(question);
}

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

/** Prefer the latest user utterance when analysis wraps a full thread. */
export function focusUserUtterance(question: string): string {
  const latest = question.match(/The user's latest follow-up is:\s*(.+)$/im)?.[1]?.trim();
  if (latest) return latest;
  const goal = question.match(/The user's active conversation goal is:\s*(.+)$/im)?.[1]?.trim();
  if (goal && !question.includes("latest follow-up")) return goal.split("\n")[0]!.trim();
  return question.trim();
}

export function isVagueCreationQuestion(question: string): boolean {
  const text = focusUserUtterance(question).toLowerCase().trim();
  if (
    !/\b(?:craft|make|create|fuse|fusion|recipe|how (?:do|can|should|would) i (?:get|obtain|summon))\b/i.test(
      text,
    )
  ) {
    return false;
  }

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
      "In P3R “craft” usually means fusion. Which Persona are you trying to make — or did you mean a heart item / piece of gear?",
    followUp: "What are you trying to craft or fuse?",
    suggestedPrompts: [
      "How do I fuse Jack Frost?",
      "How do I fuse Loki?",
      "I mean heart items or equipment",
    ],
    missingInfo: "Name the Persona or item you mean.",
  };
}

export type ExpertTopic =
  | "fusion"
  | "dlc"
  | "social"
  | "boss"
  | "enemy"
  | "schedule"
  | "team"
  | "story"
  | "general";

/** Intent-first topic — never classify Social Link coaching as fusion because the answer said “Persona”. */
export function detectExpertTopic(options: {
  intent?: string;
  answer?: string;
  missing?: string;
  fusionTarget?: string;
}): ExpertTopic {
  if (options.fusionTarget) return "fusion";

  const intent = (options.intent ?? "").toLowerCase();
  const missing = (options.missing ?? "").toLowerCase();
  // Do NOT scan the full answer body for loose keywords like "persona".
  const missIntent = `${missing} ${intent}`;

  if (/persona dlc/i.test(missIntent) || /persona dlc/i.test(options.answer ?? "")) return "dlc";
  if (/social links?|s-?links?|romance|confidant/i.test(intent) || /social (?:link|stats)|s-?link/i.test(missing)) {
    return "social";
  }
  if (/boss help/i.test(intent) || /boss|gatekeeper|full moon/i.test(missing)) return "boss";
  if (/enemy weakness/i.test(intent) || /weakness|affinity|shadow/i.test(missing)) return "enemy";
  if (
    /daily schedule|calendar/i.test(intent) ||
    /month|date|calendar|schedule|today/i.test(missing)
  ) {
    return "schedule";
  }
  if (/team building/i.test(intent) || /party|team|level/i.test(missing)) return "team";
  if (/story guidance/i.test(intent)) return "story";
  if (
    /fusion advice/i.test(intent) ||
    /craft|fuse|fusion recipe|name the persona you mean|heart item/i.test(missing)
  ) {
    return "fusion";
  }
  return "general";
}

export function expertSuggestedPrompts(options: {
  intent?: string;
  answer?: string;
  missing?: string;
  hasSources?: boolean;
  fusionTarget?: string;
  needsDetail?: boolean;
  serverPrompts?: string[];
  month?: string;
}): string[] {
  const topic = detectExpertTopic(options);
  const server = (options.serverPrompts ?? []).filter((prompt) => {
    // Drop server chips that clearly belong to another topic.
    if (topic === "social" && /fuse|heart item|equipment/i.test(prompt)) return false;
    if (topic === "boss" && /fuse Jack|fuse Loki|heart item/i.test(prompt)) return false;
    if (topic !== "fusion" && /I mean (?:a )?heart item|I mean equipment/i.test(prompt)) return false;
    return true;
  });

  const prompts: string[] = [...server];

  if (topic === "fusion" || options.fusionTarget) {
    if (options.fusionTarget) {
      prompts.push(
        `How do I fuse ${options.fusionTarget}?`,
        "Show another route",
        "What skills should I keep?",
      );
    } else if (options.needsDetail) {
      prompts.push(
        "How do I fuse Jack Frost?",
        "How do I fuse Loki?",
        "I mean heart items or equipment",
      );
    } else {
      prompts.push("What skills should I keep?", "Show another route");
    }
  } else if (topic === "dlc") {
    prompts.push("No Persona DLC", "I have all Persona DLC");
  } else if (topic === "social") {
    if (options.needsDetail) {
      prompts.push(
        "Charm is around rank 3",
        "Academics and Courage are both fine",
        "I haven't started many links yet",
      );
      if (options.month) {
        prompts.push(`Still focusing on ${options.month}`);
      } else {
        prompts.push("I'm in August");
      }
    } else {
      prompts.push(
        "What about romance links?",
        "Which ones are missable?",
        "What should I do in the evenings?",
      );
    }
  } else if (topic === "boss") {
    prompts.push("I'm fighting Priestess", "It's a Tartarus gatekeeper", "I'm underleveled");
  } else if (topic === "enemy") {
    prompts.push("What is Dancing Hand weak to?", "I'm on Thebel Block", "Any resists I should avoid?");
  } else if (topic === "schedule") {
    prompts.push(
      options.month ? `Still in ${options.month}` : "I'm in July",
      "What should I do before the full moon?",
      "Any exams coming up?",
    );
  } else if (topic === "team") {
    prompts.push("I'm level 24 with Yukari and Junpei", "We're running out of SP", "Who should I replace?");
  } else if (options.needsDetail) {
    prompts.push("I'm stuck on a boss", "Help me fuse a Persona", "Which Social Links should I prioritize?");
  } else if (options.hasSources) {
    prompts.push("What should I do next?", "Any risks I should watch?");
  }

  return uniquePrompts(prompts);
}

function uniquePrompts(prompts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const prompt of prompts) {
    const trimmed = prompt.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    if (/player memory|rephrase|focused question|one more detail|needs detail/i.test(trimmed)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
    if (result.length >= 4) break;
  }
  return result;
}

/** Soft status — prefer null (ChatGPT rarely badges “needs detail”). */
export function expertStatusCopy(options: {
  needsDetail: boolean;
  hasSources: boolean;
  mode: string;
  missing?: string;
  sourceCount?: number;
  intent?: string;
}): { tone: string; label: string; detail: string } | null {
  // Coaching threads: no badge — the answer already asks naturally.
  if (options.needsDetail) {
    const topic = detectExpertTopic({
      intent: options.intent,
      missing: options.missing,
      answer: "",
    });
    if (topic === "social" || topic === "team" || topic === "schedule" || topic === "general") {
      return null;
    }
    return {
      tone: "needs-detail",
      label: "One thing",
      detail: options.missing?.trim() || "Share one more detail and I can be exact.",
    };
  }
  if (options.hasSources && options.mode === "rag") {
    const count = options.sourceCount ?? 0;
    if (count <= 0) return null;
    // Keep quiet on long coaching answers; UI can still show sources drawer.
    if (/social links?|team building|daily schedule|general discussion/i.test(options.intent ?? "")) {
      return null;
    }
    return {
      tone: "verified",
      label: "From the notes",
      detail: count === 1 ? "Checked against a trusted guide." : `Checked against ${count} trusted notes.`,
    };
  }
  if (options.mode === "error") {
    return {
      tone: "offline",
      label: "Connection blip",
      detail: "Your chat is saved — try sending that again.",
    };
  }
  return null;
}
