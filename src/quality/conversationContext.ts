export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ConversationContext = {
  analysisQuestion: string;
  previousTopic?: string;
  previousAssistant?: string;
  activeThread: ConversationMessage[];
  shortReply: boolean;
};

const referentialReplyPattern =
  /\b(?:it|that|those|them|this|these|either|neither|both|the first|the second|the other|other options?|different routes?|none of those|same one|previous answer|that one|which one|what about|how about)\b/i;
const previousAnswerReferencePattern =
  /\b(?:it|that|those|them|this|these|either|neither|both|the first|the second|the other|same one|that one|which one|previous answer|your answer|you said|you mentioned|wrong|incorrect|not correct|why is|why would|explain)\b/i;

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isExplicitStandaloneQuestion(value: string): boolean {
  const text = value.trim();
  return (
    /^(?:how|what|which|where|when|who|why|can you|could you|would you|should i|is there|are there|does|do)\b/i.test(
      text,
    ) &&
    text.includes("?") &&
    !referentialReplyPattern.test(text)
  );
}

function fusionResultTarget(previousAssistant: string | undefined): string | null {
  if (!previousAssistant) return null;
  return (
    previousAssistant.match(/\bfuse\s+.+?\s+to\s+make\s+([A-Z][A-Za-z0-9' -]{1,36})\b/i)?.[1]?.trim() ??
    previousAssistant.match(/\btwo routes to\s+([A-Z][A-Za-z0-9' -]{1,36})\b/i)?.[1]?.trim() ??
    null
  );
}

function isFusionSkillFollowUp(
  question: string,
  previousAssistant: string | undefined,
): boolean {
  return (
    /\b(?:what|which)\s+skills?\s+(?:should|do|can)\s+i\s+(?:keep|inherit|choose|carry)\b/i.test(
      question,
    ) && Boolean(fusionResultTarget(previousAssistant))
  );
}

function isRecommendationFollowUp(
  question: string,
  previousAssistant: string | undefined,
): boolean {
  if (!previousAssistant) return false;
  if (
    !/\b(?:recommend|recommendation|pick|option|alternative|next move|persona|party|build)\b/i.test(
      previousAssistant,
    )
  ) {
    return false;
  }
  return /\b(?:why\s+(?:this|that)\s+pick|show\s+(?:a\s+)?(?:safer|another|different)\s+option|what\s+level\s+do\s+i\s+need|why\s+should\s+i\s+choose|what\s+about\s+(?:the\s+)?(?:alternative|other))\b/i.test(
    question,
  );
}

export function isShortContextReply(question: string): boolean {
  const text = question.toLowerCase().trim().replace(/[.!?]+$/g, "");
  const count = wordCount(text);
  return (
    (count <= 5 &&
      (/^(yes|yeah|yep|sure|okay|ok|no|nope|nah|not really|kind of|sort of|maybe|i do|i don't|i dont|boss|fusion|persona|tartarus|social links?|party|team|no persona dlc|base game only|i have all persona dlc|all persona dlc|what is it|what are they|which one|who is it|tell me about it|how do i fuse it|this is wrong|that's wrong|thats wrong|incorrect|not correct|that is incorrect)$/.test(
        text,
      ) ||
        /^(what about|how about|and|but)\b/.test(text))) ||
    (count <= 12 &&
      /^i\s+(?:(?:do not|don't|dont|can't|cant|cannot|haven't|havent)\s+have|have|unlocked|didn't unlock|didnt unlock|use|am|keep|want|need|prefer)\b/.test(
        text,
      ))
  );
}

function assistantInvitesReply(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("?") ||
    /\b(?:tell me|share|choose|pick|select|do you have|are you|which one|what is|what are|send me|let me know)\b/i.test(
      message,
    )
  );
}

export function isContextualConversationReply(
  question: string,
  previousAssistant: string | undefined,
): boolean {
  if (isFusionSkillFollowUp(question, previousAssistant)) return true;
  if (isRecommendationFollowUp(question, previousAssistant)) return true;
  if (isShortContextReply(question)) return true;
  const normalized = question.trim();
  // Pronouns like "these/this/that" only attach to a prior assistant turn.
  // Without one, "how do i craft these" is a vague new ask — not a follow-up.
  if (referentialReplyPattern.test(normalized)) {
    return Boolean(previousAssistant?.trim());
  }
  if (isExplicitStandaloneQuestion(normalized)) return false;
  return assistantInvitesReply(previousAssistant) && wordCount(normalized) <= 90;
}

function resolveFusionRouteReference(
  question: string,
  previousAssistant: string | undefined,
): string {
  const ordinal = question.match(/\b(first|second)\s+(?:pair|route|one)\b/i)?.[1]?.toLowerCase();
  if (!ordinal || !previousAssistant) return question;
  const routes = previousAssistant.match(
    /\btwo routes to\s+.+?(?:\s+are|:)\s+(.+?)\s+or\s+(.+?)\.\s*do you have either pair/i,
  );
  const selected = ordinal === "first" ? routes?.[1] : routes?.[2];
  return selected ? `I have ${selected.replace(/\s*\+\s*/g, " and ")}` : question;
}

function resolveFusionSkillReference(
  question: string,
  previousAssistant: string | undefined,
): string {
  if (!isFusionSkillFollowUp(question, previousAssistant)) return question;
  const target = fusionResultTarget(previousAssistant);
  return target ? `What skills should I keep for ${target} after fusing it?` : question;
}

function dlcModeReply(question: string): "none" | "all" | null {
  if (
    /\b(?:no|without|don't have|dont have|do not have)\s+(?:any\s+)?(?:persona\s+)?dlc\b/i.test(
      question,
    ) ||
    /\bbase game only\b/i.test(question)
  ) {
    return "none";
  }
  if (/\b(?:have|use|own)\s+all\s+(?:persona\s+)?dlc\b|\ball persona dlc\b/i.test(question)) {
    return "all";
  }
  return null;
}

export function normalizeConversationHistory(
  question: string,
  history: ConversationMessage[] = [],
  limit = 24,
): ConversationMessage[] {
  const normalized = history
    .filter(
      (message): message is ConversationMessage =>
        Boolean(message?.content?.trim()) &&
        (message.role === "user" || message.role === "assistant"),
    )
    .slice(-limit);
  const last = normalized.at(-1);
  if (
    last?.role === "user" &&
    last.content.trim().toLowerCase() === question.trim().toLowerCase()
  ) {
    normalized.pop();
  }
  return normalized;
}

function findPreviousIndex(
  history: ConversationMessage[],
  before: number,
  role: ConversationMessage["role"],
): number {
  for (let index = before - 1; index >= 0; index -= 1) {
    if (history[index].role === role) return index;
  }
  return -1;
}

function activeThreadStart(history: ConversationMessage[]): number {
  let assistantIndex = findPreviousIndex(history, history.length, "assistant");
  if (assistantIndex < 0) return Math.max(0, history.length - 1);
  let userIndex = findPreviousIndex(history, assistantIndex, "user");
  if (userIndex < 0) return assistantIndex;
  let start = userIndex;

  while (userIndex >= 0) {
    const priorAssistantIndex = findPreviousIndex(history, userIndex, "assistant");
    if (priorAssistantIndex < 0) break;
    if (!isContextualConversationReply(history[userIndex].content, history[priorAssistantIndex].content)) {
      break;
    }
    const priorUserIndex = findPreviousIndex(history, priorAssistantIndex, "user");
    if (priorUserIndex < 0) {
      start = priorAssistantIndex;
      break;
    }
    start = priorUserIndex;
    userIndex = priorUserIndex;
  }

  return start;
}

function compactContext(value: string, maxLength = 900): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3).trim()}...`
    : normalized;
}

function formatUserThread(
  thread: ConversationMessage[],
  currentReply: string,
  previousAssistant: string | undefined,
): string {
  const userTurns = thread
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const [initialRequest, ...details] = userTurns;
  if (!initialRequest) return currentReply;
  return [
    `The user's active conversation goal is: ${initialRequest}`,
    ...details.map((detail) => `Additional detail from the user: ${detail}`),
    previousAssistant && previousAnswerReferencePattern.test(currentReply)
      ? `The previous assistant reply being referenced is: ${compactContext(previousAssistant)}`
      : undefined,
    `The user's latest follow-up is: ${currentReply}`,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function resolveConversationContext(
  question: string,
  history: ConversationMessage[],
): ConversationContext {
  const previousAssistant = [...history]
    .reverse()
    .find((message) => message.role === "assistant")?.content;
  const shortReply = isContextualConversationReply(question, previousAssistant);
  if (!shortReply) {
    return {
      analysisQuestion: question,
      previousAssistant,
      activeThread: [],
      shortReply: false,
    };
  }

  const start = activeThreadStart(history);
  const activeThread = history.slice(start);
  const previousTopic = activeThread.find((message) => message.role === "user")?.content;
  if (!previousTopic) {
    return {
      analysisQuestion: question,
      previousAssistant,
      activeThread,
      shortReply: true,
    };
  }

  const resolvedReply = resolveFusionSkillReference(
    resolveFusionRouteReference(question, previousAssistant),
    previousAssistant,
  );
  const dlcMode = dlcModeReply(resolvedReply);
  return {
    analysisQuestion:
      dlcMode && /\b(?:fuse|fusion|recipe|make|create)\b/i.test(previousTopic)
        ? `${previousTopic}\n${dlcMode === "none" ? "No Persona DLC; use the base-game fusion chart." : "I have all Persona DLC enabled."}`
        : formatUserThread(activeThread, resolvedReply, previousAssistant),
    previousTopic,
    previousAssistant,
    activeThread,
    shortReply: true,
  };
}
