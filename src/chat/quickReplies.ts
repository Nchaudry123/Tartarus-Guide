import type { PlayerProfile } from "../../lib/types";
import { buildMonthPlan } from "../quality/monthPlanning";

/**
 * Instant replies for pure greetings, thanks, acknowledgements and goodbyes. These need no
 * model or lookup, and sending them through the LLM made a plain "hi" take 2-4 seconds.
 * Anything with more content than a pleasantry ("hi, how do I beat Priestess") is not matched
 * and still goes through the full chat path.
 */
export type QuickReplyKind = "greeting" | "thanks" | "ack" | "bye";

export type QuickReply = {
  kind: QuickReplyKind;
  answer: string;
  suggestedPrompts: string[];
};

const patterns: Array<[QuickReplyKind, RegExp]> = [
  ["greeting", /^(?:hi+|hey+|hello+|heya|hiya|yo+|sup|wassup|what'?s up|howdy|good (?:morning|afternoon|evening)|hi there|hey there|hello there)(?:\s+(?:there|again|guide|navigator|sees|buddy|friend|man|dude|bro))?$/],
  ["thanks", /^(?:thanks?(?: a lot| so much| again| man| dude| bro)?|thank you(?: so much| again)?|thx|ty(?:sm)?|tysm|appreciate it|much appreciated|cheers)$/],
  ["ack", /^(?:ok(?:ay)?|k+|kk|cool|nice|great|got it|gotcha|alright|sounds good|perfect|bet|word|noted|makes sense)$/],
  ["bye", /^(?:bye+|goodbye|good night|gn|night|see ya|see you|cya|later|ttyl|peace)(?:\s+(?:for now|guide|navigator))?$/],
];

export function quickReplyKind(message: string): QuickReplyKind | null {
  const text = message
    .toLowerCase()
    .trim()
    .replace(/[!?.~,]+$/g, "")
    .replace(/[!?.~]+/g, "")
    .replace(/\s+/g, " ");
  if (!text || text.length > 40) return null;
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function pick<T>(options: T[], random: () => number): T {
  return options[Math.floor(random() * options.length) % options.length];
}

function situationLine(profile: PlayerProfile): string | null {
  const plan = buildMonthPlan(profile);
  if (plan?.nextFullMoon && plan.nextFullMoon.daysAway <= 7) {
    const days = plan.nextFullMoon.daysAway;
    return days === 0
      ? "Full moon tonight, so let's make sure you're ready."
      : `${days} day${days === 1 ? "" : "s"} until the ${plan.nextFullMoon.date} full moon.`;
  }
  // Otherwise stay out of the way: one question per reply, and the opener already asks it.
  return null;
}

function followUpChips(profile: PlayerProfile): string[] {
  const plan = buildMonthPlan(profile);
  const chips = [
    profile.currentDate || profile.currentMonth ? "What should I do today?" : "I'm stuck in Tartarus",
    plan?.nextFullMoon ? `How do I prep for the ${plan.nextFullMoon.date} full moon?` : "Help me fuse a Persona",
    "Which Social Links should I focus on?",
  ];
  return [...new Set(chips)];
}

export function quickReply(
  message: string,
  profile: PlayerProfile = {},
  random: () => number = Math.random,
): QuickReply | null {
  const kind = quickReplyKind(message);
  if (!kind) return null;
  const situation = situationLine(profile);

  if (kind === "greeting") {
    const opener = pick(["Hey!", "Hey there!", "Yo!", "Welcome back!"], random);
    const prompt = pick(
      [
        "What are we tackling tonight?",
        "What's on the agenda before the Dark Hour?",
        "Tartarus, fusions, or planning your day?",
        "What can I help you with?",
      ],
      random,
    );
    return {
      kind,
      answer: [opener, situation, prompt].filter(Boolean).join(" "),
      suggestedPrompts: followUpChips(profile),
    };
  }
  if (kind === "thanks") {
    return {
      kind,
      answer: pick(
        [
          "Anytime! Shout if anything else comes up.",
          "Happy to help. Good luck out there!",
          "No problem. Go show Tartarus who's boss.",
          "Glad that helped. I'm here when you need me.",
        ],
        random,
      ),
      suggestedPrompts: followUpChips(profile),
    };
  }
  if (kind === "ack") {
    return {
      kind,
      answer: pick(
        ["Got it. What's next?", "Cool. Anything else you want to check?", "Nice. Want to keep going?"],
        random,
      ),
      suggestedPrompts: followUpChips(profile),
    };
  }
  return {
    kind,
    answer: pick(
      [
        "See you after the Dark Hour!",
        "Good luck out there. Memento mori!",
        "Catch you later. Don't forget to save!",
      ],
      random,
    ),
    suggestedPrompts: [],
  };
}
