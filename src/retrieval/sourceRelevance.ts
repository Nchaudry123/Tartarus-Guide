export const tartarusBlockNames = ["Thebel", "Arqa", "Yabbashah", "Tziah", "Harabah", "Adamah", "Monad"] as const;

type SourceLike = { title: string; url: string };

/** The Tartarus block a guide page is about, from its title or URL (e.g. "Arqa (Floors 23 - 43)"). */
export function sourceTartarusBlock(source: SourceLike): string | undefined {
  const haystack = `${source.title} ${decodeURIComponent(source.url)}`;
  return tartarusBlockNames.find((block) => new RegExp(`\\b${block}\\b`, "i").test(haystack));
}

/** Normalizes a free-form profile value such as "Thebel Block" or "thebel" to a block name. */
export function playerTartarusBlock(value?: string): string | undefined {
  if (!value) return undefined;
  return tartarusBlockNames.find((block) => new RegExp(`\\b${block}\\b`, "i").test(value));
}

/**
 * Stable re-rank so sources about the player's current block come first, then block-neutral
 * pages (boss guides, wikis), then pages about a different block.
 */
export function rankSourcesForPlayer<T extends SourceLike>(sources: T[], currentBlock?: string): T[] {
  const block = playerTartarusBlock(currentBlock);
  if (!block) return sources;
  const rank = (source: T) => {
    const sourceBlock = sourceTartarusBlock(source);
    if (!sourceBlock) return 1;
    return sourceBlock.toLowerCase() === block.toLowerCase() ? 0 : 2;
  };
  return sources
    .map((source, index) => ({ source, index, rank: rank(source) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ source }) => source);
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** The in-game month a month-walkthrough page covers, e.g. "December Walkthrough and Activities Guide". */
export function sourceCalendarMonth(source: SourceLike): string | undefined {
  return monthNames.find((month) => new RegExp(`\\b${month}\\b`, "i").test(source.title));
}

export function questionCalendarMonth(question: string, profileMonth?: string): string | undefined {
  return (
    monthNames.find((month) =>
      // "may" is also a common verb: only count it capitalised or followed by a day.
      month === "May" ? /\bMay\b|\bmay\s+\d{1,2}\b/.test(question) : new RegExp(`\\b${month}\\b`, "i").test(question),
    ) ??
    monthNames.find((month) => month.toLowerCase() === profileMonth?.trim().toLowerCase())
  );
}

/**
 * For answers without a named subject (day plans, "what should I do"), drop month-walkthrough
 * pages about a different month than the one being asked about: a June plan must not cite
 * the December walkthrough. Month-neutral pages are kept.
 */
export function dropOtherMonthSources<T extends SourceLike>(sources: T[], month?: string): T[] {
  if (!month) return sources;
  return sources.filter((source) => {
    const sourceMonth = sourceCalendarMonth(source);
    return !sourceMonth || sourceMonth.toLowerCase() === month.toLowerCase();
  });
}
