import { NextResponse } from "next/server";
import type { ChatRequest, ChatResponse } from "../../../lib/types";

const mockSources = [
  {
    title: "Persona 3 Reload Wiki Guide",
    url: "https://www.ign.com/wikis/persona-3-reload/",
    domain: "ign.com",
  },
];

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

async function realRagResponse(question: string, conversationId?: string): Promise<ChatResponse | null> {
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

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ChatRequest>;
  const question = body.question?.trim();

  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

  try {
    const rag = await realRagResponse(question, body.conversationId);
    return NextResponse.json(rag ?? mockResponse(question));
  } catch (error) {
    console.error(error);
    return NextResponse.json(mockResponse(question));
  }
}
