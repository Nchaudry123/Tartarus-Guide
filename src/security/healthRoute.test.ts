import assert from "node:assert/strict";
import test from "node:test";
import { GET, dynamic } from "../../app/api/health/route";

test("health route is dynamic and requires the cron secret when one is configured", async () => {
  assert.equal(dynamic, "force-dynamic");
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret";
  try {
    for (const authorization of [undefined, "Bearer wrong", "test-secret", "Bearer test-secret-extra"]) {
      const response = await GET(
        new Request("http://localhost/api/health", {
          headers: authorization ? { authorization } : {},
        }),
      );
      assert.equal(response.status, 401, `accepted ${authorization ?? "no header"}`);
      assert.deepEqual(await response.json(), { ok: false });
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
