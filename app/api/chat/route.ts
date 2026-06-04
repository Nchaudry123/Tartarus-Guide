import { NextResponse } from "next/server";
import type { ChatRequest, ChatResponse, PlayerProfile } from "../../../lib/types";

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

const partyMembers = ["Yukari", "Junpei", "Akihiko", "Mitsuru", "Aigis", "Koromaru", "Ken", "Shinjiro", "Fuuka"];

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function detectIntent(question: string): CompanionIntent {
  const text = question.toLowerCase();
  if (/\b(boss|priestess|emperor|empress|hierophant|lovers|chariot|justice|hermit|fortune|strength|hanged|nyx|full moon)\b/.test(text)) return "Boss Help";
  if (/\b(team|party|weak|underleveled|level|build|members|composition|gear|equipment)\b/.test(text)) return "Team Building";
  if (/\b(fusion|fuse|persona|skill inherit|inheritance|recipe|special fusion)\b/.test(text)) return "Fusion Advice";
  if (/\b(social link|s-link|rank|romance|hang out|confidant)\b/.test(text)) return "Social Links";
  if (/\b(day|schedule|calendar|month|night|after school|full moon|free time)\b/.test(text)) return "Daily Schedule Planning";
  if (/\b(tartarus|floor|block|gatekeeper|border|explore|grind|shadows)\b/.test(text)) return "Tartarus Navigation";
  if (/\b(request|elizabeth|missing person|quest|deadline)\b/.test(text)) return "Quest Help";
  if (/\b(story|spoiler|plot|ending|character dies|what happens)\b/.test(text)) return "Story Guidance";
  if (/\b(achievement|trophy|platinum|completion|complete|100%)\b/.test(text)) return "Achievement Hunting";
  return "General Discussion";
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
  const intent = detectIntent(question);
  const profileUpdates = extractProfileUpdates(question);
  const mergedProfile = mergeProfile(profile, profileUpdates);
  const text = question.toLowerCase().trim();
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

function normalizeRagResponse(
  raw: unknown,
  fallbackSources: ChatResponse["sources"],
  companion?: NonNullable<ChatResponse["companion"]>,
): ChatResponse {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
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
    answer: asString(value.answer) ?? "I found source context, but the guide terminal could not format a complete answer.",
    sections,
    tables,
    sources: fallbackSources,
    confidence,
    missingInfo: asString(value.missingInfo) ?? "No additional missing information was reported.",
    companion,
  };
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
      "I have enough guide notes to give you a starting read, but I would still treat this as a quick tactical pass. Use the strongest matching notes below, then answer the check-in question so I can tailor the plan.",
    sections: topChunks.map((chunk, index) => ({
      title: chunk.section_title || `Guide Note ${index + 1}`,
      content: compactText(chunk.chunk_text),
    })),
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

async function directRagResponse(
  question: string,
  playerProfile?: PlayerProfile,
  history: ChatRequest["history"] = [],
): Promise<ChatResponse | null> {
  if (process.env.USE_MOCK_CHAT === "true" || !hasDirectRagEnv()) {
    return null;
  }

  const analysis = analyzeCompanionRequest(question, playerProfile);

  if (analysis.isAmbiguous && analysis.followUpQuestions.length && question.split(/\s+/).filter(Boolean).length <= 5) {
    return companionClarificationResponse(question, analysis);
  }

  const [{ buildContext, formatContext }, { createChatCompletion }] = await Promise.all([
    import("../../../src/retrieval/buildContext"),
    import("../../../src/db/client"),
  ]);

  const context = await buildContext(analysis.retrievalQuery);
  if (!context.facts.length && !context.chunks.length) {
    return companionClarificationResponse(question, analysis);
  }

  const systemPrompt = `You are Tartarus Guide: a Persona 3 Reload expert companion, strategic coach, and spoiler-aware veteran.

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
- Answer like a modern chat assistant in a normal back-and-forth conversation: lead with the direct guidance, then explain briefly.
- Never say "retrieved", "database", "guide context", "provided context", "according to IGN", "based on documents", or similar mechanics-facing phrases.
- Never apologize for missing guide context in the answer. If exact source support is missing, answer with a useful next step and put the missing detail in missingInfo.
- Use structured facts and guide chunks for exact weaknesses, dates, floors, fusions, rewards, and boss mechanics.
- Combine the strongest facts into one cohesive recommendation instead of listing every matching page.
- You may give general coaching when the user is vague, but mark uncertainty naturally and ask one useful follow-up.
- Be practical, concise, and strategy-first. Give next actions, party/fusion/social priority ideas when relevant.
- If the user gave profile details, personalize the advice around them.
- If the request risks story spoilers, avoid revealing plot specifics unless the user explicitly asks.
- Do not assume party members, Personas, skills, months, or bosses are available just because they appear in guide context. If the player's progress is unclear, say "if unlocked" or ask what is available.
- Do not invent exact weaknesses, fusions, dates, floors, rewards, or boss mechanics.
- If guide context is incomplete, put the needed player detail in missingInfo without exposing retrieval mechanics.
- Use tables only for exact weakness or item lists. Most answers should not need a table.
- Keep section content short enough for a mobile chat bubble.
- Prefer no more than two sections. Omit sections when a direct answer is enough.`;

  const profileForPrompt = mergeProfile(playerProfile, analysis.profileUpdates);
  const historyForPrompt = (history ?? [])
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  const userPrompt = `User question: ${question}

Detected intent: ${analysis.intent}
Known player profile: ${JSON.stringify(profileForPrompt)}
Availability note: Active party is known, but the rest of the roster is unknown unless the conversation explicitly mentions them.
Recent conversation:
${historyForPrompt || "No prior turns."}
Follow-up questions to ask if useful: ${analysis.followUpQuestions.join(" | ") || "None"}
Spoiler caution: ${analysis.spoilerCaution ? "Avoid story specifics unless asked." : "Normal."}

${formatContext(context)}

Answer as a companion. Use the guide context for exact claims, but do not mention the context or sources inside the prose.`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];

  try {
    const rawAnswer = await createChatCompletion(messages, { jsonObject: true }).catch(() => createChatCompletion(messages));
    return withMode(
      normalizeRagResponse(extractJson(rawAnswer), context.sources, {
        intent: analysis.intent,
        profileUpdates: analysis.profileUpdates,
        followUpQuestions: analysis.followUpQuestions,
      }),
      "rag",
    );
  } catch (error) {
    console.error(error);
    return extractiveRagResponse(question, context, analysis);
  }
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

  try {
    const rag =
      (await externalRagResponse(question, body.conversationId)) ??
      (await directRagResponse(question, body.playerProfile, body.history));
    return NextResponse.json(rag ?? withMode(mockResponse(question), "mock"), { headers: corsHeaders(request) });
  } catch (error) {
    console.error(error);
    return NextResponse.json(withMode(mockResponse(question), "error"), { headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
