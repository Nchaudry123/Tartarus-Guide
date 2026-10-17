import type { AgentMessage, ToolCall, ToolDefinition } from "../db/client";

/**
 * A small tool-calling agent loop. The model chooses which tool to call next (fact lookup,
 * guide search, or a clarifying question back to the player), reads the result, and either
 * calls another tool or writes the final answer. The loop is capped so a reply never takes
 * more than `maxSteps` model rounds; on the last round tools are disabled and the model must
 * answer with what it has.
 */

export type AgentToolResult = {
  /** What the model sees. */
  content: string;
  /** Ends the loop immediately (a clarifying question goes straight to the player). */
  terminal?: boolean;
};

export type AgentTool = ToolDefinition & {
  run: (args: Record<string, unknown>) => Promise<AgentToolResult>;
  /** Short progress text for the UI, e.g. "Checking the fusion chart". */
  progress?: (args: Record<string, unknown>) => string;
};

export type AgentStep = { tool: string; args: Record<string, unknown>; ok: boolean };

export type AgentComplete = (
  messages: AgentMessage[],
  tools: ToolDefinition[],
  options: { toolChoice: "auto" | "none" | "required"; timingLabel: string },
) => Promise<{ content: string | null; toolCalls: ToolCall[] }>;

export type AgentOutcome =
  | { kind: "answer"; content: string; steps: AgentStep[] }
  | { kind: "terminal"; tool: string; args: Record<string, unknown>; content: string; steps: AgentStep[] };

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function runAgentLoop(input: {
  system: string;
  user: string;
  tools: AgentTool[];
  complete: AgentComplete;
  maxSteps?: number;
  /** Make the first round call a tool (look something up or ask) instead of answering from memory. */
  requireToolFirst?: boolean;
  /**
   * Checked after each round of tool results. True ends the loop without another model call,
   * for when the gathered evidence is already enough (saves the "I'm done" round trip).
   */
  shouldStop?: () => boolean;
  onProgress?: (text: string) => void;
}): Promise<AgentOutcome> {
  const maxSteps = input.maxSteps ?? 4;
  const definitions = input.tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
  const byName = new Map(input.tools.map((tool) => [tool.name, tool]));
  const messages: AgentMessage[] = [
    { role: "system", content: input.system },
    { role: "user", content: input.user },
  ];
  const steps: AgentStep[] = [];

  let nudged = false;
  for (let round = 0; round < maxSteps; round += 1) {
    const lastRound = round === maxSteps - 1;
    // tool_choice "required" isn't honored by every provider (some return an empty reply), so
    // a skipped lookup gets one explicit nudge instead.
    let reply = await input.complete(messages, definitions, {
      toolChoice: lastRound ? "none" : "auto",
      timingLabel: lastRound ? "agent-final" : `agent-step-${round + 1}`,
    });
    if (round === 0 && input.requireToolFirst && !reply.toolCalls.length && !nudged) {
      nudged = true;
      messages.push({ role: "user", content: "Look it up first: call lookup_facts or search_guides (or ask_clarifying_question if a detail is truly missing)." });
      reply = await input.complete(messages, definitions, { toolChoice: "auto", timingLabel: "agent-step-1-retry" });
    }
    if (!reply.toolCalls.length || lastRound) {
      return { kind: "answer", content: reply.content ?? "", steps };
    }

    messages.push({
      role: "assistant",
      content: reply.content,
      tool_calls: reply.toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    });
    // Tool calls from one round run in parallel; results go back in the order they were asked.
    const results = await Promise.all(
      reply.toolCalls.map(async (call) => {
        const tool = byName.get(call.name);
        const args = parseArgs(call.arguments);
        if (!tool) return { call, args, ok: false, result: { content: `Unknown tool "${call.name}".` } as AgentToolResult };
        if (tool.progress) input.onProgress?.(tool.progress(args));
        try {
          return { call, args, ok: true, result: await tool.run(args) };
        } catch (error) {
          return {
            call,
            args,
            ok: false,
            result: { content: `The ${call.name} tool failed: ${error instanceof Error ? error.message : "unknown error"}.` } as AgentToolResult,
          };
        }
      }),
    );
    for (const { call, args, ok, result } of results) {
      steps.push({ tool: call.name, args, ok });
      if (result.terminal) {
        return { kind: "terminal", tool: call.name, args, content: result.content, steps };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
    }
    if (input.shouldStop?.()) return { kind: "answer", content: "", steps };
  }
  return { kind: "answer", content: "", steps };
}
