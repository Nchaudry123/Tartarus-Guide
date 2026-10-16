/**
 * Deterministic off-topic gate. A question is treated as off-topic only when it names a
 * clearly non-game subject AND carries no Persona 3 Reload vocabulary, so "Is there a
 * pizza place in P3R?" still reaches the guide while "What's the best pizza topping?"
 * gets one friendly steer back to the game instead of a full LLM answer.
 */

const offTopicSubjects = [
  // food & drink (in-game food spots like Hagakure / Wild-Duck are game terms below)
  "pizza",
  "topping",
  "toppings",
  "pasta",
  "sushi",
  "tacos?",
  "recipe for",
  "how (?:do i|to) (?:cook|bake)",
  "dinner ideas?",
  "cocktail",
  "wine",
  // everyday / real-world topics. Deliberately excludes subjects the game itself has
  // (weather, coffee at Chagall, summer vacation, the student council, romance, …).
  "stock(?:s| market)",
  "crypto(?:currency)?",
  "bitcoin",
  "mortgage",
  "taxes",
  "horoscope",
  "zodiac sign",
  "politic(?:s|al)",
  "nba",
  "nfl",
  "premier league",
  "world cup",
  "super bowl",
  "netflix",
  "tv shows?",
  "lose weight",
  "diet plan",
  "flight to",
  "capital of",
  "homework",
  "essay about",
  "calculus",
  "algebra",
  "python",
  "javascript",
  "typescript",
  "write (?:me )?(?:a |some )?code",
  "sql query",
];

const gameVocabulary = [
  "persona",
  "p3r?",
  "reload",
  "tartarus",
  "shadows?",
  "social links?",
  "s-?links?",
  "arcana",
  "fus(?:e|ion|ing)",
  "velvet room",
  "elizabeth",
  "theodore",
  "igor",
  "sees",
  "yukari",
  "junpei",
  "mitsuru",
  "akihiko",
  "fuuka",
  "aigis",
  "ken",
  "koromaru",
  "shinjiro",
  "gekkoukan",
  "iwatodai",
  "port island",
  "paulownia",
  "dark hour",
  "full moon",
  "thebel",
  "arqa",
  "yabbashah",
  "tziah",
  "harabah",
  "adamah",
  "monad",
  "theurgy",
  "hagakure",
  "wild-?duck",
  "chagall",
  "escapade",
  "dorm",
  "in[- ]?game",
  "the game",
  "this game",
  "protagonist",
  "boss",
  "floor",
  "weak(?:ness)? to",
  "requests?",
  "exams?",
  "academics",
  "charm",
  "courage",
];

const offTopicPattern = new RegExp(`\\b(?:${offTopicSubjects.join("|")})\\b`, "i");
const gamePattern = new RegExp(`\\b(?:${gameVocabulary.join("|")})\\b`, "i");

export function isOffTopicQuestion(question: string): boolean {
  const text = question.trim();
  if (!text) return false;
  return offTopicPattern.test(text) && !gamePattern.test(text);
}

export const offTopicSuggestedPrompts = [
  "What should I do today?",
  "What is Dancing Hand weak to?",
  "Which Social Links should I prioritize?",
];

export function offTopicAnswer(): string {
  return "That one’s outside my Tartarus files — I only know Persona 3 Reload. Want help with a boss, a fusion, or planning your day?";
}
