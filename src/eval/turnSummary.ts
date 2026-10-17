/** Plain-text summary of chat_turn_logs rows; kept separate from the DB read so it can be tested. */

export type TurnSummaryInput = {
  turns: Array<{
    id: string;
    chat_mode: string;
    route: string;
    outcome: string;
    intent: string | null;
    agent_tools: unknown;
    safety_net: boolean;
    agent_fallback: boolean;
    total_ms: number;
    llm_calls: number;
  }>;
  feedback: Array<{ turn_id: string | null; rating: number }>;
};

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "-");

function countBy<T>(items: T[], key: (item: T) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

export function summarizeTurns({ turns, feedback }: TurnSummaryInput): string {
  if (!turns.length) return "No turns logged in this window.";
  const lines: string[] = [];
  const latency = (rows: TurnSummaryInput["turns"]) => {
    const ms = rows.map((row) => row.total_ms);
    return `p50 ${seconds(percentile(ms, 50))}  p90 ${seconds(percentile(ms, 90))}`;
  };
  const ratingByTurn = new Map(feedback.filter((row) => row.turn_id).map((row) => [row.turn_id!, row.rating]));

  lines.push(`Turns: ${turns.length}   latency ${latency(turns)}   LLM calls/turn ${(turns.reduce((sum, row) => sum + row.llm_calls, 0) / turns.length).toFixed(2)}`);
  lines.push(`Modes: ${countBy(turns, (row) => row.chat_mode).map(([mode, n]) => `${mode} ${n}`).join(", ")}`);

  lines.push("", "Route            turns   share   latency              thumbs-down");
  for (const [route, n] of countBy(turns, (row) => row.route)) {
    const rows = turns.filter((row) => row.route === route);
    const rated = rows.filter((row) => ratingByTurn.has(row.id));
    const down = rated.filter((row) => ratingByTurn.get(row.id) === -1).length;
    lines.push(
      `${route.padEnd(16)} ${String(n).padStart(5)}   ${pct(n, turns.length).padStart(6)}   ${latency(rows).padEnd(20)} ${rated.length ? `${down}/${rated.length}` : "-"}`,
    );
  }

  lines.push("", `Outcomes: ${countBy(turns, (row) => row.outcome).map(([outcome, n]) => `${outcome} ${n} (${pct(n, turns.length)})`).join(", ")}`);

  const agentTurns = turns.filter((row) => row.route === "agent");
  if (agentTurns.length || turns.some((row) => row.agent_fallback)) {
    const fallbacks = turns.filter((row) => row.agent_fallback).length;
    const tools = agentTurns.flatMap((row) => (Array.isArray(row.agent_tools) ? row.agent_tools.map(String) : []));
    lines.push(
      "",
      `Agent: ${agentTurns.length} routed, safety net ${pct(agentTurns.filter((row) => row.safety_net).length, agentTurns.length)}, fallbacks ${fallbacks}`,
      `Agent tools: ${countBy(tools, (tool) => tool).map(([tool, n]) => `${tool} ${n}`).join(", ") || "none"}`,
    );
  }

  const nonAnswers = turns.filter((row) => row.outcome === "no_evidence" || row.outcome === "error");
  if (nonAnswers.length) {
    lines.push("", "Intents with the most missing-evidence or error turns:");
    for (const [intent, n] of countBy(nonAnswers, (row) => row.intent ?? "(none)").slice(0, 5)) {
      lines.push(`  ${intent}: ${n} of ${turns.filter((row) => (row.intent ?? "(none)") === intent).length}`);
    }
  }

  const rated = turns.filter((row) => ratingByTurn.has(row.id));
  if (rated.length) {
    const down = rated.filter((row) => ratingByTurn.get(row.id) === -1).length;
    lines.push("", `Rated turns: ${rated.length} (${pct(rated.length, turns.length)} of turns), thumbs-down ${down} (${pct(down, rated.length)})`);
  }
  return lines.join("\n");
}
