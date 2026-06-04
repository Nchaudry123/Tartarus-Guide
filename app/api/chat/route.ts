import { NextResponse } from "next/server";
import type { ChatRequest, ChatResponse } from "../../../lib/types";

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

function withMode(response: ChatResponse, retrievalMode: NonNullable<ChatResponse["retrievalMode"]>): ChatResponse {
  return { ...response, retrievalMode };
}

function mockResponse(question: string): ChatResponse {
  const normalized = question.toLowerCase();

  if (normalized.includes("dancing hand") || normalized.includes("weak")) {
    return {
      answer:
        "I do not have your live RAG database connected in this preview, so treat this as a mock answer. Once ingestion is complete, this card will pull exact weakness facts first, then confirm with source chunks.",
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
          rows: [["Dancing Hand", "Connect RAG to confirm", "Mock preview"]],
        },
      ],
      sources: mockSources,
      confidence: 0.42,
      missingInfo: "Live Supabase facts and chunks are not connected in this preview.",
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
      missingInfo: "No live boss facts were retrieved because this is using the mock API.",
    };
  }

  if (normalized.includes("fusion") || normalized.includes("jack frost")) {
    return {
      answer:
        "Fusion help is wired as a first-class response type. The real backend should avoid guessing recipes unless a source-backed fusion fact is retrieved.",
      sections: [
        {
          title: "Fusion Rule",
          content:
            "Exact recipes, skill inheritance, and unlock conditions should come from structured facts. If the database is missing them, the answer should say so.",
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

function normalizeRagResponse(raw: unknown, fallbackSources: ChatResponse["sources"]): ChatResponse {
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
): ChatResponse {
  const topChunks = context.chunks.slice(0, 3);
  return withMode({
    answer:
      "I found source-backed guide records for this question. The response below is using retrieved guide excerpts directly because the chat model could not format a full strategy card.",
    sections: topChunks.map((chunk, index) => ({
      title: chunk.section_title || `Retrieved Record ${index + 1}`,
      content: compactText(chunk.chunk_text),
    })),
    sources: context.sources,
    confidence: topChunks[0]?.similarity ? Math.max(0.35, Math.min(0.8, topChunks[0].similarity)) : 0.55,
    missingInfo: `Retrieved source chunks for "${question}", but final answer generation failed. Use the excerpts as source-backed notes.`,
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

async function directRagResponse(question: string): Promise<ChatResponse | null> {
  if (process.env.USE_MOCK_CHAT === "true" || !hasDirectRagEnv()) {
    return null;
  }

  const [{ buildContext, formatContext }, { createChatCompletion }] = await Promise.all([
    import("../../../src/retrieval/buildContext"),
    import("../../../src/db/client"),
  ]);

  const context = await buildContext(question);
  if (!context.facts.length && !context.chunks.length) {
    return withMode({
      answer:
        "I could not find source-backed records for that question yet. Run ingestion or add a more specific Persona 3 Reload source before trusting an exact answer.",
      sections: [
        {
          title: "No Match",
          content:
            "The route is connected, but Supabase did not return structured facts or vector chunks for this query.",
        },
      ],
      sources: [],
      confidence: 0.2,
      missingInfo: "No matching facts or chunks were retrieved from the RAG database.",
    }, "empty");
  }

  const systemPrompt = `You answer Persona 3 Reload guide questions using only retrieved context.

Return only JSON with this shape:
{
  "answer": "short direct answer",
  "sections": [{"title": "string", "content": "string"}],
  "tables": [{"title": "string", "columns": ["string"], "rows": [["string"]]}],
  "confidence": 0.0,
  "missingInfo": "string"
}

Rules:
- Use structured facts first, then retrieved chunks.
- Be practical, concise, and strategy-first.
- Do not invent exact weaknesses, fusions, dates, floors, rewards, or boss mechanics.
- If the retrieved context is incomplete, say what is missing in missingInfo.
- Keep section content short enough for a mobile chat card.`;

  const userPrompt = `Question: ${question}

${formatContext(context)}

Use only this retrieved context.`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];

  try {
    const rawAnswer = await createChatCompletion(messages, { jsonObject: true }).catch(() => createChatCompletion(messages));
    return withMode(normalizeRagResponse(extractJson(rawAnswer), context.sources), "rag");
  } catch (error) {
    console.error(error);
    return extractiveRagResponse(question, context);
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
    const rag = (await externalRagResponse(question, body.conversationId)) ?? (await directRagResponse(question));
    return NextResponse.json(rag ?? withMode(mockResponse(question), "mock"), { headers: corsHeaders(request) });
  } catch (error) {
    console.error(error);
    return NextResponse.json(withMode(mockResponse(question), "error"), { headers: corsHeaders(request) });
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
