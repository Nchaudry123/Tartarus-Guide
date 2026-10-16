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
