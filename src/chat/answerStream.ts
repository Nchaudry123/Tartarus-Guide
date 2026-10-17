/**
 * Live streaming for a model reply that arrives as JSON ({"answer": "...", ...}).
 *
 * 1. createAnswerExtractor pulls the "answer" string out of the JSON while it is still being
 *    written, decoding escapes that may be split across chunks.
 * 2. createSentenceGate releases that text one complete sentence at a time, and only after the
 *    caller's check accepts everything released so far. The first failing sentence (or a second
 *    question) stops the stream; the finished, guard-checked reply then replaces the preview.
 */

export type AnswerExtractor = {
  /** Feed the next raw chunk; returns newly decoded answer text (possibly empty). */
  push: (chunk: string) => string;
  /** True once the closing quote of "answer" has arrived. */
  readonly done: boolean;
};

export function createAnswerExtractor(): AnswerExtractor {
  let state: "seeking" | "inString" | "done" = "seeking";
  let pending = ""; // raw text not yet consumed
  const keyPattern = /"answer"\s*:\s*"/;

  const push = (chunk: string): string => {
    if (state === "done") return "";
    pending += chunk;
    if (state === "seeking") {
      const match = keyPattern.exec(pending);
      if (!match) {
        // Keep only enough tail to recognise a key split across chunks.
        if (pending.length > 64) pending = pending.slice(-64);
        return "";
      }
      pending = pending.slice(match.index + match[0].length);
      state = "inString";
    }

    let out = "";
    let index = 0;
    while (index < pending.length) {
      const char = pending[index];
      if (char === '"') {
        state = "done";
        pending = "";
        return out;
      }
      if (char !== "\\") {
        out += char;
        index += 1;
        continue;
      }
      // Escape sequence: wait for the rest if it was split across chunks.
      const next = pending[index + 1];
      if (next === undefined) break;
      if (next === "u") {
        const hex = pending.slice(index + 2, index + 6);
        if (hex.length < 4) break;
        out += /^[0-9a-fA-F]{4}$/.test(hex) ? String.fromCharCode(parseInt(hex, 16)) : "";
        index += 6;
        continue;
      }
      const simple: Record<string, string> = { n: "\n", t: "\t", r: "", '"': '"', "\\": "\\", "/": "/", b: "", f: "" };
      out += simple[next] ?? next;
      index += 2;
    }
    pending = pending.slice(index);
    return out;
  };
  return {
    push,
    get done() {
      return state === "done";
    },
  };
}

export type SentenceGate = {
  push: (text: string) => void;
  /** Release any final unterminated sentence (if it passes) once the answer is complete. */
  finish: () => void;
  readonly halted: boolean;
  readonly released: string;
};

// A sentence ends at . ! ? (plus closing quotes/brackets) followed by whitespace, or at a newline.
const sentenceEnd = /[.!?…]+["')\]]*(?=\s)|\n/g;

export function createSentenceGate(options: {
  /** Returns true when all of `text` (everything that would be visible) is safe to show. */
  accept: (text: string) => boolean;
  emit: (chunk: string) => void;
  maxQuestions?: number;
}): SentenceGate {
  const maxQuestions = options.maxQuestions ?? 1;
  let buffer = "";
  let released = "";
  let halted = false;
  let questions = 0;

  const tryRelease = (piece: string): boolean => {
    if (!piece) return true;
    const asks = (piece.match(/\?/g) ?? []).length;
    if (questions + asks > maxQuestions) return false;
    if (!options.accept(released + piece)) return false;
    questions += asks;
    released += piece;
    options.emit(piece);
    return true;
  };

  return {
    push(text: string) {
      if (halted || !text) return;
      buffer += text;
      sentenceEnd.lastIndex = 0;
      let cut = -1;
      let match: RegExpExecArray | null;
      while ((match = sentenceEnd.exec(buffer))) cut = match.index + match[0].length;
      if (cut <= 0) return;
      // Include the whitespace after the last complete sentence so spacing stays natural.
      while (cut < buffer.length && /[ \t]/.test(buffer[cut])) cut += 1;
      const ready = buffer.slice(0, cut);
      buffer = buffer.slice(cut);
      if (!tryRelease(ready)) halted = true;
    },
    finish() {
      if (halted) return;
      if (!tryRelease(buffer)) halted = true;
      buffer = "";
    },
    get halted() {
      return halted;
    },
    get released() {
      return released;
    },
  };
}

/**
 * The model occasionally writes malformed JSON ('...strategy., sections": [], ...'), and the
 * raw text used to reach the player. Keep just the answer string, minus any key fragment the
 * model folded into it.
 */
export function salvageAnswerFromBrokenJson(text: string): string | null {
  if (!/"answer"\s*:\s*"/.test(text)) return null;
  const answer = createAnswerExtractor().push(text)
    .replace(/,?\s*"?(?:sections|tables|recommendation|confidence|missingInfo|suggestedReplies|suggestedPrompts)"?\s*$/i, "")
    .trim();
  return answer || null;
}
