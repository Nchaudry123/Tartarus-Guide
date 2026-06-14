export type GroundingStatus = "verified" | "partial" | "insufficient";

export type GroundingAssessment = {
  status: GroundingStatus;
  confidenceCeiling: number;
  notes: string[];
};

type GroundingInput = {
  requiresExactEvidence: boolean;
  matchingFactConfidences: number[];
  matchingChunkSimilarities: number[];
};

export function requiresExactGameEvidence(question: string, intent: string): boolean {
  if (intent === "Enemy Weakness") return true;
  if (
    intent === "Story Guidance" &&
    /\b(final boss|ending|true ending|bad ending|who dies|death|killer|traitor|identity|what happens at the end)\b/i.test(
      question,
    )
  ) {
    return true;
  }
  if (
    intent === "Social Links" &&
    /\b(who|which|whose|arcana|social link|s-?link|start|unlock|available|availability|schedule|rank|date)\b/i.test(
      question,
    )
  ) {
    return true;
  }

  const exactMechanic =
    /\b(weak(?:ness| to)?|resist(?:ance|s)?|null(?:ifies)?|drain(?:s)?|repel(?:s)?|fusion|fuse|recipe|skill effect|what level|which level|what floor|which floor|what date|which date|deadline|reward|unlock|cost|price|boss mechanic|drop rate|weapon|armor|equipment|accessor(?:y|ies)|item effect|base stat|stat cap|location|obtain|acquire)\b/i;
  const acquisitionQuestion =
    /\b(?:where|how)\b.{0,30}\b(?:get|find|buy|obtain|acquire|unlock)\b/i.test(question);
  const namedSkillQuestion =
    /\bwhat does\b.{1,60}\bdo\b/i.test(question) ||
    /\b(?:what does|how does)\b.{1,60}\b(?:skill|spell|theurgy|passive)\b/i.test(question);
  return exactMechanic.test(question) || acquisitionQuestion || namedSkillQuestion;
}

export function assessGrounding(input: GroundingInput): GroundingAssessment {
  if (!input.requiresExactEvidence) {
    return {
      status: "partial",
      confidenceCeiling: 0.72,
      notes: ["The request allows principle-based coaching."],
    };
  }

  if (input.matchingFactConfidences.length) {
    const strongestFact = Math.max(...input.matchingFactConfidences);
    return {
      status: "verified",
      confidenceCeiling: Math.max(0.55, Math.min(0.95, strongestFact)),
      notes: ["A subject-matched structured fact supports the exact claim."],
    };
  }

  if (input.matchingChunkSimilarities.length) {
    const strongestChunk = Math.max(...input.matchingChunkSimilarities);
    return {
      status: "partial",
      confidenceCeiling: Math.max(0.45, Math.min(0.68, strongestChunk || 0.58)),
      notes: ["A subject-matched guide excerpt supports a cautious answer."],
    };
  }

  return {
    status: "insufficient",
    confidenceCeiling: 0.35,
    notes: ["No subject-matched fact or guide excerpt supports an exact claim."],
  };
}

export function exactDetailPrompt(intent: string): string {
  if (intent === "Enemy Weakness") {
    return "Tell me the exact Shadow name and its Tartarus block or floor.";
  }
  if (intent === "Fusion Advice") {
    return "Tell me the exact Persona name or the ingredients you are trying to fuse.";
  }
  if (intent === "Boss Help") {
    return "Tell me the exact boss or Full Moon operation and your current level.";
  }
  if (intent === "Social Links") {
    return "Tell me the Social Link name, rank, and in-game date.";
  }
  if (intent === "Quest Help") {
    return "Tell me the request number or exact request name.";
  }
  return "Give me the exact enemy, Persona, floor, date, item, or mechanic you want confirmed.";
}
