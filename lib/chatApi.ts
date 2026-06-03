import type { ChatRequest, ChatResponse } from "./types";

export async function sendChatQuestion(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Chat request failed.");
  }

  return (await response.json()) as ChatResponse;
}
