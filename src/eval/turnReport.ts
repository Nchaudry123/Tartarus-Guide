import "dotenv/config";
import { supabase } from "../db/client";
import { summarizeTurns, type TurnSummaryInput } from "./turnSummary";

/**
 * Summarizes recent player traffic from chat_turn_logs: how turns were routed, how they ended,
 * latency, how often the agent needed the safety net or fell back, and thumbs-down rates.
 *   npm run turns:report -- --days=7
 */
const days = Number(process.argv.find((arg) => arg.startsWith("--days="))?.split("=")[1] ?? "7");
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const turns: TurnSummaryInput["turns"] = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await supabase
    .from("chat_turn_logs")
    .select("id,chat_mode,route,outcome,intent,agent_tools,safety_net,agent_fallback,total_ms,llm_calls")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .range(offset, offset + 999);
  if (error) {
    console.error("Could not read chat_turn_logs (has the migration been applied?).");
    process.exit(1);
  }
  turns.push(...(data ?? []));
  if (!data || data.length < 1000 || turns.length >= 20_000) break;
}

const { data: feedback, error: feedbackError } = await supabase
  .from("answer_feedback")
  .select("turn_id,rating")
  .gte("created_at", since)
  .not("turn_id", "is", null)
  .limit(5000);
if (feedbackError) console.error("Could not read answer_feedback; ratings left out.");

console.log(`Last ${days} day(s)\n`);
console.log(summarizeTurns({ turns, feedback: feedback ?? [] }));
