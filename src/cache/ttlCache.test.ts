import assert from "node:assert/strict";
import test from "node:test";
import { TtlCache } from "./ttlCache";

test("returns live entries and evicts the least recently used entry", () => {
  const cache = new TtlCache<number>(2, 60_000);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);

  cache.set("c", 3);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
});

test("does not return expired entries", async () => {
  const cache = new TtlCache<number>(2, 5);
  cache.set("a", 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(cache.get("a"), undefined);
});
