/**
 * Without JSON mode (which is off while streaming), the model sometimes writes its reply as
 * labelled plain text ("... Recommendation: - Title: ... Confidence: 0.9 Missing Info: ...")
 * instead of JSON. Those labels are fields, not part of the reply: this keeps the reply and
 * recovers the fields worth keeping.
 */

const fieldLabels = [
  "Recommendation",
  "Confidence",
  "Missing Info",
  "Missing Information",
  "Suggested Replies",
  "Suggested Prompts",
  "Follow-up Questions",
  "Sections",
  "Tables",
  "Sources",
  // One-word JSON key spellings the model also writes as labels.
  "SuggestedReplies",
  "suggestedReplies",
  "SuggestedPrompts",
  "suggestedPrompts",
  "MissingInfo",
  "missingInfo",
  "FollowUpQuestions",
  "followUpQuestions",
];

/**
 * A field label as the model writes it: Title Case and followed by a colon, at a line start or
 * mid-line (it sometimes runs them inline). Case-sensitive, so prose like "my recommendation:"
 * is not a label.
 */
export const fieldLabelPattern = new RegExp(
  `(?:^|\\s)(?:-\\s*)?\\**(?:${fieldLabels.map((label) => label.replace(/ /g, "\\s+")).join("|")})\\**\\s*:`,
);

export type PlainReply = {
  answer: string;
  missingInfo?: string;
  suggestedReplies: string[];
  confidence?: number;
};

function fieldValue(text: string, label: string): string | undefined {
  const match = new RegExp(`${label.replace(/ /g, "\\s+")}\\**\\s*:\\s*([\\s\\S]*?)(?=${fieldLabelPattern.source}|$)`).exec(text);
  return match?.[1]?.trim() || undefined;
}

/** Keeps paragraph breaks and list lines; collapses runs of spaces within a line. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parsePlainReply(raw: string): PlainReply {
  const text = raw.replace(/^\s*```(?:json|text)?\s*/i, "").replace(/\s*```\s*$/, "");
  const cut = fieldLabelPattern.exec(text);
  const fields = cut ? text.slice(cut.index) : "";
  const lead = tidy((cut ? text.slice(0, cut.index) : text).replace(/^\s*\**\s*answer\s*\**\s*:\s*/i, ""));
  // A reply that opens with a label ("Recommendation: fuse Orpheus") keeps that text.
  const answer = lead || tidy(fieldValue(fields, "Recommendation") ?? text);
  const replies = fieldValue(fields, "Suggested Replies") ?? fieldValue(fields, "Suggested Prompts") ?? "";
  const quoted = [...replies.matchAll(/["“]([^"”\n]{3,120})["”]/g)].map((match) => match[1]!.trim());
  const suggestedReplies = (quoted.length ? quoted : replies.split(/\n|\s-\s/).map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim()))
    .filter((reply) => reply.length >= 3 && reply.length <= 120)
    .slice(0, 3);
  const confidence = Number(fieldValue(fields, "Confidence")?.match(/0?\.\d+|1(?:\.0+)?/)?.[0]);
  const missingInfo = fieldValue(fields, "Missing Info") ?? fieldValue(fields, "Missing Information");
  return {
    answer,
    suggestedReplies,
    ...(missingInfo ? { missingInfo: tidy(missingInfo).slice(0, 400) } : {}),
    ...(Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? { confidence } : {}),
  };
}

/** Trims a long reply at a sentence or line boundary instead of mid-word. */
export function clipReply(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const head = text.slice(0, maxLength);
  const boundary = Math.max(head.lastIndexOf(". "), head.lastIndexOf("\n"), head.lastIndexOf("! "), head.lastIndexOf("? "));
  return (boundary > maxLength * 0.5 ? head.slice(0, boundary + 1) : `${head.trim()}…`).trim();
}

/**
 * Puts a list the model started mid-line ("...battle. - Keep Tartarus steady\n- Stock items")
 * on its own line so it renders as a list. Only when a second "- " item follows on a new line,
 * so a dash inside a sentence is left alone.
 */
export function separateInlineList(text: string): string {
  return text.replace(/([.!?:])[ \t]+-[ \t]+(?=[^\n]+\n[ \t]*-[ \t]+\S)/g, "$1\n- ");
}

/** Drops labelled fields the model folded into a reply ("... SuggestedReplies: What ..."). */
export function withoutFieldLabels(answer: string): string {
  const cut = fieldLabelPattern.exec(answer);
  return cut && cut.index > 0 ? tidy(answer.slice(0, cut.index)) : answer;
}
