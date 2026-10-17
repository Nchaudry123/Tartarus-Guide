/**
 * Keeps at most `max` question sentences in a chat reply, dropping the later ones. Models
 * often stack a second question or an option menu ("Tartarus, bosses, or something else?")
 * after the real one; one question per turn reads like a conversation, two read like a form.
 * Statements, line breaks and list items are left untouched.
 */
export function limitQuestions(text: string, max = 1): string {
  if (!text) return text;
  const questionSentence = /[^.!?\n]*\?+["')\]]*[ \t]*/g;
  let seen = 0;
  const limited = text.replace(questionSentence, (sentence) => {
    if (!sentence.trim()) return sentence;
    seen += 1;
    return seen <= max ? sentence : "";
  });
  return limited
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * True when a reply only asks the player something ("What are you trying to fuse it for?"),
 * with at most a short lead-in that names nothing specific. Such replies cite no sources.
 */
export function isPureClarifyingQuestion(response: {
  answer: string;
  sections?: unknown[];
  tables?: unknown[];
  recommendation?: unknown;
}): boolean {
  if (response.sections?.length || response.tables?.length || response.recommendation) return false;
  const sentences = response.answer.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  if (!sentences.some((sentence) => sentence.endsWith("?"))) return false;
  const statements = sentences.filter((sentence) => !sentence.endsWith("?"));
  const genericWords = /^(?:I|I'd|I'm|I'll|Persona|Personas|Tartarus|Social|Links?|Full|Moon|DLC|P3R|Reload)$/;
  return (
    statements.length <= 1 &&
    statements.every(
      (sentence) =>
        sentence.length <= 160 &&
        !/\d/.test(sentence) &&
        sentence
          .split(/\s+/)
          .slice(1)
          .every((word) => !/^[A-Z]/.test(word) || genericWords.test(word.replace(/[^\w']/g, ""))),
    )
  );
}
