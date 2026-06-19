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
  if (isShortContextReply(question)) return true;
  const normalized = question.trim();
  if (referentialReplyPattern.test(normalized)) return true;
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
    /\btwo routes to\s+.+?\s+are\s+(.+?)\s+or\s+(.+?)\.\s*do you have either pair/i,
  );
  const selected = ordinal === "first" ? routes?.[1] : routes?.[2];
  return selected ? `I have ${selected.replace(/\s*\+\s*/g, " and ")}` : question;
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

function formatUserThread(thread: ConversationMessage[], currentReply: string): string {
  const userTurns = thread
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const [initialRequest, ...details] = userTurns;
  if (!initialRequest) return currentReply;
  return [
    `The user's active request is: ${initialRequest}`,
    ...details.map((detail) => `Additional detail from the user: ${detail}`),
    `The user's latest follow-up is: ${currentReply}`,
  ].join("\n");
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

  const resolvedReply = resolveFusionRouteReference(question, previousAssistant);
  return {
    analysisQuestion: formatUserThread(activeThread, resolvedReply),
    previousTopic,
    previousAssistant,
    activeThread,
    shortReply: true,
  };
}
