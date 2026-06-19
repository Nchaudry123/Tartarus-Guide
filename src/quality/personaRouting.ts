const genericCreationTargets = new Set([
  "friends",
  "friend",
  "money",
  "yen",
  "progress",
  "time",
  "food",
  "coffee",
  "plans",
  "team",
  "party",
  "build",
  "social links",
]);

function creationTarget(question: string): string | undefined {
  return question
    .match(
      /\bhow (?:do|can|should|would) i (?:make|create|summon|obtain|get)\s+(?:a|an|the\s+)?([a-z][a-z0-9' -]{1,45}?)(?=\s+(?:with|using|from|at|on)\b|[?.!,]|$)/i,
    )?.[1]
    ?.trim();
}

export function isFusionRecipeRequest(question: string): boolean {
  const text = question.toLowerCase();
  if (
    /\b(?:how (?:do|can|should|would) i fuse|possible fusions?|show me (?:possible )?fusions?|fusion recipes?|recipe for|recipes for|fusion route|fusion routes|ways? to fuse|ingredients? for|parents? for|ingredients? (?:do|would|should) i need for|what (?:are|would be) the ingredients? for)\b/.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /\bwhat (?:does|do|will|would|can)\b.{1,90}\b(?:and|plus|\+)\b.{1,90}\b(?:make|create|fuse into|become|result in)\b/.test(
      text,
    ) ||
    /\bdoes\b.{1,90}\b(?:and|plus|\+)\b.{1,90}\b(?:fuse into|make|create|become)\b/.test(
      text,
    ) ||
    /\b(?:turn|combine)\b.{1,90}\b(?:and|plus|\+)\b.{1,90}\b(?:into|to make|to create)\b/.test(
      text,
    )
  ) {
    return true;
  }

  const target = creationTarget(question)?.toLowerCase();
  return Boolean(target && !genericCreationTargets.has(target));
}

export function isPersonaKnowledgeRequest(question: string): boolean {
  const text = question.toLowerCase();
  return (
    isFusionRecipeRequest(question) ||
    /\bpersona\b/.test(text) ||
    /\b(?:arcana|compendium|heart item|skill inheritance|inheritance type|base level|base stats|affinities)\b/.test(
      text,
    ) ||
    /\b(?:worth (?:getting|fusing|using)|good to (?:get|fuse|use)|should i (?:get|fuse|use)|is .{1,45} (?:good|worth it|viable))\b/.test(
      text,
    ) ||
    /\b(?:stats?|skills?|build|affinities|weaknesses|resistances)\s+(?:for|of)\s+[a-z][a-z0-9' -]{2,45}(?:[?.!,]|$)/i.test(
      question,
    )
  );
}
