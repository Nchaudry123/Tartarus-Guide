export type ChatSource = {
  title: string;
  url: string;
  domain: string;
};

export type ChatSection = {
  title: string;
  content: string;
};

export type ChatTable = {
  title: string;
  columns: string[];
  rows: string[][];
};

export type ChatRequest = {
  question: string;
  conversationId?: string;
};

export type ChatResponse = {
  answer: string;
  sections?: ChatSection[];
  tables?: ChatTable[];
  sources: ChatSource[];
  confidence?: number;
  missingInfo?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: ChatResponse;
  createdAt: number;
};
