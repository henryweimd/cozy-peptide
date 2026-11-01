import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkSparkStatus,
  clearSparkStatusCache,
  getSparkStatus,
} from "../lib/spark-status";

function stubFetch(
  handler: () => { ok: boolean; status: number; body: unknown }
): (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
  return async () => {
    const response = handler();
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
    };
  };
}

function withKey(key: string | undefined, run: () => Promise<void>): () => Promise<void> {
  return async () => {
    const prior = process.env.META_API_KEY;
    if (key === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = key;
    try {
      await run();
    } finally {
      if (prior === undefined) delete process.env.META_API_KEY;
      else process.env.META_API_KEY = prior;
    }
  };
}

test(
  "status probe reports ok on HTTP 200",
  withKey("test-key", async () => {
    const status = await checkSparkStatus({
      fetchImpl: stubFetch(() => ({ ok: true, status: 200, body: {} })),
    });
    assert.equal(status.state, "ok");
    assert.equal(status.detail, "HTTP 200");
    assert.equal(status.model, "muse-spark-1.3-contributor");
  })
);

test(
  "status probe distinguishes blocked, rate-limited, and down",
  withKey("test-key", async () => {
    const blocked = await checkSparkStatus({
      fetchImpl: stubFetch(() => ({
        ok: false,
        status: 403,
        body: { error: { code: "user_blocked" } },
      })),
    });
    assert.equal(blocked.state, "blocked");
    assert.equal(blocked.detail, "HTTP 403 user_blocked");

    const limited = await checkSparkStatus({
      fetchImpl: stubFetch(() => ({ ok: false, status: 429, body: {} })),
    });
    assert.equal(limited.state, "rate_limited");
    assert.equal(limited.detail, "HTTP 429");

    const down = await checkSparkStatus({
      fetchImpl: stubFetch(() => ({ ok: false, status: 503, body: {} })),
    });
    assert.equal(down.state, "unreachable");
  })
);

test("status probe reports timeouts and missing keys", async () => {
  await withKey("test-key", async () => {
    const aborting = async (): Promise<never> => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
    const timed = await checkSparkStatus({ fetchImpl: aborting });
    assert.equal(timed.state, "unreachable");
    assert.ok(timed.detail.includes("timeout"));
  })();
  await withKey(undefined, async () => {
    const missing = await checkSparkStatus({
      fetchImpl: stubFetch(() => ({ ok: true, status: 200, body: {} })),
    });
    assert.equal(missing.state, "unconfigured");
  })();
});

test("cached verdict probes once per TTL window", async () => {
  clearSparkStatusCache();
  try {
    await withKey("test-key", async () => {
      let calls = 0;
      const counting = stubFetch(() => {
        calls += 1;
        return { ok: true, status: 200, body: {} };
      });
      const first = await getSparkStatus({ fetchImpl: counting });
      const second = await getSparkStatus({ fetchImpl: counting });
      assert.equal(first.cached, false);
      assert.equal(second.cached, true);
      assert.equal(calls, 1);
    })();
  } finally {
    clearSparkStatusCache();
  }
});
