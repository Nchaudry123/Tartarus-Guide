import { NextResponse } from "next/server";
import type { ChatRequest, ChatResponse, PlayerProfile } from "../../../lib/types";
import {
  assessGrounding,
  exactDetailPrompt,
  requiresExactGameEvidence,
} from "../../../src/quality/grounding";
import { evaluateSpoilerPolicy } from "../../../src/quality/spoilers";

export const runtime = "nodejs";

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const allowOrigin =
    allowedOrigins.includes("*") || !origin
      ? "*"
      : allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0] ?? "*";

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin",
  };
}

const mockSources = [
  {
    title: "Persona 3 Reload Wiki Guide",
    url: "https://www.ign.com/wikis/persona-3-reload/",
    domain: "ign.com",
  },
];

type CompanionIntent =
  | "Enemy Weakness"
  | "Boss Help"
  | "Team Building"
  | "Fusion Advice"
  | "Social Links"
  | "Daily Schedule Planning"
  | "Tartarus Navigation"
  | "Quest Help"
  | "Story Guidance"
  | "Achievement Hunting"
  | "General Discussion";

type CompanionAnalysis = {
  intent: CompanionIntent;
  retrievalQuery: string;
  isAmbiguous: boolean;
  followUpQuestions: string[];
  profileUpdates: PlayerProfile;
  profile: PlayerProfile;
  spoilerCaution: boolean;
};

type ControllerAction =
  | "answer_directly"
  | "ask_clarifying_question"
  | "search_guides"
  | "search_structured_facts"
  | "search_both";

type ControllerDecision = {
  action: ControllerAction;
  intent: CompanionIntent;
  retrievalQuery: string;
  retrievalQueries: string[];
  answer: string | null;
  followUpQuestions: string[];
  profileUpdates: PlayerProfile;
  suggestedPrompts: string[];
  spoilerCaution: boolean;
};

const partyMembers = ["Yukari", "Junpei", "Akihiko", "Mitsuru", "Aigis", "Koromaru", "Ken", "Shinjiro", "Fuuka"];

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function detectIntent(question: string): CompanionIntent {
  const text = question.toLowerCase();
  if (/\b(story|spoiler|plot|ending|final boss|character dies|what happens)\b/.test(text)) return "Story Guidance";
  if (/\b(team feels weak|party feels weak|my team is weak|my party is weak|underleveled|under-leveled|team|party|build|members|composition|gear|equipment)\b/.test(text)) return "Team Building";
  if (/\b(weak to|weakness|weaknesses|resist|resists|resistance|null|drain|repel)\b/.test(text)) return "Enemy Weakness";
  if (/\b(social link|s-link|romance|hang out|confidant)\b/.test(text)) return "Social Links";
  if (/\btartarus\b/.test(text) && /\b(climb|floor|block|how far|how high|route|explore|grind|border)\b/.test(text)) return "Tartarus Navigation";
  if (/\b(boss|priestess|emperor|empress|hierophant|lovers|chariot|justice|hermit|fortune|strength|hanged|nyx|full moon)\b/.test(text)) return "Boss Help";
  if (/\b(level|lvl)\s*\d{1,3}\b|\b\d{1,3}\s*(level|lvl)\b/.test(text)) return "Team Building";
  if (
    /\b(fusion|fuse|persona|skill inherit|inheritance|recipe|special fusion|compendium)\b/.test(text) ||
    /\b(worth (?:getting|fusing|using)|good to (?:get|fuse|use)|should i (?:get|fuse|use)|is .{1,40} (?:good|worth it|viable)|best (?:magic|physical|support|healing) option)\b/.test(text)
  ) {
    return "Fusion Advice";
  }
  if (/\b(today|schedule|calendar|month|night|after school|free evening|free evenings|free time|daily plan|use my time)\b/.test(text)) return "Daily Schedule Planning";
  if (/\b(rank)\b/.test(text)) return "Social Links";
  if (/\b(day|date)\b/.test(text)) return "Daily Schedule Planning";
  if (/\b(tartarus|floor|block|gatekeeper|border|explore|grind|shadows)\b/.test(text)) return "Tartarus Navigation";
  if (/\b(request|elizabeth|missing person|quest|deadline)\b/.test(text)) return "Quest Help";
  if (/\b(achievement|trophy|platinum|completion|complete|100%)\b/.test(text)) return "Achievement Hunting";
  return "General Discussion";
}

function isShortContextReply(question: string): boolean {
  const text = question.toLowerCase().trim().replace(/[.!?]+$/g, "");
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return (
    wordCount <= 5 &&
    (/^(yes|yeah|yep|sure|okay|ok|no|nope|nah|not really|kind of|sort of|maybe|i do|i don't|i dont|boss|fusion|persona|tartarus|social links?|party|team)$/.test(
      text,
    ) ||
      /^(what about|how about|and|but)\b/.test(text))
  );
}

function normalizeConversationHistory(
  question: string,
  history: ChatRequest["history"] = [],
): NonNullable<ChatRequest["history"]> {
  const normalized = (history ?? [])
    .filter(
      (message): message is NonNullable<ChatRequest["history"]>[number] =>
        Boolean(message?.content?.trim()) && (message.role === "user" || message.role === "assistant"),
    )
    .slice(-10);
  const last = normalized.at(-1);
  if (
    last?.role === "user" &&
    last.content.trim().toLowerCase() === question.trim().toLowerCase()
  ) {
    normalized.pop();
  }
  return normalized;
}

function contextualizeQuestion(
  question: string,
  history: NonNullable<ChatRequest["history"]>,
): {
  analysisQuestion: string;
  previousTopic?: string;
  previousAssistant?: string;
  shortReply: boolean;
} {
  const shortReply = isShortContextReply(question);
  if (!shortReply) return { analysisQuestion: question, shortReply: false };

  const previousAssistant = [...history]
    .reverse()
    .find((message) => message.role === "assistant")?.content;
  const previousTopic = [...history]
    .reverse()
    .find(
      (message) =>
        message.role === "user" &&
        !isShortContextReply(message.content) &&
        message.content.trim().toLowerCase() !== question.trim().toLowerCase(),
    )?.content;

  if (!previousTopic) return { analysisQuestion: question, shortReply: true };
  const isBareAnswer = /^(yes|yeah|yep|sure|okay|ok|no|nope|nah|not really|maybe)$/i.test(
    question.trim().replace(/[.!?]+$/g, ""),
  );
  return {
    analysisQuestion: isBareAnswer
      ? previousTopic
      : `${previousTopic}\nThe user's follow-up request is: ${question}`,
    previousTopic,
    previousAssistant,
    shortReply: true,
  };
}

function rejectedClarificationResponse(
  question: string,
  conversation: ReturnType<typeof contextualizeQuestion>,
  analysis: CompanionAnalysis,
): ChatResponse | null {
  const negative = /^(no|nope|nah|not really)$/i.test(
    question.trim().replace(/[.!?]+$/g, ""),
  );
  if (!negative || !conversation.previousAssistant) return null;

  const previous = conversation.previousAssistant.toLowerCase();
  let answer: string | null = null;
  let suggestedPrompts: string[] = [];

  if (/\bwhat level\b|\bactive team\b|\bactive party\b/.test(previous)) {
    answer =
      "No problem—we can keep it general. What feels weakest right now: damage, survivability, or running out of SP?";
    suggestedPrompts = ["Our damage is low", "We keep getting knocked out", "We run out of SP"];
  } else if (/\bmonth\b|\bdate\b|\bwhat day\b/.test(previous)) {
    answer =
      "That’s fine. Tell me the activity or decision you’re weighing, and I’ll give you a spoiler-safe rule of thumb without needing the exact date.";
    suggestedPrompts = ["I need a Social Link priority", "I need a Tartarus routine"];
  } else if (/\bwhich boss\b|\bgatekeeper\b/.test(previous)) {
    answer =
      "All right. Describe what’s happening in the fight—big damage, status effects, adds, or an attack you can’t survive—and we’ll diagnose it from there.";
    suggestedPrompts = ["We keep getting wiped", "A status effect is stopping us"];
  } else if (/\bspoiler\b/.test(previous)) {
    answer =
      "Understood. I’ll keep it spoiler-free. Tell me the gameplay decision you’re trying to make, and I’ll stay on your side of the story.";
    suggestedPrompts = [];
  }

  if (!answer) return null;
  return withMode({
    answer,
    sections: [],
    sources: [],
    confidence: 0.76,
    missingInfo: "A gameplay symptom or goal will help narrow the next recommendation.",
    companion: {
      intent: analysis.intent,
      profileUpdates: analysis.profileUpdates,
      followUpQuestions: [],
      suggestedPrompts,
    },
  }, "rag");
}

function isCasualMessage(question: string): boolean {
  const text = question.toLowerCase().trim().replace(/[.!?]+$/g, "");
  if (/^(hi|hello|hey|yo|sup|what's up|whats up|good morning|good afternoon|good evening)$/.test(text)) return true;
  if (/^(hi|hello|hey|yo)\b(?:\s+(there|again|tartarus|guide|buddy|man|friend))?$/.test(text)) return true;
  if (/^(thanks|thank you|ty|appreciate it|cool|nice|ok|okay|got it)$/.test(text)) return true;
  if (/\b(who are you|what can you do|how do you work|how are you)\b/.test(text)) return true;
  return false;
}

function hasGuideIntent(question: string): boolean {
  return detectIntent(question) !== "General Discussion";
}

function extractProfileUpdates(question: string): PlayerProfile {
  const updates: PlayerProfile = {};
  const monthMatch = question.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  if (monthMatch) updates.currentMonth = monthMatch[1][0].toUpperCase() + monthMatch[1].slice(1).toLowerCase();

  const levelMatch = question.match(/\b(?:level|lvl)\s*(\d{1,3})\b/i) ?? question.match(/\b(\d{1,3})\s*(?:level|lvl)\b/i);
  if (levelMatch) updates.currentLevel = levelMatch[1];

  const difficultyMatch = question.match(/\b(beginner|easy|normal|hard|merciless|peaceful)\b/i);
  if (difficultyMatch) updates.difficulty = difficultyMatch[1][0].toUpperCase() + difficultyMatch[1].slice(1).toLowerCase();

  const activeParty = partyMembers.filter((member) => new RegExp(`\\b${member}\\b`, "i").test(question));
  if (activeParty.length) updates.activeParty = activeParty;

  const playstyleMatch = question.match(/\b(physical|magic|balanced|defensive|aggressive|safe|grind|speedrun)\b/i);
  if (playstyleMatch) updates.playstyle = playstyleMatch[1].toLowerCase();

  const bossMatch = question.match(/\b(Priestess|Emperor|Empress|Hierophant|Lovers|Chariot|Justice|Hermit|Fortune|Strength|Hanged Man|Nyx)\b/i);
  if (bossMatch) updates.recentBoss = bossMatch[1];

  return updates;
}

function mergeProfile(base: PlayerProfile | undefined, updates: PlayerProfile): PlayerProfile {
  return {
    ...(base ?? {}),
    ...updates,
    activeParty: updates.activeParty?.length ? uniqueStrings(updates.activeParty) : base?.activeParty,
    currentSocialLinks: updates.currentSocialLinks?.length ? uniqueStrings(updates.currentSocialLinks) : base?.currentSocialLinks,
  };
}

function analyzeCompanionRequest(question: string, profile?: PlayerProfile): CompanionAnalysis {
  let intent = detectIntent(question);
  const profileUpdates = extractProfileUpdates(question);
  const mergedProfile = mergeProfile(profile, profileUpdates);
  const text = question.toLowerCase().trim();
  if (
    intent === "General Discussion" &&
    mergedProfile.activeParty?.length &&
    /\b(healer|healing|heal|support|damage|survive|survivability|sp|party member)\b/.test(text)
  ) {
    intent = "Team Building";
  }
  const vagueSignals = [
    "i'm stuck",
    "im stuck",
    "stuck",
    "help",
    "my team feels weak",
    "team feels weak",
    "what should i do",
    "what do i do",
    "lost",
    "confused",
  ];
  const isShort = text.split(/\s+/).filter(Boolean).length <= 6;
  const isAmbiguous = vagueSignals.some((signal) => text.includes(signal)) || (intent === "General Discussion" && isShort);
  const followUpQuestions: string[] = [];

  if (intent === "Team Building" && (!mergedProfile.currentLevel || !mergedProfile.activeParty?.length)) {
    followUpQuestions.push("What level are you right now, and who is on your active team?");
  }
  if (intent === "Boss Help" && !mergedProfile.recentBoss && !/\bfull moon\b/i.test(question)) {
    followUpQuestions.push("Which boss or Tartarus gatekeeper are you fighting?");
  }
  if (intent === "Daily Schedule Planning" && !mergedProfile.currentMonth) {
    followUpQuestions.push("What month or date are you currently on?");
  }
  const hasKnownSituation = Boolean(
    mergedProfile.currentLevel ||
      mergedProfile.activeParty?.length ||
      mergedProfile.currentMonth ||
      mergedProfile.recentBoss ||
      mergedProfile.playstyle,
  );
  if (isAmbiguous && followUpQuestions.length === 0 && !hasKnownSituation) {
    followUpQuestions.push("Are you stuck on a boss, party setup, Social Link, request, or Tartarus route?");
  }

  const profileHints = [
    mergedProfile.currentMonth ? `current month: ${mergedProfile.currentMonth}` : undefined,
    mergedProfile.currentLevel ? `player level: ${mergedProfile.currentLevel}` : undefined,
    mergedProfile.difficulty ? `difficulty: ${mergedProfile.difficulty}` : undefined,
    mergedProfile.activeParty?.length ? `active party: ${mergedProfile.activeParty.join(", ")}` : undefined,
    mergedProfile.recentBoss ? `recent boss: ${mergedProfile.recentBoss}` : undefined,
    mergedProfile.playstyle ? `preferred playstyle: ${mergedProfile.playstyle}` : undefined,
    mergedProfile.currentGoal ? `current goal: ${mergedProfile.currentGoal}` : undefined,
  ];

  return {
    intent,
    retrievalQuery: uniqueStrings([question, intent, ...profileHints]).join("\n"),
    isAmbiguous,
    followUpQuestions: followUpQuestions.slice(0, 2),
    profileUpdates,
    profile: mergedProfile,
    spoilerCaution: intent === "Story Guidance" && !mergedProfile.currentMonth,
  };
}

function casualFallbackResponse(question: string, profileUpdates: PlayerProfile = {}): ChatResponse {
  const normalized = question.toLowerCase().trim();
  const isGreeting = /^(hi|hello|hey|yo|sup)\b/.test(normalized);
  const answer = isGreeting
    ? "Hey. I’m here. Tell me what you’re dealing with in Persona 3 Reload and I’ll help you work through it."
    : "I’m here to help with Persona 3 Reload. You can talk naturally, and I’ll ask for details when I need them instead of making you know exact guide keywords.";

  return withMode({
    answer,
    sections: [],
    sources: [],
    confidence: 0.75,
    missingInfo: "Tell me your current date, level, party, boss, floor, or goal whenever you want more specific advice.",
    companion: {
      intent: "General Discussion",
      profileUpdates,
      followUpQuestions: [],
      suggestedPrompts: [],
    },
  }, "rag");
}

async function casualChatResponse(
  question: string,
  playerProfile?: PlayerProfile,
  history: ChatRequest["history"] = [],
): Promise<ChatResponse> {
  const { createChatCompletion } = await import("../../../src/db/client");
  const profileUpdates = extractProfileUpdates(question);
  const profile = mergeProfile(playerProfile, profileUpdates);
  const historyForPrompt = (history ?? [])
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  const systemPrompt = `You are SEES Navigator, the conversational voice of Tartarus Guide and a friendly Persona 3 Reload expert companion.

Return only JSON:
{
  "answer": "string",
  "sections": [{"title": "string", "content": "string"}],
  "confidence": 0.0,
  "missingInfo": "string"
}

Rules:
- Act like a normal chat assistant first. Greetings should receive a friendly greeting, not a guide answer.
- Your personality is calm, tactically sharp, encouraging, and lightly witty. Sound human, never theatrical or robotic.
- Do not force retrieval, sources, boss strategy, or wiki-style content for casual chat.
- If the user is starting a conversation, invite them to describe their current Persona 3 Reload situation.
- If they ask what you can do, explain that you can help with bosses, weaknesses, party building, fusion, Social Links, requests, Tartarus, and schedule planning.
- Do not use emoji.
- Keep it concise, natural, and conversational. Prefer 2-5 short sentences. Ask one useful follow-up only when needed.`;

  const userPrompt = `User message: ${question}
Known player profile: ${JSON.stringify(profile)}
Recent conversation:
${historyForPrompt || "No prior turns."}

Answer naturally like a chat assistant, not a report.`;

  try {
    const rawAnswer = await createChatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { jsonObject: true },
    ).catch(() =>
      createChatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]),
    );

    const normalized = normalizeRagResponse(extractJson(rawAnswer), [], {
      intent: "General Discussion",
      profileUpdates,
      followUpQuestions: [],
      suggestedPrompts: [],
    });
    return withMode({ ...normalized, sources: [] }, "rag");
  } catch (error) {
    console.error(error);
    return casualFallbackResponse(question, profileUpdates);
  }
}

function companionClarificationResponse(question: string, analysis: CompanionAnalysis): ChatResponse {
  if (!analysis.followUpQuestions.length && analysis.intent === "Team Building") {
    const profile = analysis.profile;
    const levelLine = profile.currentLevel ? `At level ${profile.currentLevel}` : "At your current level";
    const partyLine = profile.activeParty?.length ? ` with ${profile.activeParty.join(", ")}` : "";
    const difficultyLine = profile.difficulty ? ` on ${profile.difficulty}` : "";

    return withMode({
      answer:
        `${levelLine}${partyLine}${difficultyLine}, I would treat this as a balance check rather than a grind alarm. Your next move is to make sure your active Personas cover healing, one strong physical option, and at least two elements your party does not naturally cover.`,
      sections: [
        {
          title: "Party Read",
          content:
            profile.activeParty?.length
              ? `Keep ${profile.activeParty[0]} anchored to their strongest role, then use your protagonist to patch whatever the group is missing instead of duplicating the same element.`
              : "Use the protagonist as your flexible slot: one healer/support Persona, one physical attacker, and one elemental coverage Persona.",
        },
        {
          title: "Next Upgrade",
          content:
            "Fuse closer to your level, check armor before weapons if you are dying quickly, and carry SP recovery before long Tartarus pushes. If the issue is a specific boss, tell me the name and I will switch into a turn-by-turn plan.",
        },
      ],
      sources: [],
      confidence: 0.5,
      missingInfo: "Tell me the boss, floor, or enemy giving you trouble and I can make this more exact.",
      companion: {
        intent: analysis.intent,
        profileUpdates: analysis.profileUpdates,
        followUpQuestions: ["Which enemy or boss is making the party feel weak?"],
        suggestedPrompts: [
          "I'm stuck on a Tartarus gatekeeper",
          "My party is taking too much damage",
          "What Persona should I fuse at my level?",
        ],
      },
    }, "rag");
  }

  const primaryQuestion = analysis.followUpQuestions[0] ?? "What part of Persona 3 Reload are you working on right now?";
  return withMode({
    answer:
      "I can help, but I need one quick read on your situation first. In the meantime, treat this like triage: check whether the problem is damage, survivability, SP economy, or turn order.",
    sections: [
      {
        title: "Quick Check",
        content: primaryQuestion,
      },
      {
        title: "Immediate Move",
        content:
          analysis.intent === "Team Building"
            ? "If the party feels weak, upgrade weapons/armor, bring one healer, keep coverage for physical plus elemental damage, and fuse Personas near your level instead of relying on old favorites."
            : "Tell me the exact bottleneck and I will narrow it into a practical plan without spoiling later-game events.",
      },
    ],
    sources: [],
    confidence: 0.45,
    missingInfo: analysis.followUpQuestions.join(" "),
    companion: {
      intent: analysis.intent,
      profileUpdates: analysis.profileUpdates,
      followUpQuestions: analysis.followUpQuestions,
      suggestedPrompts: [
        "My party is Yukari, Akihiko, and Mitsuru",
        "I'm level 28 on Normal",
        "I'm stuck on the next full moon boss",
      ],
    },
  }, "rag");
}

function withMode(response: ChatResponse, retrievalMode: NonNullable<ChatResponse["retrievalMode"]>): ChatResponse {
  return { ...response, retrievalMode };
}

function mockResponse(question: string): ChatResponse {
  const normalized = question.toLowerCase();

  if (normalized.includes("dancing hand") || normalized.includes("weak")) {
    return {
      answer:
        "The live guide layer is not active in this preview, so treat this as a mock answer. Once the guide index is loaded, this card will check exact weakness facts first, then confirm with trusted guide notes.",
      sections: [
        {
          title: "Battle Read",
          content:
            "Ask for an enemy by name and the real backend will return weakness, resistances, location notes, and a short practical opener.",
        },
        {
          title: "Player Advice",
          content:
            "Use the source-backed weakness to knock the shadow down, then chain All-Out Attacks or conserve SP if the floor route is long.",
        },
      ],
      tables: [
        {
          title: "Weakness Preview",
          columns: ["Enemy", "Weakness", "Source State"],
          rows: [["Dancing Hand", "Connect live guide mode to confirm", "Mock preview"]],
        },
      ],
      sources: mockSources,
      confidence: 0.42,
      missingInfo: "Live guide facts are not connected in this preview.",
    };
  }

  if (normalized.includes("priestess") || normalized.includes("boss")) {
    return {
      answer:
        "For boss questions, the live system will prioritize structured strategy facts and then supporting guide chunks. In preview mode, here is the intended answer shape.",
      sections: [
        {
          title: "Strategy Flow",
          content:
            "Identify the boss, pull supported mechanics, call out dangerous turns, then give a short step plan with any uncertainty marked clearly.",
        },
        {
          title: "Party Check",
          content:
            "Recommended party cards only appear when the source directly supports them or when the response labels the recommendation as uncertain.",
        },
      ],
      sources: mockSources,
      confidence: 0.45,
      missingInfo: "Live boss facts are not active in this preview.",
    };
  }

  if (normalized.includes("fusion") || normalized.includes("jack frost")) {
    return {
      answer:
        "Fusion help is wired as a first-class response type. The live guide should avoid guessing recipes unless a trusted fusion fact is available.",
      sections: [
        {
          title: "Fusion Rule",
          content:
            "Exact recipes, skill inheritance, and unlock conditions should come from structured facts. If the guide index is missing them, the answer should say so.",
        },
      ],
      sources: mockSources,
      confidence: 0.4,
      missingInfo: "Connect the RAG backend for exact Persona fusion recipes.",
    };
  }

  return {
    answer:
      "This is the frontend preview for Tartarus Guide. The interface is ready for natural Persona 3 Reload questions; connect the real RAG backend to replace this mock response.",
    sections: [
      {
        title: "What Works Now",
        content:
          "The chat UI, suggested prompts, loading state, source display, quick menu, and mock API response format are all in place.",
      },
      {
        title: "Next Connection",
        content:
          "Point `/api/chat` at the Supabase retrieval pipeline or an external backend endpoint that returns answer sections, tables, sources, confidence, and missing info.",
      },
    ],
    sources: mockSources,
    confidence: 0.5,
    missingInfo: "Live retrieval is not enabled yet.",
  };
}

function hasDirectRagEnv(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.EMBEDDING_API_KEY &&
      process.env.CHAT_API_KEY,
  );
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Chat model did not return JSON.");
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown, maxItems = 3): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item))
        .slice(0, maxItems)
    : [];
}

function sanitizeSuggestedPrompts(value: unknown, maxItems = 3): string[] {
  return asStringArray(value, maxItems + 3)
    .filter((prompt) => {
      const normalized = prompt.toLowerCase().trim();
      if (prompt.endsWith("?")) return false;
      if (/^(what|which|where|when|who|how|do you|are you|is your|tell me)\b/.test(normalized)) return false;
      if (/\b(x|y|z|n\/a|unknown|specific boss|specific enemy)\b/i.test(prompt)) return false;
      if (normalized.length < 4 || normalized.length > 80) return false;
      return true;
    })
    .slice(0, maxItems);
}

function sanitizeIntent(value: unknown, fallback: CompanionIntent): CompanionIntent {
  const intents: CompanionIntent[] = [
    "Enemy Weakness",
    "Boss Help",
    "Team Building",
    "Fusion Advice",
    "Social Links",
    "Daily Schedule Planning",
    "Tartarus Navigation",
    "Quest Help",
    "Story Guidance",
    "Achievement Hunting",
    "General Discussion",
  ];
  return intents.includes(value as CompanionIntent) ? (value as CompanionIntent) : fallback;
}

function sanitizeControllerAction(value: unknown, fallback: ControllerAction): ControllerAction {
  const actions: ControllerAction[] = [
    "answer_directly",
    "ask_clarifying_question",
    "search_guides",
    "search_structured_facts",
    "search_both",
  ];
  return actions.includes(value as ControllerAction) ? (value as ControllerAction) : fallback;
}

function normalizeProfileUpdates(value: unknown): PlayerProfile {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const updates: PlayerProfile = {};
  const currentMonth = asString(raw.currentMonth);
  const currentLevel = asString(raw.currentLevel);
  const difficulty = asString(raw.difficulty);
  const recentBoss = asString(raw.recentBoss);
  const playstyle = asString(raw.playstyle);
  const currentGoal = asString(raw.currentGoal);
  const spoilerPreference = asString(raw.spoilerPreference);
  const activeParty = asStringArray(raw.activeParty, 4);
  const currentSocialLinks = asStringArray(raw.currentSocialLinks, 8);

  if (currentMonth) updates.currentMonth = currentMonth;
  if (currentLevel) updates.currentLevel = currentLevel;
  if (difficulty) updates.difficulty = difficulty;
  if (recentBoss) updates.recentBoss = recentBoss;
  if (playstyle) updates.playstyle = playstyle;
  if (currentGoal) updates.currentGoal = currentGoal;
  if (["strict", "progress-aware", "open"].includes(spoilerPreference ?? "")) {
    updates.spoilerPreference = spoilerPreference as PlayerProfile["spoilerPreference"];
  }
  if (activeParty.length) updates.activeParty = activeParty;
  if (currentSocialLinks.length) updates.currentSocialLinks = currentSocialLinks;

  return updates;
}

function normalizeControllerDecision(raw: unknown, fallback: CompanionAnalysis): ControllerDecision {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fallbackAction: ControllerAction =
    fallback.isAmbiguous && fallback.followUpQuestions.length ? "ask_clarifying_question" : "search_both";
  const profileUpdates = mergeProfile(fallback.profileUpdates, normalizeProfileUpdates(value.profileUpdates));

  return {
    action: sanitizeControllerAction(value.action, fallbackAction),
    intent: sanitizeIntent(value.intent, fallback.intent),
    retrievalQuery: asString(value.retrievalQuery) ?? fallback.retrievalQuery,
    retrievalQueries: uniqueStrings([
      ...asStringArray(value.retrievalQueries, 4),
      asString(value.retrievalQuery) ?? fallback.retrievalQuery,
    ]).slice(0, 4),
    answer: asString(value.answer),
    followUpQuestions: asStringArray(value.followUpQuestions, 3),
    profileUpdates,
    suggestedPrompts: sanitizeSuggestedPrompts(value.suggestedPrompts, 3),
    spoilerCaution: typeof value.spoilerCaution === "boolean" ? value.spoilerCaution : fallback.spoilerCaution,
  };
}

function normalizeRagResponse(
  raw: unknown,
  fallbackSources: ChatResponse["sources"],
  companion?: NonNullable<ChatResponse["companion"]>,
): ChatResponse {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawAnswer = asString(value.answer);
  const answer =
    rawAnswer && /^(unknown|unclear|not sure|n\/a)$/i.test(rawAnswer.trim())
      ? "I don’t have a confirmed answer for that yet. Give me the enemy, floor, boss, or date you’re looking at and I’ll narrow it down without guessing."
      : rawAnswer;
  const sections = Array.isArray(value.sections)
    ? value.sections
        .map((section) => {
          const item = section && typeof section === "object" ? (section as Record<string, unknown>) : {};
          const title = asString(item.title);
          const content = asString(item.content);
          return title && content ? { title, content } : null;
        })
        .filter((section): section is { title: string; content: string } => Boolean(section))
    : [];

  const tables = Array.isArray(value.tables)
    ? value.tables
        .map((table) => {
          const item = table && typeof table === "object" ? (table as Record<string, unknown>) : {};
          const title = asString(item.title);
          const columns = Array.isArray(item.columns) ? item.columns.filter((column): column is string => typeof column === "string") : [];
          const rows = Array.isArray(item.rows)
            ? item.rows
                .map((row) => (Array.isArray(row) ? row.filter((cell): cell is string => typeof cell === "string") : []))
                .filter((row) => row.length > 0)
            : [];
          return title && columns.length && rows.length ? { title, columns, rows } : null;
        })
        .filter((table): table is { title: string; columns: string[]; rows: string[][] } => Boolean(table))
    : [];

  const confidence = typeof value.confidence === "number" ? Math.max(0, Math.min(1, value.confidence)) : 0.55;

  return {
    answer: answer ?? "I found related material, but I need one more detail to give a useful answer instead of guessing.",
    sections,
    tables,
    sources: fallbackSources,
    confidence,
    missingInfo: asString(value.missingInfo) ?? "No additional missing information was reported.",
    companion,
  };
}

function responseFromPlainText(
  rawAnswer: string,
  fallbackSources: ChatResponse["sources"],
  companion?: NonNullable<ChatResponse["companion"]>,
): ChatResponse {
  return {
    answer: compactText(rawAnswer, 1800),
    sections: [],
    tables: [],
    sources: fallbackSources,
    confidence: fallbackSources.length ? 0.68 : 0.55,
    missingInfo: "The assistant returned a plain response instead of structured JSON.",
    companion,
  };
}

function responseText(response: ChatResponse): string {
  return [
    response.answer,
    ...(response.sections ?? []).flatMap((section) => [section.title, section.content]),
    ...(response.tables ?? []).flatMap((table) => [table.title, ...table.columns, ...table.rows.flat()]),
  ].join(" ");
}

const affinityTerms = ["Slash", "Strike", "Pierce", "Fire", "Ice", "Electric", "Wind", "Light", "Dark"];
const tartarusBlocks = ["Thebel", "Arqa", "Yabbashah", "Tziah", "Harabah", "Adamah"];

function hasUnsupportedAffinityClaim(
  response: ChatResponse,
  question: string,
  facts: Array<{ fact_type: string; value: string; entity: { name: string } }>,
): boolean {
  const supported = new Set(
    facts
      .filter(
        (fact) =>
          factMatchesQuestionSubject(question, fact.entity.name) &&
          ["weakness", "resistance", "nullifies", "drains", "repels"].includes(fact.fact_type),
      )
      .map((fact) => fact.value.toLowerCase()),
  );
  if (!supported.size) return false;
  const text = responseText(response);
  const mentioned = affinityTerms.filter((term) => new RegExp(`\\b${term}\\b`, "i").test(text));
  return mentioned.some((term) => !supported.has(term.toLowerCase()));
}

function compactText(value: string, maxLength = 520): string {
  const text = value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\((?:https?:)?\/\/[^)]*\)/g, " ")
    .replace(/Title:\s*.*?(?:Markdown Content:|Published Time:\s*\S+)/gis, " ")
    .replace(/URL Source:\s*\S+/gi, " ")
    .replace(/Published Time:\s*\S+/gi, " ")
    .replace(/Markdown Content:/gi, " ")
    .replace(/\badvertisement\b/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

function relevantExcerpt(value: string, queries: string[], maxLength = 900): string {
  const cleaned = compactText(value, 12000);
  if (cleaned.length <= maxLength) return cleaned;

  const stopWords = new Set([
    "persona",
    "reload",
    "guide",
    "strategy",
    "party",
    "roles",
    "level",
    "normal",
  ]);
  const terms = [
    ...new Set(
      queries
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .split(/\s+/)
        .filter((term) => term.length >= 3 && !stopWords.has(term)),
    ),
  ];
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const ranked = sentences
    .map((sentence, index) => {
      const lower = sentence.toLowerCase();
      const score = terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0);
      return { sentence, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (!ranked.length) return compactText(cleaned, maxLength);

  const selectedIndexes = new Set<number>();
  for (const item of ranked) {
    selectedIndexes.add(item.index);
    if (item.index > 0) selectedIndexes.add(item.index - 1);
    if (
      [...selectedIndexes]
        .sort((a, b) => a - b)
        .map((index) => sentences[index])
        .join(" ").length >= maxLength
    ) {
      break;
    }
  }

  const excerpt = [...selectedIndexes]
    .sort((a, b) => a - b)
    .map((index) => sentences[index])
    .join(" ");
  return compactText(excerpt, maxLength);
}

function exactWeaknessQuestion(question: string, intent: CompanionIntent): boolean {
  return intent === "Enemy Weakness" || /\b(weak to|weakness|weaknesses|resist|resists|resistance|null|drain|repel|affinity)\b/i.test(question);
}

function hasStructuredAffinitySupport(
  question: string,
  facts: Array<{ fact_type: string; value: string; entity: { name: string } }>,
): boolean {
  return facts.some(
    (fact) =>
      factMatchesQuestionSubject(question, fact.entity.name) &&
      ["weakness", "resistance", "nullifies", "drains", "repels"].includes(fact.fact_type) &&
      Boolean(fact.value.trim()),
  );
}

function likelyExactSubject(question: string): string | null {
  const phrases =
    question
      .match(/[A-Z][a-z0-9']+(?:\s+[A-Z][a-z0-9']+)*/g)
      ?.map((phrase) => phrase.trim())
      .filter((phrase) => !/^(Persona|Persona 3|Persona 3 Reload|Reload|Tartarus Guide)$/i.test(phrase)) ?? [];

  const multiword = phrases.find((phrase) => phrase.split(/\s+/).length > 1);
  return multiword ?? phrases[0] ?? null;
}

function factMatchesQuestionSubject(question: string, entityName: string): boolean {
  const subject = likelyExactSubject(question)?.toLowerCase();
  if (!subject) return true;
  const entity = entityName.toLowerCase();
  return subject === entity || subject.includes(entity) || entity.includes(subject);
}

function exactAffinityFacts(
  question: string,
  facts: Array<{
    fact_type: string;
    value: string;
    confidence: number;
    entity: { name: string };
    source: { title: string; url: string; domain: string };
  }>,
) {
  return facts.filter(
    (fact) =>
      factMatchesQuestionSubject(question, fact.entity.name) &&
      ["weakness", "resistance", "nullifies", "drains", "repels"].includes(fact.fact_type) &&
      Boolean(fact.value.trim()),
  );
}

function joinNatural(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function structuredAffinityResponse(
  question: string,
  facts: Array<{
    fact_type: string;
    value: string;
    confidence: number;
    entity: { name: string };
    source: { title: string; url: string; domain: string };
  }>,
  companion: NonNullable<ChatResponse["companion"]>,
  debug: boolean,
  queries: string[],
): ChatResponse | null {
  const matches = exactAffinityFacts(question, facts);
  if (!matches.length) return null;

  const entityName = matches[0].entity.name;
  const byType = new Map<string, string[]>();
  for (const fact of matches) {
    byType.set(fact.fact_type, uniqueStrings([...(byType.get(fact.fact_type) ?? []), fact.value]));
  }

  const clauses = [
    byType.get("weakness")?.length ? `is weak to ${joinNatural(byType.get("weakness")!)}` : undefined,
    byType.get("resistance")?.length ? `resists ${joinNatural(byType.get("resistance")!)}` : undefined,
    byType.get("nullifies")?.length ? `nullifies ${joinNatural(byType.get("nullifies")!)}` : undefined,
    byType.get("drains")?.length ? `drains ${joinNatural(byType.get("drains")!)}` : undefined,
    byType.get("repels")?.length ? `repels ${joinNatural(byType.get("repels")!)}` : undefined,
  ].filter((clause): clause is string => Boolean(clause));

  const sourceMap = new Map<string, ChatResponse["sources"][number]>();
  for (const fact of matches) {
    sourceMap.set(fact.source.url, {
      title: fact.source.title,
      url: fact.source.url,
      domain: fact.source.domain,
    });
  }

  const weaknesses = byType.get("weakness") ?? [];
  const requestedBlock = tartarusBlocks.find((block) => new RegExp(`\\b${block}\\b`, "i").test(question));
  const sourceBlock = tartarusBlocks.find((block) =>
    matches.some((fact) => new RegExp(`\\b${block}\\b`, "i").test(`${fact.source.title} ${fact.source.url}`)),
  );
  const locationCorrection =
    requestedBlock && sourceBlock && requestedBlock.toLowerCase() !== sourceBlock.toLowerCase()
      ? `${entityName} is indexed in ${sourceBlock}, not ${requestedBlock}. The ${sourceBlock} version`
      : entityName;
  const response = withMode({
    answer: `${locationCorrection} ${joinNatural(clauses)}.`,
    sections: weaknesses.length
      ? [
          {
            title: "Quick Strategy",
            content: `Open with ${joinNatural(weaknesses)} damage to knock it down, then capitalize with an All-Out Attack. Avoid leaning on resisted affinities if you can cover the weakness instead.`,
          },
        ]
      : [],
    sources: [...sourceMap.values()],
    confidence: Math.max(...matches.map((fact) => fact.confidence)),
    missingInfo: "No additional detail is needed for the confirmed affinity.",
    companion,
  }, "rag");

  if (debug) {
    response.diagnostics = {
      retrievalQueries: queries,
      factCount: matches.length,
      chunkCount: 0,
    };
  }
  return response;
}

function structuredFusionResponse(
  question: string,
  facts: Array<{
    fact_type: string;
    value: string;
    confidence: number;
    notes?: string | null;
    entity: { name: string };
    source: { title: string; url: string; domain: string };
  }>,
  companion: NonNullable<ChatResponse["companion"]>,
  debug: boolean,
  queries: string[],
): ChatResponse | null {
  const normalizedQuestion = question.toLowerCase();
  const recipeFacts = facts.filter((fact) => fact.fact_type === "fusion_recipe");
  if (!recipeFacts.length) return null;

  const asksForResult =
    /\b(what|which)\b.*\b(make|makes|create|creates|result|become|fuse into)\b/i.test(question) ||
    /\b(make|makes|create|creates)\b.*\b(what|which)\b/i.test(question);
  if (asksForResult) {
    const matches = recipeFacts.filter((fact) => {
      const ingredients = fact.value
        .split(/\s*(?:\+|,\s*|\band\b)\s*/i)
        .map((ingredient) => ingredient.replace(/\s*\([^)]*\)\s*/g, "").trim())
        .filter(Boolean);
      return ingredients.length >= 2 && ingredients.every((ingredient) => normalizedQuestion.includes(ingredient.toLowerCase()));
    });
    if (matches.length) {
      const best = matches.sort(
        (a, b) =>
          Number(Boolean(b.notes?.includes("Special fusion recipe"))) -
            Number(Boolean(a.notes?.includes("Special fusion recipe"))) ||
          b.confidence - a.confidence,
      )[0];
      const source = {
        title: best.source.title,
        url: best.source.url,
        domain: best.source.domain,
      };
      const special = best.notes?.includes("Special fusion recipe");
      const response = withMode({
        answer: `${best.value} fuses into ${best.entity.name}.`,
        sections: special
          ? [{ title: "Fusion Type", content: "This is a fixed special fusion recipe." }]
          : [],
        sources: [source],
        confidence: best.confidence,
        missingInfo: "No additional detail is needed for this recipe.",
        companion,
      }, "rag");
      if (debug) {
        response.diagnostics = {
          retrievalQueries: queries,
          factCount: matches.length,
          chunkCount: 0,
        };
      }
      return response;
    }
  }

  const subject = likelyExactSubject(question);
  if (!subject || !/\b(fuse|fusion|recipe|make)\b/i.test(question)) return null;
  const targetRecipes = recipeFacts.filter((fact) => factMatchesQuestionSubject(question, fact.entity.name));
  if (!targetRecipes.length) return null;

  const selected = targetRecipes
    .sort(
      (a, b) =>
        Number(Boolean(b.notes?.includes("Special fusion recipe"))) -
          Number(Boolean(a.notes?.includes("Special fusion recipe"))) ||
        b.confidence - a.confidence ||
        a.value.localeCompare(b.value),
    )
    .slice(0, 4);
  const target = selected[0].entity.name;
  const sourceMap = new Map<string, ChatResponse["sources"][number]>();
  for (const fact of selected) {
    sourceMap.set(fact.source.url, {
      title: fact.source.title,
      url: fact.source.url,
      domain: fact.source.domain,
    });
  }
  const response = withMode({
    answer: selected[0].notes?.includes("Special fusion recipe")
      ? `${target} uses the fixed special recipe ${selected[0].value}.`
      : `You can fuse ${target} with ${selected[0].value}.`,
    sections:
      selected.length > 1
        ? [{ title: "Other Recipes", content: selected.slice(1).map((fact) => fact.value).join("\n") }]
        : [],
    sources: [...sourceMap.values()],
    confidence: Math.max(...selected.map((fact) => fact.confidence)),
    missingInfo: "Fusion results use base Persona levels; your compendium and current levels can affect convenience.",
    companion,
  }, "rag");
  if (debug) {
    response.diagnostics = {
      retrievalQueries: queries,
      factCount: selected.length,
      chunkCount: 0,
    };
  }
  return response;
}

function exactSubjectSources(
  question: string,
  context: {
    chunks: Array<{ source_title: string; source_url: string; source_domain: string; source_credibility_rank?: number; chunk_text: string; section_title: string | null }>;
    sources: ChatResponse["sources"];
  },
): ChatResponse["sources"] {
  const subject = likelyExactSubject(question);
  if (!subject) return [];
  const needle = subject.toLowerCase();
  const exactChunkUrls = new Set(
    context.chunks
      .filter((chunk) => `${chunk.section_title ?? ""} ${chunk.chunk_text}`.toLowerCase().includes(needle))
      .map((chunk) => chunk.source_url),
  );
  return context.sources.filter((source) => exactChunkUrls.has(source.url));
}

function relevantResponseSources(
  question: string,
  intent: CompanionIntent,
  context: {
    facts: Array<{
      entity: { name: string };
      source: { url: string };
    }>;
    chunks: Array<{
      source_url: string;
      section_title: string | null;
      chunk_text: string;
    }>;
    sources: ChatResponse["sources"];
  },
): ChatResponse["sources"] {
  const subject = likelyExactSubject(question);
  const relevantUrls = new Set<string>();

  if (subject) {
    for (const fact of context.facts) {
      if (factMatchesQuestionSubject(question, fact.entity.name)) {
        relevantUrls.add(fact.source.url);
      }
    }
    const needle = subject.toLowerCase();
    for (const chunk of context.chunks) {
      if (`${chunk.section_title ?? ""} ${chunk.chunk_text}`.toLowerCase().includes(needle)) {
        relevantUrls.add(chunk.source_url);
      }
    }
  }

  const exactMatches = context.sources.filter((source) => relevantUrls.has(source.url));
  if (exactMatches.length) return exactMatches.slice(0, 4);

  if (intent === "Fusion Advice") {
    const fusionFactUrls = new Set(context.facts.map((fact) => fact.source.url));
    const fusionSources = context.sources.filter((source) => fusionFactUrls.has(source.url));
    if (fusionSources.length) return fusionSources.slice(0, 3);
  }

  return context.sources.slice(0, 4);
}

function applyGroundingGuardrails(
  question: string,
  intent: CompanionIntent,
  response: ChatResponse,
  context: {
    facts: Array<{
      confidence: number;
      entity: { name: string };
      source: { url: string };
    }>;
    chunks: Array<{
      source_url: string;
      section_title: string | null;
      chunk_text: string;
      similarity?: number;
    }>;
  },
): ChatResponse {
  const requiresExactEvidence = requiresExactGameEvidence(question, intent);
  const subject = likelyExactSubject(question);
  const matchingFacts = context.facts.filter((fact) => factMatchesQuestionSubject(question, fact.entity.name));
  const matchingChunks = subject
    ? context.chunks.filter((chunk) =>
        `${chunk.section_title ?? ""} ${chunk.chunk_text}`.toLowerCase().includes(subject.toLowerCase()),
      )
    : [];
  const matchingUrls = new Set([
    ...matchingFacts.map((fact) => fact.source.url),
    ...matchingChunks.map((chunk) => chunk.source_url),
  ]);
  const assessment = assessGrounding({
    requiresExactEvidence,
    matchingFactConfidences: matchingFacts.map((fact) => fact.confidence),
    matchingChunkSimilarities: matchingChunks.map((chunk) => chunk.similarity ?? 0.58),
  });

  const diagnostics = {
    ...response.diagnostics,
    groundingStatus: assessment.status,
    guardrailNotes: assessment.notes,
  };

  if (requiresExactEvidence && assessment.status === "insufficient") {
    const prompt = exactDetailPrompt(intent);
    return {
      ...response,
      answer: `I can’t confirm that exact detail yet, so I won’t guess. ${prompt}`,
      sections: [],
      tables: [],
      sources: [],
      confidence: assessment.confidenceCeiling,
      missingInfo: prompt,
      companion: {
        ...response.companion,
        followUpQuestions: [prompt],
      },
      diagnostics,
    };
  }

  return {
    ...response,
    sources: requiresExactEvidence
      ? response.sources.filter((source) => matchingUrls.has(source.url)).slice(0, 4)
      : response.sources.slice(0, 4),
    confidence: Math.min(response.confidence ?? assessment.confidenceCeiling, assessment.confidenceCeiling),
    diagnostics,
  };
}

function formatAssistantContext(context: {
  queries: string[];
  facts: Array<{
    entity: { name: string; type: string };
    fact_type: string;
    value: string;
    confidence: number;
    source: { url: string };
  }>;
  chunks: Array<{ source_title: string; source_url: string; section_title: string | null; chunk_text: string }>;
}): string {
  const facts = context.facts
    .slice(0, 6)
    .map(
      (fact, index) =>
        `[Fact ${index + 1}] ${fact.entity.name} (${fact.entity.type}) - ${fact.fact_type}: ${fact.value} (confidence ${fact.confidence}, source: ${fact.source.url})`,
    )
    .join("\n");

  const chunks = context.chunks
    .slice(0, 4)
    .map(
      (chunk, index) =>
        `[Guide ${index + 1}] ${chunk.source_title} / ${chunk.section_title ?? "Untitled"} (${chunk.source_url})\n${relevantExcerpt(chunk.chunk_text, context.queries, 900)}`,
    )
    .join("\n\n");

  return `Structured facts:\n${facts || "No structured facts found."}\n\nGuide excerpts:\n${chunks || "No guide excerpts found."}`;
}

function extractiveRagResponse(
  question: string,
  context: {
    chunks: Array<{ section_title: string | null; chunk_text: string; similarity?: number }>;
    sources: ChatResponse["sources"];
  },
  analysis?: CompanionAnalysis,
): ChatResponse {
  const topChunks = context.chunks.slice(0, 3);
  return withMode({
    answer:
      "I found related guide pages, but I could not turn them into a clean answer this time. Give me the exact enemy, boss, floor, or date again and I’ll try a narrower lookup instead of guessing.",
    sections: [],
    sources: context.sources,
    confidence: topChunks[0]?.similarity ? Math.max(0.35, Math.min(0.8, topChunks[0].similarity)) : 0.55,
    missingInfo: analysis?.followUpQuestions.join(" ") || `Tell me one more detail about "${question}" and I can tighten the recommendation.`,
    companion: analysis
      ? {
          intent: analysis.intent,
          profileUpdates: analysis.profileUpdates,
          followUpQuestions: analysis.followUpQuestions,
        }
      : undefined,
  }, "rag");
}

async function externalRagResponse(question: string, conversationId?: string): Promise<ChatResponse | null> {
  const endpoint = process.env.RAG_CHAT_ENDPOINT;
  if (!endpoint || process.env.USE_MOCK_CHAT === "true") {
    return null;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ question, conversationId }),
  });

  if (!response.ok) {
    throw new Error(`RAG endpoint failed with ${response.status}`);
  }

  return (await response.json()) as ChatResponse;
}

async function decideCompanionAction(
  question: string,
  analysis: CompanionAnalysis,
  playerProfile: PlayerProfile | undefined,
  history: ChatRequest["history"],
  createChatCompletion: (
    messages: Array<{ role: "system" | "user"; content: string }>,
    options?: { jsonObject?: boolean },
  ) => Promise<string>,
): Promise<ControllerDecision> {
  const profile = mergeProfile(playerProfile, analysis.profileUpdates);
  const historyForPrompt = (history ?? [])
    .slice(-8)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  const systemPrompt = `You are the conversation controller for Tartarus Guide, a Persona 3 Reload expert assistant.

Your job is to decide how the assistant should respond before any guide lookup happens.

Return only JSON:
{
  "action": "answer_directly" | "ask_clarifying_question" | "search_guides" | "search_structured_facts" | "search_both",
  "intent": "Enemy Weakness" | "Boss Help" | "Team Building" | "Fusion Advice" | "Social Links" | "Daily Schedule Planning" | "Tartarus Navigation" | "Quest Help" | "Story Guidance" | "Achievement Hunting" | "General Discussion",
  "retrievalQuery": "string",
  "retrievalQueries": ["up to four focused search strings"],
  "answer": "string or null",
  "followUpQuestions": ["string"],
  "profileUpdates": {
    "currentMonth": "string",
    "currentLevel": "string",
    "difficulty": "string",
    "activeParty": ["string"],
    "recentBoss": "string",
    "currentSocialLinks": ["string"],
    "playstyle": "string"
  },
  "suggestedPrompts": ["string"],
  "spoilerCaution": false
}

Routing rules:
- Act like a normal LLM chat assistant first. For greetings, thanks, small talk, and meta questions, choose answer_directly.
- If the user is vague but clearly wants help, choose ask_clarifying_question and ask one natural question.
- Do not force exact guide keywords from the user. Infer the likely intent from normal language.
- Search only when exact Persona 3 Reload facts are needed: enemy weaknesses, boss mechanics, dates, floors, fusion routes, rewards, Social Link answers, Elizabeth requests, achievements, or spoiler-sensitive story facts.
- Use search_structured_facts for exact weakness/resistance/entity facts.
- Use search_guides for broad plans and walkthrough-style advice.
- Use search_both when both exact facts and guide explanation would help.
- If the user says their team feels weak, party feels weak, they are stuck, or they need coaching, do not search immediately unless they named a boss/enemy/floor. Ask for level, active team, and bottleneck.
- If player progress is unclear and the question could spoil story, ask before revealing story details.
- Keep answer concise when action is answer_directly or ask_clarifying_question.
- Never mention retrieval, database, Supabase, Groq, IGN, Game8, or guide mechanics in the answer.
- retrievalQuery should be a compact search query with useful player details, not the entire chat transcript.
- retrievalQueries should decompose the need into focused searches. Put the exact named entity first, then mechanics, location/date, or strategy searches only when useful.
- Do not search for generic words alone. Preserve exact enemy, boss, Persona, Social Link, request, floor, item, and date names from the user.
- For exact affinities, include one query with the exact entity plus "weakness resistance affinity".
- For bosses, include the exact boss plus "mechanics strategy recommended party", and a second query for any named phase or attack.
- suggestedPrompts must be optional first-person user replies, never assistant questions. Good: "I'm stuck on Priestess", "My party is Yukari and Junpei", "I'm level 18". Bad: "Which boss are you fighting?", "Name the blocker".`;

  const userPrompt = `User message: ${question}

Heuristic intent hint: ${analysis.intent}
Heuristic ambiguity hint: ${analysis.isAmbiguous}
Known player profile: ${JSON.stringify(profile)}
Recent conversation:
${historyForPrompt || "No prior turns."}

Decide the next action.`;

  try {
    const rawDecision = await createChatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { jsonObject: true },
    ).catch(() =>
      createChatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]),
    );

    return normalizeControllerDecision(extractJson(rawDecision), analysis);
  } catch (error) {
    console.error(error);
    return normalizeControllerDecision({}, analysis);
  }
}

function deterministicControllerDecision(
  question: string,
  analysis: CompanionAnalysis,
  playerProfile: PlayerProfile | undefined,
): ControllerDecision | null {
  const profile = mergeProfile(playerProfile, analysis.profileUpdates);
  const subject = likelyExactSubject(question);
  const base = {
    intent: analysis.intent,
    answer: null,
    profileUpdates: analysis.profileUpdates,
    suggestedPrompts: [] as string[],
    spoilerCaution: analysis.spoilerCaution,
  };

  const spoilerDecision = evaluateSpoilerPolicy({
    question,
    intent: analysis.intent,
    preference: profile.spoilerPreference,
    currentMonth: profile.currentMonth,
  });
  if (!spoilerDecision.allow) {
    return {
      ...base,
      action: "ask_clarifying_question",
      retrievalQuery: "",
      retrievalQueries: [],
      answer: spoilerDecision.message ?? "I’ll keep that spoiler-free.",
      followUpQuestions: spoilerDecision.followUp ? [spoilerDecision.followUp] : [],
      suggestedPrompts: ["Give me a spoiler-free hint", "Full spoilers are fine"],
    };
  }

  if (exactWeaknessQuestion(question, analysis.intent)) {
    const query = `${subject ?? question} weakness resistance affinity`;
    return {
      ...base,
      action: "search_structured_facts",
      retrievalQuery: query,
      retrievalQueries: [query],
      followUpQuestions: [],
    };
  }

  if (analysis.intent === "Team Building") {
    if ((!profile.currentLevel || !profile.activeParty?.length) && analysis.followUpQuestions.length) {
      return {
        ...base,
        action: "ask_clarifying_question",
        retrievalQuery: "",
        retrievalQueries: [],
        answer: analysis.followUpQuestions[0],
        followUpQuestions: analysis.followUpQuestions,
        suggestedPrompts: ["I'm level 24 with Yukari and Junpei", "We're running out of SP"],
      };
    }
    const profileQuery = [
      profile.currentLevel ? `level ${profile.currentLevel}` : undefined,
      profile.activeParty?.join(" "),
      profile.difficulty,
      profile.playstyle,
    ]
      .filter(Boolean)
      .join(" ");
    const issueQuery = /\b(sp|mana|magic points|running out)\b/i.test(question)
      ? "Tartarus Clocks restore HP SP Twilight Fragments"
      : /\b(die|dying|damage|survive|survivability|defense|armor)\b/i.test(question)
        ? "Persona 3 Reload survivability armor healing buffs debuffs party strategy"
        : "Persona 3 Reload party roles strategy equipment";
    const partyQuery = `Persona 3 Reload party roles ${profileQuery}`.trim();
    return {
      ...base,
      action: "search_guides",
      retrievalQuery: issueQuery,
      retrievalQueries: uniqueStrings([issueQuery, partyQuery]),
      followUpQuestions: analysis.followUpQuestions,
    };
  }

  if (analysis.intent === "Boss Help" && analysis.followUpQuestions.length) {
    return {
      ...base,
      action: "ask_clarifying_question",
      retrievalQuery: "",
      retrievalQueries: [],
      answer: analysis.followUpQuestions[0],
      followUpQuestions: analysis.followUpQuestions,
      suggestedPrompts: ["I'm fighting Priestess", "It's a Tartarus gatekeeper"],
    };
  }

  if (
    analysis.intent === "Fusion Advice" &&
    /\b(what persona should i fuse|what should i fuse|fuse next|fusion advice)\b/i.test(question) &&
    !profile.currentLevel
  ) {
    return {
      ...base,
      action: "ask_clarifying_question",
      retrievalQuery: "",
      retrievalQueries: [],
      answer: "What level are you, and what role do you need most: damage, healing, support, or elemental coverage?",
      followUpQuestions: ["What level are you, and what role should the new Persona fill?"],
      suggestedPrompts: ["I'm level 24 and need healing", "I need better elemental coverage"],
    };
  }

  if (
    analysis.intent === "Tartarus Navigation" &&
    /\b(next full moon|how far|how high|which floor)\b/i.test(question) &&
    !profile.currentMonth
  ) {
    return {
      ...base,
      action: "ask_clarifying_question",
      retrievalQuery: "",
      retrievalQueries: [],
      answer: "What in-game date are you on, and what is the highest Tartarus floor you have reached?",
      followUpQuestions: ["What in-game date and Tartarus floor are you currently on?"],
      suggestedPrompts: ["I'm in June on floor 42", "The next full moon is in a week"],
    };
  }

  if (analysis.isAmbiguous && analysis.followUpQuestions.length) {
    return {
      ...base,
      action: "ask_clarifying_question",
      retrievalQuery: "",
      retrievalQueries: [],
      answer: analysis.followUpQuestions[0],
      followUpQuestions: analysis.followUpQuestions,
      suggestedPrompts: [],
    };
  }

  if (analysis.intent === "Daily Schedule Planning" && !profile.currentMonth) {
    return {
      ...base,
      action: "ask_clarifying_question",
      retrievalQuery: "",
      retrievalQueries: [],
      answer: "What in-game month and date are you on, and are you prioritizing Social Links, stats, or Tartarus?",
      followUpQuestions: ["What in-game month and date are you on?"],
      suggestedPrompts: ["I'm in July and prioritizing Social Links", "I need more social stats"],
    };
  }

  const routeByIntent: Partial<Record<CompanionIntent, ControllerAction>> = {
    "Boss Help": "search_both",
    "Fusion Advice": "search_both",
    "Social Links": "search_both",
    "Daily Schedule Planning": "search_guides",
    "Tartarus Navigation": "search_guides",
    "Quest Help": "search_both",
    "Story Guidance": "search_guides",
    "Achievement Hunting": "search_guides",
  };
  const action = routeByIntent[analysis.intent];
  if (!action) return null;

  const query = compactText(
    [
      question,
      profile.currentMonth ? `month ${profile.currentMonth}` : undefined,
      profile.currentLevel ? `level ${profile.currentLevel}` : undefined,
      profile.activeParty?.length ? `party ${profile.activeParty.join(" ")}` : undefined,
    ]
      .filter(Boolean)
      .join(" "),
    240,
  );
  return {
    ...base,
    action,
    retrievalQuery: query,
    retrievalQueries: [query],
    followUpQuestions: analysis.followUpQuestions,
  };
}

async function directRagResponse(
  question: string,
  playerProfile?: PlayerProfile,
  history: ChatRequest["history"] = [],
  debug = false,
  onProgress?: (message: string) => void,
): Promise<ChatResponse | null> {
  if (process.env.USE_MOCK_CHAT === "true" || !hasDirectRagEnv()) {
    return null;
  }

  onProgress?.("Understanding your question...");
  const normalizedHistory = normalizeConversationHistory(question, history);
  const conversation = contextualizeQuestion(question, normalizedHistory);
  const analysis = analyzeCompanionRequest(conversation.analysisQuestion, playerProfile);
  const clarificationRecovery = rejectedClarificationResponse(question, conversation, analysis);
  if (clarificationRecovery) return clarificationRecovery;
  if (isCasualMessage(question) && !conversation.previousTopic) {
    return casualChatResponse(question, playerProfile, normalizedHistory);
  }

  const [{ buildPlannedContext }, { createChatCompletion }] = await Promise.all([
    import("../../../src/retrieval/buildContext"),
    import("../../../src/db/client"),
  ]);

  const controller =
    deterministicControllerDecision(conversation.analysisQuestion, analysis, playerProfile) ??
    (await decideCompanionAction(question, analysis, playerProfile, normalizedHistory, createChatCompletion));
  const controllerProfile = mergeProfile(playerProfile, controller.profileUpdates);
  const spoilerDecision = evaluateSpoilerPolicy({
    question: conversation.analysisQuestion,
    intent: controller.intent,
    preference: controllerProfile.spoilerPreference,
    currentMonth: controllerProfile.currentMonth,
  });
  const controllerFollowUps = controller.followUpQuestions.length ? controller.followUpQuestions : analysis.followUpQuestions;
  const companion = {
    intent: controller.intent,
    profileUpdates: controller.profileUpdates,
    followUpQuestions: controllerFollowUps,
    suggestedPrompts: controller.suggestedPrompts.length ? controller.suggestedPrompts : undefined,
  };

  if (controller.action === "answer_directly") {
    return withMode({
      answer:
        controller.answer ??
        "I’m with you. Tell me what part of Persona 3 Reload you’re working on and I’ll help you reason through it.",
      sections: [],
      sources: [],
      confidence: 0.78,
      missingInfo: controllerFollowUps.join(" ") || "No guide lookup was needed for this message.",
      companion,
    }, "rag");
  }

  if (controller.action === "ask_clarifying_question") {
    const answer =
      controller.answer ??
      controllerFollowUps[0] ??
      "What part of Persona 3 Reload are you working on right now: a boss, Tartarus, fusion, Social Links, or daily planning?";
    return withMode({
      answer,
      sections: [],
      sources: [],
      confidence: 0.72,
      missingInfo: controllerFollowUps.join(" ") || "One player detail is needed before giving exact guidance.",
      companion,
    }, "rag");
  }

  onProgress?.(
    controller.action === "search_structured_facts"
      ? "Checking exact game facts..."
      : controller.action === "search_guides"
        ? "Reviewing the guide index..."
        : "Checking facts and strategy guides...",
  );
  const retrievalQueries = uniqueStrings([
    ...controller.retrievalQueries,
    controller.retrievalQuery,
  ]).slice(0, 2);
  const context = await buildPlannedContext({
    queries: retrievalQueries,
    includeFacts: controller.action !== "search_guides",
    includeChunks: controller.action !== "search_structured_facts",
    factLimit: 12,
    chunkLimit: 7,
  });
  if (
    controller.intent === "Fusion Advice" ||
    /\b(fuse|fusion|recipe|persona|worth|good to get|should i get)\b/i.test(conversation.analysisQuestion)
  ) {
    const fusionResponse = structuredFusionResponse(
      conversation.analysisQuestion,
      context.facts,
      companion,
      debug,
      context.queries,
    );
    if (fusionResponse) return fusionResponse;
  }
  if (exactWeaknessQuestion(conversation.analysisQuestion, controller.intent)) {
    const exactResponse = structuredAffinityResponse(
      conversation.analysisQuestion,
      context.facts,
      companion,
      debug,
      context.queries,
    );
    if (exactResponse) return exactResponse;
  }
  if (
    exactWeaknessQuestion(conversation.analysisQuestion, controller.intent) &&
    !hasStructuredAffinitySupport(conversation.analysisQuestion, context.facts)
  ) {
    const matchingSources = exactSubjectSources(conversation.analysisQuestion, context);
    return withMode({
      answer:
        "I do not have a confirmed weakness for that exact enemy variant yet, so I will not guess. Use Analyze first, then test single-target elements before spending big SP.",
      sections: [
        {
          title: "Safe Battle Plan",
          content:
            "Open defensively, avoid committing to one element until Analyze or a test hit confirms the affinity, then knock it down and chain an All-Out Attack if the weakness appears.",
        },
      ],
      sources: matchingSources,
      confidence: matchingSources.length ? 0.45 : 0.32,
      missingInfo:
        "Tell me the floor, block, or exact Shadow variant if you have it, and I can narrow the lookup without inventing a weakness.",
      companion: {
        ...companion,
        suggestedPrompts: sanitizeSuggestedPrompts([
          "I'm on Thebel Block",
          "I want a safe unknown-shadow opener",
          "Help me prepare Personas for coverage",
        ]),
      },
    }, "rag");
  }

  if (!context.facts.length && !context.chunks.length) {
    return withMode({
      answer:
        controller.answer ??
        "I can help, but I don’t have enough exact guide support for that yet. Give me the enemy, boss, date, floor, or Social Link name and I’ll narrow it down.",
      sections: [],
      sources: [],
      confidence: 0.35,
      missingInfo: controllerFollowUps.join(" ") || "No matching guide facts or chunks were found for this query.",
      companion,
    }, "rag");
  }

  const systemPrompt = `You are SEES Navigator, the conversational voice of Tartarus Guide: a Persona 3 Reload expert companion, strategic coach, and spoiler-aware veteran.

Return only JSON with this shape:
{
  "answer": "short direct answer",
  "sections": [{"title": "string", "content": "string"}],
  "tables": [{"title": "string", "columns": ["string"], "rows": [["string"]]}],
  "confidence": 0.0,
  "missingInfo": "string"
}

Rules:
- Sound like a helpful Persona 3 Reload expert, not a search engine or wiki reader.
- Your personality is calm, confident, tactically sharp, supportive, and occasionally dryly witty. Use contractions and match the user's energy without overdoing a character voice.
- Answer like a modern chat assistant in a normal back-and-forth conversation: lead with the direct guidance, then explain briefly.
- Treat short replies as part of the ongoing conversation. Acknowledge what the user accepted or rejected, return to the active topic, and never repeat a clarification they just answered.
- Ask at most one focused question per turn. If the user rejects a framing with "no" or "not really," offer the most useful interpretation of their original topic instead of asking the same menu-style question again.
- Never say "retrieved", "database", "guide context", "provided context", "according to IGN", "based on documents", or similar mechanics-facing phrases.
- Never apologize for missing guide context in the answer. If exact source support is thin, answer with a useful next step and put the missing detail in missingInfo.
- Never use "Unknown", "N/A", or a vague one-word answer. If the exact answer is not supported, say what detail you need or what the player should check next.
- Use structured facts and guide chunks for exact weaknesses, dates, floors, fusions, rewards, and boss mechanics.
- Treat the supplied facts and excerpts as the only evidence for game-specific mechanics. If a mechanic, reward, unlock, skill effect, affinity, date, floor, or resource cost is not supported there, omit it.
- Never fill evidence gaps with plausible-sounding Persona knowledge. A shorter grounded answer is better than a detailed invented answer.
- Combine the strongest facts into one cohesive recommendation instead of listing every matching page.
- You may give general coaching when the user is vague, but keep it principle-based, mark uncertainty naturally, and ask one useful follow-up.
- Be practical, concise, and strategy-first. Give next actions, party/fusion/social priority ideas when relevant.
- If the user gave profile details, personalize the advice around them.
- When the active party is known, explicitly address that party and the user's stated bottleneck. Do not recommend replacing a member unless the evidence supports why.
- If the request risks story spoilers, avoid revealing plot specifics unless the user explicitly asks.
- Do not assume party members, Personas, skills, months, or bosses are available just because they appear in guide context. If the player's progress is unclear, say "if unlocked" or ask what is available.
- Do not invent exact weaknesses, fusions, dates, floors, rewards, or boss mechanics.
- If guide context is incomplete, put the needed player detail in missingInfo without exposing retrieval mechanics.
- Use tables only for exact weakness or item lists. Most answers should not need a table.
- Keep section content short enough for a mobile chat bubble.
- Prefer one natural answer plus no more than two short sections. Omit sections when a direct answer is enough.
- If the user's question is broad or uncertain, ask the single best follow-up instead of dumping caveats.`;

  const profileForPrompt = controllerProfile;
  const historyForPrompt = normalizedHistory
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  const userPrompt = `Current user message: ${question}
Resolved conversation topic: ${conversation.previousTopic ?? question}
Previous assistant message: ${conversation.previousAssistant ?? "None."}
Contextual request for analysis: ${conversation.analysisQuestion}
Short follow-up reply: ${
    conversation.shortReply
      ? "Yes. Interpret it as an answer to the previous assistant message, then continue the resolved topic without repeating that question."
      : "No."
  }

Controller intent: ${controller.intent}
Known player profile: ${JSON.stringify(profileForPrompt)}
Availability note: Active party is known, but the rest of the roster is unknown unless the conversation explicitly mentions them.
Recent conversation:
${historyForPrompt || "No prior turns."}
Follow-up questions to ask if useful: ${controllerFollowUps.join(" | ") || "None"}
Spoiler caution: ${controller.spoilerCaution ? "Avoid story specifics unless asked." : "Normal."}
Spoiler policy: ${spoilerDecision.promptInstruction}

${formatAssistantContext(context)}

Answer as a companion. First solve the user's stated bottleneck. Use only the supplied material for game-specific claims, and do not mention sources or backend mechanics inside the prose.`;
  const responseSources = relevantResponseSources(
    conversation.analysisQuestion,
    controller.intent,
    context,
  );

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];

  try {
    onProgress?.("Building a grounded answer...");
    const rawAnswer = await createChatCompletion(messages, { jsonObject: true }).catch(() => createChatCompletion(messages));
    const responseCompanion = {
      intent: controller.intent,
      profileUpdates: controller.profileUpdates,
      followUpQuestions: controllerFollowUps,
      suggestedPrompts: controller.suggestedPrompts,
    };
    let normalized: ChatResponse;
    try {
      normalized = normalizeRagResponse(extractJson(rawAnswer), responseSources, responseCompanion);
    } catch {
      normalized = responseFromPlainText(rawAnswer, responseSources, responseCompanion);
    }
    if (
      exactWeaknessQuestion(conversation.analysisQuestion, controller.intent) &&
      hasUnsupportedAffinityClaim(normalized, conversation.analysisQuestion, context.facts)
    ) {
      const correctionPrompt = `${userPrompt}

Your previous draft contained an affinity element that is not present in the structured facts. Regenerate the JSON answer using only explicitly supported weakness, resistance, nullify, drain, or repel values. Do not recommend an unsupported element as if it were confirmed.`;
      const correctedRaw = await createChatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: correctionPrompt },
        ],
        { jsonObject: true },
      );
      normalized = normalizeRagResponse(extractJson(correctedRaw), responseSources, responseCompanion);
    }
    const response = withMode(
      applyGroundingGuardrails(
        conversation.analysisQuestion,
        controller.intent,
        normalized,
        context,
      ),
      "rag",
    );
    if (debug) {
      response.diagnostics = {
        ...response.diagnostics,
        retrievalQueries: context.queries,
        factCount: context.facts.length,
        chunkCount: context.chunks.length,
        spoilerMode: spoilerDecision.mode,
      };
    }
    return response;
  } catch (error) {
    console.error(error);
    return extractiveRagResponse(question, context, analysis);
  }
}

async function resolveChatRequest(
  body: Partial<ChatRequest>,
  onProgress?: (message: string) => void,
): Promise<ChatResponse> {
  const question = body.question?.trim() ?? "";
  onProgress?.("Opening the strategy terminal...");
  const external = await externalRagResponse(question, body.conversationId);
  if (external) return external;

  const direct = await directRagResponse(
    question,
    body.playerProfile,
    body.history,
    body.debug,
    onProgress,
  );
  return direct ?? withMode(mockResponse(question), "mock");
}

function streamedChatResponse(request: Request, body: Partial<ChatRequest>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const response = await resolveChatRequest(body, (message) => {
          emit({ type: "status", message });
        });
        emit({ type: "response", data: response });
      } catch (error) {
        console.error(error);
        emit({ type: "response", data: withMode(mockResponse(body.question ?? ""), "error") });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(request),
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ChatRequest>;
  const question = body.question?.trim();

  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400, headers: corsHeaders(request) });
  }

  if (question === "__status__") {
    const retrievalMode = process.env.USE_MOCK_CHAT === "true" || !hasDirectRagEnv() ? "mock" : "rag";
    return NextResponse.json(
      withMode({
        answer: retrievalMode === "rag" ? "RAG credentials are configured." : "Mock mode is active.",
        sections: [],
        sources: [],
        confidence: retrievalMode === "rag" ? 0.8 : 0.4,
        missingInfo:
          retrievalMode === "rag"
            ? "Status checks do not spend tokens on retrieval. Ask a guide question to retrieve sources."
            : "Set Supabase, Hugging Face, Groq credentials, and USE_MOCK_CHAT=false to enable live retrieval.",
      }, retrievalMode),
      { headers: corsHeaders(request) },
    );
  }

  if (body.stream) {
    return streamedChatResponse(request, body);
  }

  try {
    return NextResponse.json(await resolveChatRequest(body), { headers: corsHeaders(request) });
  } catch (error) {
    console.error(error);
    return NextResponse.json(withMode(mockResponse(question), "error"), { headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
