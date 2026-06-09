import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { ChatRequest, ChatResponse, PlayerProfile } from "../../lib/types";

type EvalCase = {
  id: string;
  category: string;
  question: string;
  history?: ChatRequest["history"];
  playerProfile?: PlayerProfile;
  expectedIntent?: string;
  shouldUseSources?: boolean;
  shouldClarify?: boolean;
  requiredDomains?: string[];
  mustIncludeAny?: string[];
  forbidUnsupportedExactness?: boolean;
};

type Check = { name: string; passed: boolean; detail: string };

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const apiUrl = args.get("url") ?? process.env.EVAL_API_URL ?? "http://127.0.0.1:3000/api/chat";
const category = args.get("category");
const limit = Number(args.get("limit") ?? Number.POSITIVE_INFINITY);
const failUnder = Number(args.get("fail-under") ?? "0.8");
const delayMs = Number(args.get("delay-ms") ?? "4000");

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function textOf(response: ChatResponse): string {
  return [
    response.answer,
    ...(response.sections ?? []).flatMap((section) => [section.title, section.content]),
    ...(response.tables ?? []).flatMap((table) => [table.title, ...table.columns, ...table.rows.flat()]),
  ].join(" ");
}

function evaluate(test: EvalCase, response: ChatResponse): Check[] {
  const answerText = textOf(response);
  const normalized = answerText.toLowerCase();
  const checks: Check[] = [];
  const add = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail });

  add("non-empty answer", answerText.trim().length >= 12, `${answerText.length} characters`);
  add(
    "no backend language",
    !/\b(retriev(?:e|ed|al)|database|supabase|provided context|guide context|language model|groq)\b/i.test(answerText),
    "Answer should not expose implementation mechanics.",
  );
  add(
    "reasonable length",
    answerText.length <= 3_500,
    `${answerText.length} characters`,
  );

  if (test.expectedIntent) {
    add(
      "intent",
      response.companion?.intent === test.expectedIntent,
      `expected=${test.expectedIntent}, actual=${response.companion?.intent ?? "missing"}`,
    );
  }
  if (test.shouldUseSources === true) {
    add("uses sources", response.sources.length > 0, `${response.sources.length} source(s)`);
  }
  if (test.shouldUseSources === false) {
    add("avoids unnecessary sources", response.sources.length === 0, `${response.sources.length} source(s)`);
  }
  if (test.shouldClarify) {
    const clarifies =
      answerText.includes("?") ||
      Boolean(response.companion?.followUpQuestions?.length) ||
      Boolean(response.missingInfo?.includes("?"));
    add("asks useful clarification", clarifies, response.companion?.followUpQuestions?.join(" | ") ?? "none");
  }
  if (test.mustIncludeAny?.length) {
    add(
      "expected concept",
      test.mustIncludeAny.some((term) => normalized.includes(term.toLowerCase())),
      `one of: ${test.mustIncludeAny.join(", ")}`,
    );
  }
  if (test.requiredDomains?.length && response.sources.length) {
    add(
      "trusted source domain",
      response.sources.some((source) => test.requiredDomains?.includes(source.domain)),
      response.sources.map((source) => source.domain).join(", "),
    );
  }
  if (test.forbidUnsupportedExactness && !response.sources.length) {
    add(
      "does not fabricate exact fact",
      /\b(don't have|do not have|not confirmed|need|which|what floor|what block|can't confirm|cannot confirm)\b/i.test(answerText),
      "No sources were returned, so the answer must avoid unsupported exactness.",
    );
  }
  return checks;
}

async function main(): Promise<void> {
  const raw = await readFile("evals/persona3-reload.json", "utf8");
  const allCases = JSON.parse(raw) as EvalCase[];
  const selected = allCases
    .filter((test) => !category || test.category === category)
    .slice(0, limit);
  if (!selected.length) throw new Error("No evaluation cases matched the selected filters.");

  const results = [];
  for (const [index, test] of selected.entries()) {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: test.question,
        history: test.history,
        playerProfile: test.playerProfile,
        debug: true,
      } satisfies ChatRequest),
    });
    if (!response.ok) throw new Error(`${test.id}: API returned ${response.status} ${await response.text()}`);
    const body = (await response.json()) as ChatResponse;
    const checks = evaluate(test, body);
    const passed = checks.filter((check) => check.passed).length;
    const score = passed / checks.length;
    results.push({ ...test, score, checks, response: body });
    console.log(`${String(index + 1).padStart(2)}/${selected.length} ${score >= 0.8 ? "PASS" : "FAIL"} ${test.id} ${(score * 100).toFixed(0)}%`);
    if (delayMs > 0 && index < selected.length - 1) await sleep(delayMs);
  }

  const score = results.reduce((sum, result) => sum + result.score, 0) / results.length;
  const report = {
    generatedAt: new Date().toISOString(),
    apiUrl,
    score,
    passed: results.filter((result) => result.score >= 0.8).length,
    total: results.length,
    results,
  };
  await mkdir("evals/results", { recursive: true });
  await writeFile("evals/results/accuracy-latest.json", JSON.stringify(report, null, 2));
  console.log(`\nAccuracy score: ${(score * 100).toFixed(1)}% (${report.passed}/${report.total} cases at 80% or better)`);
  console.log("Detailed report: evals/results/accuracy-latest.json");
  if (score < failUnder) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
