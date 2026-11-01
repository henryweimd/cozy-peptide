import { test } from "node:test";
import assert from "node:assert/strict";

import { requestSparkCompletion } from "../lib/spark-client";
import {
  SPARK_FAILURES_PER_REQUEST,
  capText,
  currentRequestId,
  recordSparkFailure,
  runWithRequestId,
  takeSparkFailures,
  type SparkFailure,
} from "../lib/spark-trace";
import { buildRunRecord } from "../lib/db/runs";

function stubFailure(): SparkFailure {
  return {
    at: new Date(0).toISOString(),
    model: "muse-spark-1.3-contributor",
    temperature: 0.2,
    maxTokens: 100,
    timeoutMs: 1000,
    latencyMs: 10,
    messages: [{ role: "user", content: "hi", chars: 2 }],
    promptChars: 2,
    httpStatus: 403,
    finishReason: null,
    error: "upstream HTTP 403",
    responseSnippet: "blocked",
  };
}

test("trace ids isolate concurrent requests", async () => {
  const first = runWithRequestId(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    recordSparkFailure(stubFailure());
    return currentRequestId();
  });
  const second = runWithRequestId(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    recordSparkFailure({ ...stubFailure(), error: "other" });
    return currentRequestId();
  });
  const [firstId, secondId] = await Promise.all([first.result, second.result]);
  assert.ok(firstId !== null && secondId !== null && firstId !== secondId);
  assert.equal(takeSparkFailures(first.id)[0]?.error, "upstream HTTP 403");
  assert.equal(takeSparkFailures(second.id)[0]?.error, "other");
  assert.deepEqual(takeSparkFailures(first.id), []);
});

test("untraced records are no-ops and takes drain", () => {
  assert.equal(currentRequestId(), null);
  recordSparkFailure(stubFailure());
  assert.deepEqual(takeSparkFailures(), []);
  const { id, result } = runWithRequestId(() => {
    recordSparkFailure(stubFailure());
    return takeSparkFailures();
  });
  assert.equal(result.length, 1);
  assert.deepEqual(takeSparkFailures(id), []);
});

test("per-request bucket holds at most the cap", () => {
  const { id } = runWithRequestId(() => {
    for (let index = 0; index < SPARK_FAILURES_PER_REQUEST + 5; index += 1) {
      recordSparkFailure(stubFailure());
    }
    return null;
  });
  assert.equal(takeSparkFailures(id).length, SPARK_FAILURES_PER_REQUEST);
});

test("capText marks truncation with true length", () => {
  assert.deepEqual(capText("short", 100), { text: "short", chars: 5 });
  const capped = capText("x".repeat(10), 4);
  assert.equal(capped.chars, 10);
  assert.ok(capped.text.startsWith("xxxx"));
  assert.ok(capped.text.includes("10 chars"));
});

test("failed completions stash full payloads under the trace", async () => {
  const savedKey = process.env.META_API_KEY;
  const realFetch = globalThis.fetch;
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  process.env.META_API_KEY = "dummy-key";
  globalThis.fetch = (async () => ({
    ok: false,
    status: 403,
    text: async () => "{\"error\":{\"code\":\"user_blocked\"}}",
    json: async () => ({}),
  })) as unknown as typeof fetch;
  try {
    const { id, result } = runWithRequestId(() =>
      requestSparkCompletion([{ role: "user", content: "design this" }], {
        model: "muse-spark-1.3-contributor",
        maxTokens: 16,
      })
    );
    assert.equal(await result, null);
    const failures = takeSparkFailures(id);
    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.httpStatus, 403);
    assert.equal(failures[0]?.messages[0]?.content, "design this");
    assert.ok((failures[0]?.responseSnippet ?? "").includes("user_blocked"));
    assert.ok(
      warnings.some((warning) => warning.includes("[meta-spark] FAIL")),
      "expected a FAIL log line"
    );
    assert.ok(
      warnings.some((warning) => warning.includes("design this")),
      "expected the outbound payload in logs"
    );
  } finally {
    if (savedKey === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = savedKey;
    globalThis.fetch = realFetch;
    console.warn = originalWarn;
  }
});

test("run record carries spark failures, defaulting null", () => {
  const params = { target: "bile acid diarrhea" };
  const bare = buildRunRecord({
    source: "api",
    params,
    elapsedMs: 1,
    ok: true,
    payload: { success: true },
  });
  assert.equal(bare.spark_failures, null);
  const failed = buildRunRecord({
    source: "api",
    params,
    elapsedMs: 1,
    ok: true,
    payload: { success: true },
    sparkFailures: [stubFailure()],
  });
  assert.equal(failed.spark_failures?.length, 1);
  assert.equal(failed.spark_failures?.[0]?.httpStatus, 403);
});
