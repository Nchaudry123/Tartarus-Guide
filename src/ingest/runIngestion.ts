import "dotenv/config";
import { curatedSources } from "./urls";
import { fetchPages } from "./fetchPages";
import { extractContent } from "./extractContent";
import { chunkExtractedPage } from "./chunkText";
import { embedAndInsertChunks } from "./embedChunks";
import { extractAndInsertFacts } from "./extractFacts";

const force = process.argv.includes("--force");
const skipFacts = process.argv.includes("--skip-facts");

async function main(): Promise<void> {
  console.log(`Fetching ${curatedSources.length} curated sources${force ? " with cache refresh" : ""}...`);
  const pages = await fetchPages(curatedSources, force);
  console.log(`Fetched or loaded ${pages.length} pages.`);

  const extracted = pages.map(({ source, html }) => extractContent(source, html));
  const chunks = extracted.flatMap(chunkExtractedPage);
  console.log(`Prepared ${chunks.length} retrieval chunks.`);

  const insertedChunks = await embedAndInsertChunks(chunks);
  console.log(`Inserted ${insertedChunks} new chunks.`);

  if (!skipFacts) {
    const insertedFacts = await extractAndInsertFacts(chunks);
    console.log(`Inserted or refreshed ${insertedFacts} facts.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
