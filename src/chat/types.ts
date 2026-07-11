import type { PlayerProfile } from "../../lib/types";

export type CompanionIntent =
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

export type CompanionAnalysis = {
  intent: CompanionIntent;
  retrievalQuery: string;
  isAmbiguous: boolean;
  followUpQuestions: string[];
  profileUpdates: PlayerProfile;
  profile: PlayerProfile;
  spoilerCaution: boolean;
};

export type ControllerAction =
  | "answer_directly"
  | "ask_clarifying_question"
  | "search_guides"
  | "search_structured_facts"
  | "search_both";

export type ControllerDecision = {
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
