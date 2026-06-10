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
  mustIncludeAll?: string[];
  mustNotInclude?: string[];
  forbidUnsupportedExactness?: boolean;
  mustUseStructuredFacts?: boolean;
  minSources?: number;
  maxSources?: number;
  maxAnswerCharacters?: number;
  expectedGroundingStatus?: "verified" | "partial" | "insufficient";
};

type Check = { name: string; passed: boolean; detail: string };
type EvalResult = EvalCase & {
  score: number;
  checks: Check[];
  response?: ChatResponse;
  error?: string;
};

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
const delayMs = Number(args.get("delay-ms") ?? "1000");
const validateOnly = args.has("validate-only");

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
    answerText.length <= (test.maxAnswerCharacters ?? 3_500),
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
  if (test.mustIncludeAll?.length) {
    const missing = test.mustIncludeAll.filter((term) => !normalized.includes(term.toLowerCase()));
    add("all required concepts", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "all present");
  }
  if (test.mustNotInclude?.length) {
    const found = test.mustNotInclude.filter((term) => normalized.includes(term.toLowerCase()));
    add("forbidden concepts absent", found.length === 0, found.length ? `found: ${found.join(", ")}` : "none found");
  }
  if (typeof test.minSources === "number") {
    add("minimum source count", response.sources.length >= test.minSources, `${response.sources.length}/${test.minSources}`);
  }
  if (typeof test.maxSources === "number") {
    add("source count is concise", response.sources.length <= test.maxSources, `${response.sources.length}/${test.maxSources}`);
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
    add(
      "confidence reflects missing evidence",
      (response.confidence ?? 1) <= 0.5,
      `confidence=${response.confidence ?? "missing"}`,
    );
  }
  if (test.expectedGroundingStatus) {
    add(
      "grounding status",
      response.diagnostics?.groundingStatus === test.expectedGroundingStatus,
      `expected=${test.expectedGroundingStatus}, actual=${response.diagnostics?.groundingStatus ?? "missing"}`,
    );
  }
  if (test.mustUseStructuredFacts) {
    add(
      "structured fact support",
      (response.diagnostics?.factCount ?? 0) > 0,
      `${response.diagnostics?.factCount ?? 0} structured fact(s)`,
    );
  }
  return checks;
}

function validateFixtures(tests: EvalCase[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const allowedRoles = new Set(["user", "assistant"]);
  for (const [index, test] of tests.entries()) {
    const location = `case ${index + 1}`;
    if (!test.id?.trim()) errors.push(`${location}: missing id`);
    if (ids.has(test.id)) errors.push(`${location}: duplicate id "${test.id}"`);
    ids.add(test.id);
    if (!test.category?.trim()) errors.push(`${test.id || location}: missing category`);
    if (!test.question?.trim()) errors.push(`${test.id || location}: missing question`);
    if (test.history?.some((message) => !allowedRoles.has(message.role) || !message.content.trim())) {
      errors.push(`${test.id || location}: invalid history message`);
    }
    if (test.shouldUseSources === false && (test.minSources ?? 0) > 0) {
      errors.push(`${test.id || location}: source requirements conflict`);
    }
    if (test.maxSources !== undefined && test.minSources !== undefined && test.maxSources < test.minSources) {
      errors.push(`${test.id || location}: maxSources is lower than minSources`);
    }
    if (
      test.expectedGroundingStatus &&
      !["verified", "partial", "insufficient"].includes(test.expectedGroundingStatus)
    ) {
      errors.push(`${test.id || location}: invalid expectedGroundingStatus`);
    }
  }
  if (tests.length < 50) errors.push(`suite needs at least 50 cases; found ${tests.length}`);
  return errors;
}

async function main(): Promise<void> {
  const raw = await readFile("evals/persona3-reload.json", "utf8");
  const allCases = JSON.parse(raw) as EvalCase[];
  const fixtureErrors = validateFixtures(allCases);
  if (fixtureErrors.length) {
    throw new Error(`Evaluation fixture validation failed:\n- ${fixtureErrors.join("\n- ")}`);
  }
  if (validateOnly) {
    const categories = [...new Set(allCases.map((test) => test.category))];
    console.log(`Validated ${allCases.length} cases across ${categories.length} categories.`);
    console.log(categories.sort().join(", "));
    return;
  }
  const selected = allCases
    .filter((test) => !category || test.category === category)
    .slice(0, limit);
  if (!selected.length) throw new Error("No evaluation cases matched the selected filters.");

  const results: EvalResult[] = [];
  for (const [index, test] of selected.entries()) {
    try {
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
      if (!response.ok) throw new Error(`API returned ${response.status} ${await response.text()}`);
      const body = (await response.json()) as ChatResponse;
      const checks = evaluate(test, body);
      const passed = checks.filter((check) => check.passed).length;
      const score = passed / checks.length;
      results.push({ ...test, score, checks, response: body });
      console.log(`${String(index + 1).padStart(2)}/${selected.length} ${score >= 0.8 ? "PASS" : "FAIL"} ${test.id} ${(score * 100).toFixed(0)}%`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({
        ...test,
        score: 0,
        checks: [{ name: "API request", passed: false, detail }],
        error: detail,
      });
      console.log(`${String(index + 1).padStart(2)}/${selected.length} ERROR ${test.id} ${detail}`);
    }
    if (delayMs > 0 && index < selected.length - 1) await sleep(delayMs);
  }

  const score = results.reduce((sum, result) => sum + result.score, 0) / results.length;
  const categoryScores = Object.fromEntries(
    [...new Set(results.map((result) => result.category))]
      .sort()
      .map((name) => {
        const cases = results.filter((result) => result.category === name);
        return [name, {
          score: cases.reduce((sum, result) => sum + result.score, 0) / cases.length,
          passed: cases.filter((result) => result.score >= 0.8).length,
          total: cases.length,
        }];
      }),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    apiUrl,
    score,
    passed: results.filter((result) => result.score >= 0.8).length,
    total: results.length,
    categoryScores,
    results,
  };
  await mkdir("evals/results", { recursive: true });
  await writeFile("evals/results/accuracy-latest.json", JSON.stringify(report, null, 2));
  console.log(`\nAccuracy score: ${(score * 100).toFixed(1)}% (${report.passed}/${report.total} cases at 80% or better)`);
  for (const [name, summary] of Object.entries(categoryScores)) {
    console.log(`- ${name}: ${(summary.score * 100).toFixed(1)}% (${summary.passed}/${summary.total})`);
  }
  console.log("Detailed report: evals/results/accuracy-latest.json");
  if (score < failUnder) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
