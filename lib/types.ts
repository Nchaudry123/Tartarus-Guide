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
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  playerProfile?: PlayerProfile;
  debug?: boolean;
};

export type PlayerProfile = {
  currentMonth?: string;
  currentLevel?: string;
  difficulty?: string;
  activeParty?: string[];
  recentBoss?: string;
  currentSocialLinks?: string[];
  playstyle?: string;
};

export type ChatResponse = {
  answer: string;
  sections?: ChatSection[];
  tables?: ChatTable[];
  sources: ChatSource[];
  confidence?: number;
  missingInfo?: string;
  retrievalMode?: "rag" | "empty" | "mock" | "error";
  companion?: {
    intent?: string;
    profileUpdates?: PlayerProfile;
    followUpQuestions?: string[];
    suggestedPrompts?: string[];
  };
  diagnostics?: {
    retrievalQueries?: string[];
    factCount?: number;
    chunkCount?: number;
  };
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: ChatResponse;
  createdAt: number;
};
