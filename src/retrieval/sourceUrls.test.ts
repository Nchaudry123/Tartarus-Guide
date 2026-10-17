import assert from "node:assert/strict";
import test from "node:test";
import { repairSourceUrl, withRepairedSourceUrls } from "./sourceUrls";

test("truncated IGN URLs map to the live pages; others are untouched", () => {
  assert.equal(
    repairSourceUrl("https://www.ign.com/wikis/persona-3-reload/Harabah_(Floors_199_-_226"),
    "https://www.ign.com/wikis/persona-3-reload/Harabah_(Floors_199_-_226)_Tartarus_Walkthrough",
  );
  const ok = "https://game8.co/games/Persona-3-Reload/archives/440374";
  assert.equal(repairSourceUrl(ok), ok);
  const response = { answer: "x", sources: [{ url: ok, title: "t", domain: "game8.co" }] };
  assert.equal(withRepairedSourceUrls(response), response);
});
