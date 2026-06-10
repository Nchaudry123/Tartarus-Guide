export type SpoilerPreference = "strict" | "progress-aware" | "open";

export type SpoilerDecision = {
  allow: boolean;
  mode: SpoilerPreference;
  message?: string;
  followUp?: string;
  promptInstruction: string;
};

type SpoilerInput = {
  question: string;
  intent: string;
  preference?: SpoilerPreference;
  currentMonth?: string;
};

export function hasExplicitSpoilerPermission(question: string): boolean {
  return /\b(spoilers? (?:are|is) fine|spoil(?:er)? me|tell me the spoiler|full spoilers?(?: are fine)?|i (?:do not|don't) mind spoilers|give me spoilers)\b/i.test(
    question,
  );
}

function asksForMajorSpoiler(question: string): boolean {
  return /\b(ending|final boss|true ending|bad ending|who dies|does .+ die|death|killer|traitor|identity|what happens at the end)\b/i.test(
    question,
  );
}

export function evaluateSpoilerPolicy(input: SpoilerInput): SpoilerDecision {
  const mode = input.preference ?? "strict";
  if (input.intent !== "Story Guidance") {
    return {
      allow: true,
      mode,
      promptInstruction: "Avoid volunteering story spoilers that are not needed for the gameplay answer.",
    };
  }

  if (mode === "open" || hasExplicitSpoilerPermission(input.question)) {
    return {
      allow: true,
      mode,
      promptInstruction: "The player permits spoilers for this answer. Still reveal only what directly answers the question.",
    };
  }

  if (mode === "strict") {
    return {
      allow: false,
      mode,
      message: "I’ll keep that spoiler-free. I can give you the gameplay consequence or a gentle hint instead.",
      followUp: "Do you want a spoiler-free hint, or do you want to allow spoilers for this question?",
      promptInstruction: "Do not reveal story events, identities, deaths, endings, or future bosses.",
    };
  }

  if (!input.currentMonth) {
    return {
      allow: false,
      mode,
      message: "I can keep the answer aligned with your progress, but I need your current in-game month first.",
      followUp: "What month are you currently in?",
      promptInstruction: "Do not reveal story details until player progress is known.",
    };
  }

  if (asksForMajorSpoiler(input.question)) {
    return {
      allow: false,
      mode,
      message: `You’re in ${input.currentMonth}, and that answer reaches beyond normal progress-safe guidance. I can give you a spoiler-free hint instead.`,
      followUp: "Do you want the spoiler-free hint, or full spoilers for this question?",
      promptInstruction: `Do not reveal major story events beyond the player's stated progress in ${input.currentMonth}.`,
    };
  }

  return {
    allow: true,
    mode,
    promptInstruction: `Keep story details at or before the player's stated progress in ${input.currentMonth}. Do not reveal later events.`,
  };
}
