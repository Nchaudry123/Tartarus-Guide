// Runs the paid live-API accuracy gate (npm run eval:gate) only for Vercel production builds.
// Preview builds (every pushed branch) and local builds skip it; the free test suites in
// vercel-build still run everywhere. Set FORCE_EVAL_GATE=true to run it anyway.
import { spawnSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV ?? "";
const forced = process.env.FORCE_EVAL_GATE === "true";

if (vercelEnv !== "production" && !forced) {
  console.log(`Skipping eval:gate (VERCEL_ENV=${vercelEnv || "unset"}); it only runs on production builds.`);
  process.exit(0);
}

console.log(`Running eval:gate (${forced ? "FORCE_EVAL_GATE=true" : "production build"}).`);
const result = spawnSync("npm", ["run", "eval:gate"], {
  stdio: "inherit",
  env: { ...process.env, ALLOW_CHAT_DEBUG: "true", DISABLE_CHAT_RATE_LIMIT: "true" },
});
process.exit(result.status ?? 1);
