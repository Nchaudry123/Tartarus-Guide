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

export type BossPrepCard = {
  boss: string;
  weakness?: string;
  avoid?: string;
  recommendedLevel?: string;
  party?: string;
  danger?: string;
  plan?: string;
};

export type FusionIngredient = {
  name: string;
  owned: boolean;
};

export type FusionRecipeCard = {
  ingredients: FusionIngredient[];
  special: boolean;
  ready: boolean;
};

export type FusionWorkshop = {
  target: string;
  dlcMode: "none" | "all";
  recipes: FusionRecipeCard[];
};

export type ChatRequest = {
  question: string;
  conversationId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  playerProfile?: PlayerProfile;
  debug?: boolean;
  stream?: boolean;
};

export type PlayerProfile = {
  currentMonth?: string;
  currentDate?: string;
  currentLevel?: string;
  difficulty?: string;
  activeParty?: string[];
  recentBoss?: string;
  recentEnemy?: string;
  tartarusBlock?: string;
  tartarusFloor?: string;
  currentSocialLinks?: string[];
  ownedPersonas?: string[];
  dlcOwnership?: "none" | "all";
  socialStats?: {
    academics?: string;
    charm?: string;
    courage?: string;
  };
  playstyle?: string;
  currentGoal?: string;
  spoilerPreference?: "strict" | "progress-aware" | "open";
};

export type ChatResponse = {
  answer: string;
  sections?: ChatSection[];
  tables?: ChatTable[];
  bossPrep?: BossPrepCard;
  fusionWorkshop?: FusionWorkshop;
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
    groundingStatus?: "verified" | "partial" | "insufficient";
    guardrailNotes?: string[];
    spoilerMode?: "strict" | "progress-aware" | "open";
  };
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: ChatResponse;
  createdAt: number;
};
