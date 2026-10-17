import { supabase } from "../db/client";
import { repairSourceUrl } from "../retrieval/sourceUrls";

/**
 * Checks that every indexed source URL (as shown to players, after repairs) still loads.
 * Usage: npm run sources:check
 */
async function main() {
  const { data, error } = await supabase.from("sources").select("url").limit(5000);
  if (error) throw error;
  const urls = [...new Set((data ?? []).map((row) => repairSourceUrl(row.url as string)))];
  const dead: string[] = [];
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (queue.length) {
        const url = queue.shift()!;
        try {
          const response = await fetch(url, {
            redirect: "follow",
            headers: { "user-agent": "Mozilla/5.0 (Tartarus Guide link check)" },
            signal: AbortSignal.timeout(15_000),
          });
          if (response.status >= 400) dead.push(`${response.status} ${url}`);
        } catch (error) {
          dead.push(`ERR ${url} (${error instanceof Error ? error.name : "unknown"})`);
        }
      }
    }),
  );
  console.log(`Checked ${urls.length} source URLs: ${urls.length - dead.length} live, ${dead.length} dead.`);
  for (const line of dead) console.log(`  ${line}`);
  if (dead.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
