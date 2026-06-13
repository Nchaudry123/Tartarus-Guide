import "dotenv/config";
import { curatedSources } from "./urls";
import { discoverSources } from "./discoverSources";
import { fetchPages } from "./fetchPages";
import { extractContent } from "./extractContent";
import { chunkExtractedPage } from "./chunkText";
import { embedAndInsertChunks } from "./embedChunks";
import { extractAndInsertFacts, isFactCandidate } from "./extractFacts";
import { loadGapTargetCategories } from "./gapTargets";

const hasFlag = (flag: string): boolean => process.argv.includes(flag);
const numberArg = (name: string, fallback: number): number => {
  const value = process.argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1];
  return value ? Number(value) : fallback;
};

const force = hasFlag("--force");
const sync = hasFlag("--sync");
const skipFacts = hasFlag("--skip-facts");
const noDiscover = hasFlag("--no-discover");
const dryRun = hasFlag("--dry-run");
const listSources = hasFlag("--list-sources");
const targetGaps = hasFlag("--target-gaps");
const maxPages = numberArg("--max-pages", 200);
const maxFactChunks = numberArg("--max-fact-chunks", 450);
const gapAreaLimit = numberArg("--gap-area-limit", Number.POSITIVE_INFINITY);
const categoriesArg = process.argv.find((arg) => arg.startsWith("--categories="))?.split("=")[1];
const categories = categoriesArg?.split(",").map((value) => value.trim()).filter(Boolean);
const gapReportPath = process.argv.find((arg) => arg.startsWith("--gap-report="))?.split("=")[1] ??
  "evals/results/coverage-gaps-latest.json";

async function main(): Promise<void> {
  const gapTargets = targetGaps
    ? await loadGapTargetCategories(
        gapReportPath,
        Number.isFinite(gapAreaLimit) ? gapAreaLimit : undefined,
      )
    : null;
  if (gapTargets) {
    console.log(
      `Targeting weak areas: ${gapTargets.areas.join(", ")} ` +
        `(${gapTargets.categories.join(", ")}).`,
    );
  }
  const sources = noDiscover
    ? curatedSources
        .filter(
          (source) =>
            (!categories?.length || categories.includes(source.category)) &&
            (!gapTargets || gapTargets.categories.includes(source.category)),
        )
        .slice(0, maxPages)
    : await discoverSources(curatedSources, {
        maxPages,
        force,
        categories: gapTargets?.categories,
      });

  if (listSources) {
    for (const source of sources) {
      console.log(
        `${String(source.credibilityRank).padStart(2)} ${source.category.padEnd(18)} ${source.title} ${source.url}`,
      );
    }
    return;
  }

  console.log(`Fetching ${sources.length} sources${force ? " with cache refresh" : ""}...`);
  const pages = await fetchPages(sources, force);
  const extracted = pages.map(({ source, html }) => extractContent(source, html));
  const chunks = extracted.flatMap(chunkExtractedPage);
  const candidateFacts = chunks.filter(isFactCandidate);

  console.log(
    `Prepared ${chunks.length} retrieval chunks from ${pages.length} pages; ${candidateFacts.length} are fact candidates.`,
  );
  if (dryRun) return;

  const chunkChanges = await embedAndInsertChunks(chunks, { sync });
  console.log(
    `Inserted ${chunkChanges.inserted} new chunks${sync ? ` and removed ${chunkChanges.deleted} stale chunks` : ""}.`,
  );

  if (!skipFacts) {
    const changedFacts = await extractAndInsertFacts(chunks, {
      maxFactChunks,
      categories: categories ?? gapTargets?.categories,
    });
    console.log(`Inserted or refreshed ${changedFacts} facts.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
