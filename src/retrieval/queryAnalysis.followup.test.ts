import assert from "node:assert/strict";
import test from "node:test";
import { buildFocusedQueries } from "./queryAnalysis";

test("a follow-up keeps the goal's subject for retrieval", () => {
  const queries = buildFocusedQueries(
    "The user's active conversation goal is: Show me possible fusions for Alilat\nThe user's latest follow-up is: I have Ananta and Asura",
  );
  assert.equal(queries[0], "alilat");
});
