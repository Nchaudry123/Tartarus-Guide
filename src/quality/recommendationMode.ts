export function asksForRecommendation(question: string): boolean {
  const text = question.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    /\b(?:recommend|recommendation|best|better|priority|prioritize|pick|choose|choice)\b/.test(
      text,
    ) ||
    /\b(?:what|which|who)\b.{0,45}\bshould i\b.{0,45}\b(?:use|bring|fuse|do|pick|choose|focus|prioritize|replace)\b/.test(
      text,
    ) ||
    /\bshould i\b.{0,45}\b(?:use|bring|fuse|pick|choose|focus on|prioritize|replace)\b/.test(
      text,
    ) ||
    /\bshould\s+[a-z][a-z' -]{1,35}\s+or\s+[a-z][a-z' -]{1,35}\s+be\s+(?:my|the)\b/.test(
      text,
    ) ||
    /\b[a-z][a-z' -]{1,35}\s+or\s+[a-z][a-z' -]{1,35}\b.{0,35}\b(?:healer|support|damage dealer|party member|persona)\b/.test(
      text,
    ) ||
    /\bwhat should i do (?:today|next|first|now)\b/.test(text)
  );
}
