import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const rawBaseUrl =
  process.env.SMOKE_BASE_URL ||
  process.argv.find((argument) => argument.startsWith("--url="))?.slice(6) ||
  "https://tartarus-guide.vercel.app";
const baseUrl = rawBaseUrl.replace(/\/+$/, "");
const apiUrl = `${baseUrl}/api/chat`;
const artifactDir = "smoke-artifacts";
const failures = [];
const ignoredConsoleErrors = [
  /Provider's accounts list is empty/i,
  /\[GSI_LOGGER\]/i,
  /FedCM get\(\) rejects/i,
  /Failed to load resource: the server responded with a status of (?:403|429)/i,
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isHtmlLike(value) {
  return /^\s*<!doctype html|^\s*<html[\s>]/i.test(value);
}

function compact(value, length = 300) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

function describeHtmlResponse(body) {
  if (/DEPLOYMENT_NOT_FOUND/i.test(body)) return "Vercel deployment was not found";
  if (/vercel authentication|log in to vercel|continue with github/i.test(body)) {
    return "deployment appears to be protected by Vercel authentication";
  }
  const title = body.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim();
  return title ? `HTML page titled "${title}"` : `HTML page: ${compact(body, 160)}`;
}

async function fetchTextWithRetry(url, options = {}, attempts = 3) {
  let lastResponse;
  let lastBody = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, options);
    const body = await response.text();
    lastResponse = response;
    lastBody = body;
    if (response.status !== 429 || attempt === attempts) {
      return { response, body };
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  return { response: lastResponse, body: lastBody };
}

async function step(name, operation) {
  const startedAt = Date.now();
  try {
    const result = await operation();
    console.log(`PASS ${name} (${Date.now() - startedAt}ms)`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`FAIL ${name}: ${message}`);
    return null;
  }
}

async function chat(question, options = {}) {
  const { response, body } = await fetchTextWithRetry(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      question,
      history: options.history,
      playerProfile: options.playerProfile,
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  assert(response.ok, `API returned ${response.status}: ${body.slice(0, 300)}`);
  const contentType = response.headers.get("content-type") ?? "";
  assert(
    contentType.includes("application/json"),
    `API returned ${contentType || "unknown content type"} instead of JSON from ${apiUrl}: ${
      isHtmlLike(body) ? describeHtmlResponse(body) : compact(body)
    }`,
  );
  const parsed = JSON.parse(body);
  assert(typeof parsed.answer === "string" && parsed.answer.length > 10, "API returned an empty answer");
  return parsed;
}

async function submitQuestion(page, question) {
  const assistants = page.locator(".assistant-message");
  const before = await assistants.count();
  const input = page.getByRole("textbox", {
    name: "Ask a Persona 3 Reload question",
    exact: true,
  });
  await input.fill(question);
  await input.press("Enter");
  await page.waitForFunction(
    (previousCount) =>
      document.querySelectorAll(".assistant-message").length > previousCount &&
      !document.querySelector(".assistant-message .answer.is-typing"),
    before,
    { timeout: 75_000 },
  );
  const after = await assistants.count();
  return assistants.nth(after - 1);
}

await mkdir(artifactDir, { recursive: true });

await step("production page is available", async () => {
  const response = await fetch(baseUrl, { signal: AbortSignal.timeout(20_000) });
  const html = await response.text();
  assert(response.ok, `Page returned ${response.status}`);
  assert(
    html.includes("Tartarus Guide"),
    `Expected app shell was not present at ${baseUrl}; received ${
      isHtmlLike(html) ? describeHtmlResponse(html) : compact(html)
    }`,
  );
});

await step("exact answer is sourced", async () => {
  const response = await chat("What is Dancing Hand weak to?");
  assert(/\bFire\b/i.test(response.answer), "Dancing Hand answer did not include Fire");
  assert(
    response.sources?.some((source) => /^(?:game8\.co|ign\.com)$/.test(source.domain)),
    "Exact answer did not include an IGN or Game8 source",
  );
});

await step("DLC clarification resumes the fusion task", async () => {
  const first = await chat("How do I fuse Loki?");
  assert(/Persona DLC/i.test(first.answer), "Fusion flow did not ask about Persona DLC");
  const second = await chat("No Persona DLC", {
    history: [
      { role: "user", content: "How do I fuse Loki?" },
      { role: "assistant", content: first.answer },
    ],
  });
  assert(/\bLoki\b/i.test(second.answer), "Fusion follow-up lost the Loki target");
  assert(/base-game/i.test(second.answer), "Fusion follow-up did not use the base-game chart");
  assert(
    second.fusionWorkshop?.target === "Loki" &&
      second.fusionWorkshop?.dlcMode === "none" &&
      second.fusionWorkshop?.recipes?.length === 2,
    "Fusion follow-up did not return two structured base-game Loki routes",
  );
  assert(
    second.sources?.some((source) => source.domain === "aqiu384.github.io"),
    "Fusion follow-up did not cite the Megaten Fusion Tool",
  );
  const third = await chat("I have the first pair", {
    history: [
      { role: "user", content: "How do I fuse Loki?" },
      { role: "assistant", content: first.answer },
      { role: "user", content: "No Persona DLC" },
      { role: "assistant", content: second.answer },
    ],
    playerProfile: { dlcOwnership: "none" },
  });
  assert(/\bLoki\b/i.test(third.answer), "Fusion route ownership follow-up lost the Loki target");
  assert(/already own|working route|ready/i.test(third.answer), "Fusion route ownership follow-up did not accept the selected pair");
  const fourth = await chat("What skills should I keep?", {
    history: [
      { role: "user", content: "How do I fuse Loki?" },
      { role: "assistant", content: first.answer },
      { role: "user", content: "No Persona DLC" },
      { role: "assistant", content: second.answer },
      { role: "user", content: "I have the first pair" },
      { role: "assistant", content: third.answer },
    ],
    playerProfile: { dlcOwnership: "none" },
  });
  assert(/\bLoki\b/i.test(fourth.answer), "Fusion skill follow-up did not stay on Loki");
  assert(
    /\bskills?\b/i.test(fourth.answer) || fourth.sections?.some((section) => /skills?/i.test(`${section.title} ${section.content}`)),
    "Fusion skill follow-up did not answer with skill guidance",
  );
});

await step("recommendation payload is structured", async () => {
  const response = await chat("What is the best Persona to use for the final boss?", {
    playerProfile: {
      currentMonth: "January",
      currentLevel: "90",
      spoilerPreference: "open",
    },
  });
  assert(response.recommendation?.primary?.name, "Recommendation card payload is missing a primary pick");
  assert(
    Array.isArray(response.recommendation?.alternatives) &&
      response.recommendation.alternatives.length > 0,
    "Recommendation card payload is missing alternatives",
  );
});

await step("recommendation follow-up keeps context", async () => {
  const playerProfile = {
    currentMonth: "January",
    currentLevel: "90",
    spoilerPreference: "open",
  };
  const first = await chat("What is the best Persona to use for the final boss?", {
    playerProfile,
  });
  const followUp = await chat("What level do I need?", {
    playerProfile,
    history: [
      { role: "user", content: "What is the best Persona to use for the final boss?" },
      { role: "assistant", content: first.answer },
    ],
  });
  assert(
    /\b(?:level|76\+|90|January 31|Nyx|final)\b/i.test(followUp.answer),
    "Recommendation level follow-up lost the final-fight context",
  );
  assert(followUp.recommendation?.primary?.name, "Recommendation follow-up did not keep a primary pick");
  assert(
    !/what specific aspect of the game/i.test(followUp.answer),
    "Recommendation follow-up fell back to a generic clarification",
  );
});

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const browserErrors = [];
page.on("console", (message) => {
  if (
    message.type() === "error" &&
    !ignoredConsoleErrors.some((pattern) => pattern.test(message.text()))
  ) {
    browserErrors.push(message.text());
  }
});
page.on("pageerror", (error) => browserErrors.push(error.message));

try {
  await step("desktop recommendation UI renders", async () => {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const enter = page.getByRole("button", { name: "Enter Records", exact: true });
    if (await enter.isVisible().catch(() => false)) await enter.click();
    const message = await submitQuestion(page, "What is the best Persona to use for the final boss?");
    const card = message.locator(".recommendation-card");
    await card.waitFor({ state: "visible", timeout: 10_000 });
    assert(await card.getByText("Navigator Pick", { exact: true }).isVisible(), "Recommendation heading is hidden");
    assert((await card.locator("li").count()) > 0, "Recommendation alternatives did not render");
  });

  await step("mobile layout has no overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const layout = await page.evaluate(() => {
      const card = document.querySelector(".recommendation-card");
      if (!card) return null;
      const bounds = card.getBoundingClientRect();
      return {
        viewportWidth: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        cardLeft: bounds.left,
        cardRight: bounds.right,
      };
    });
    assert(layout, "Recommendation card disappeared at the mobile breakpoint");
    assert(layout.pageWidth <= layout.viewportWidth + 1, `Page overflowed by ${layout.pageWidth - layout.viewportWidth}px`);
    assert(layout.cardLeft >= 0 && layout.cardRight <= layout.viewportWidth + 1, "Recommendation card exceeds the viewport");
  });

  await step("exact answers stay compact in the UI", async () => {
    const message = await submitQuestion(page, "What is Dancing Hand weak to?");
    assert((await message.locator(".recommendation-card").count()) === 0, "Exact answer incorrectly displayed a recommendation card");
    assert((await message.locator(".source-drawer").count()) === 1, "Exact answer source drawer is missing");
  });

  await step("dashboard flow uses Player Memory lanes", async () => {
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.removeItem("tartarusExactAnswerCacheV1");
      localStorage.removeItem("tartarusSavedAnswersV1");
      localStorage.setItem(
        "tartarusPlayerProfileV2",
        JSON.stringify({
          currentDate: "June 5",
          currentMonth: "June",
          currentSocialLinks: ["Emperor", "Hierophant"],
          activeRequests: ["12"],
          tartarusBlock: "Arqa",
          tartarusFloor: "42F",
        }),
      );
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    const enter = page.getByRole("button", { name: "Enter Records", exact: true });
    if (await enter.isVisible().catch(() => false)) await enter.click();
    const message = await submitQuestion(page, "What should I do today?");
    const dashboard = message.locator(".daily-dashboard");
    await dashboard.waitFor({ state: "visible", timeout: 10_000 });
    assert(await page.locator(".current-task-card").getByText("Planning today").isVisible(), "Current task did not switch to daily planning");
    assert(await dashboard.locator(".lane-urgent").isVisible(), "Dashboard did not show an urgent lane");
    assert(await dashboard.locator(".lane-recommended").isVisible(), "Dashboard did not show a recommended lane");
    assert(await dashboard.locator(".lane-optional").isVisible(), "Dashboard did not show an optional lane");
    assert(await dashboard.getByText(/Request 12|Elizabeth Request 12/i).isVisible(), "Tracked request did not appear in the dashboard");
  });

  assert(browserErrors.length === 0, `Browser console errors: ${browserErrors.join(" | ")}`);
} catch (error) {
  failures.push(`browser harness: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (failures.length) {
    await page.screenshot({ path: `${artifactDir}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(
      `${artifactDir}/diagnostics.json`,
      JSON.stringify({ baseUrl, failures, browserErrors }, null, 2),
    );
  }
  await browser.close();
}

if (failures.length) {
  console.error(`\nProduction smoke test failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\nProduction smoke test passed for ${baseUrl}.`);
