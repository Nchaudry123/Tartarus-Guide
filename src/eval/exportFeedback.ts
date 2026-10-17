import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { supabase } from "../db/client";

/**
 * Exports recent thumbs-down answers as draft eval cases for review. Nothing is added to
 * evals/persona3-reload.json automatically: copy the cases you agree with and add expectations
 * (mustInclude/mustNotInclude) by hand.
 *   npm run feedback:export -- --days=14
 */
const days = Number(process.argv.find((arg) => arg.startsWith("--days="))?.split("=")[1] ?? "14");
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const { data, error } = await supabase
  .from("answer_feedback")
  .select("id,created_at,rating,question,answer,intent,history,player_profile,note")
  .eq("rating", -1)
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(200);
if (error) {
  console.error("Could not read answer_feedback (has the migration been applied?).");
  process.exit(1);
}

const cases = (data ?? []).map((row) => ({
  id: `feedback-${String(row.id).slice(0, 8)}`,
  category: "feedback",
  origin: "curated",
  question: row.question,
  history: row.history,
  playerProfile: row.player_profile,
  // For the reviewer: what the guide said and why it was flagged.
  flaggedAnswer: row.answer,
  flaggedIntent: row.intent,
  flaggedNote: row.note,
  flaggedAt: row.created_at,
}));

await mkdir("evals/results", { recursive: true });
await writeFile("evals/results/feedback-candidates.json", `${JSON.stringify(cases, null, 2)}\n`);
console.log(`Exported ${cases.length} thumbs-down answer(s) from the last ${days} days to evals/results/feedback-candidates.json`);
