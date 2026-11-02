import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { NextRequest } from "next/server";
import type { ResponsesEvent } from "@meta-sam/parser";

import {
  GET as analyzeGET,
  POST as analyzePOST,
  isDemoImage,
  normalizeConcept,
} from "../app/api/analyze-image/route";
import {
  DEMO_RUN_ID,
  findCachedAnalysis,
  findDemoRunId,
  resolveDemoRunId,
} from "../lib/db/cro-analyses";
import {
  SAM_MODEL,
  SamUpstreamError,
  getSamApiKey,
  segmentConcept,
} from "../lib/sam-client";

const TEST_TOKEN = "cro-test-token";
const RUN_ID = "123e4567-e89b-12d3-a456-426614174000";
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function saveEnv(): Record<string, string | undefined> {
  return {
    API_BEARER_TOKEN: process.env.API_BEARER_TOKEN,
    MODEL_API_KEY: process.env.MODEL_API_KEY,
    META_API_KEY: process.env.META_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function getReq(url: string, token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return { headers, nextUrl: new URL(url) } as unknown as NextRequest;
}

function postReq(body: unknown, token?: string): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return { headers, json: async () => body } as unknown as NextRequest;
}

// Two-object SAM 3.1 frame, split across two deltas (parser README shape).
const TWO_OBJECT_TEXT =
  "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>" +
  ",1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>\n";

async function* twoObjectEvents(): AsyncIterable<ResponsesEvent> {
  const split = TWO_OBJECT_TEXT.indexOf(",1<|box");
  yield {
    type: "response.output_text.delta",
    item_id: "message-1",
    output_index: 0,
    content_index: 0,
    delta: TWO_OBJECT_TEXT.slice(0, split),
  } as ResponsesEvent;
  yield {
    type: "response.output_text.delta",
    item_id: "message-1",
    output_index: 0,
    content_index: 0,
    delta: TWO_OBJECT_TEXT.slice(split),
  } as ResponsesEvent;
  yield {
    type: "response.output_text.done",
    item_id: "message-1",
    output_index: 0,
    content_index: 0,
    text: TWO_OBJECT_TEXT,
  } as ResponsesEvent;
  yield { type: "response.completed" } as ResponsesEvent;
}

async function* emptyLaneEvents(): AsyncIterable<ResponsesEvent> {
  yield {
    type: "response.output_text.done",
    item_id: "message-1",
    output_index: 0,
    content_index: 0,
    text: "",
  } as ResponsesEvent;
  yield { type: "response.completed" } as ResponsesEvent;
}

async function* eofEvents(): AsyncIterable<ResponsesEvent> {
  // Ends with no terminal event: incomplete, must throw.
}

test("segmentConcept normalizes parser records via the package", async () => {
  const result = await segmentConcept(TINY_PNG, "cell nuclei", {
    width: 320,
    height: 334,
    requestEvents: async () => twoObjectEvents(),
  });
  assert.equal(result.concept, "cell nuclei");
  assert.equal(result.count, 2);
  assert.equal(result.boxes.length, 2);
  assert.equal(result.masks.length, 2);
  // Half-open normalization: x2=270 -> right=271.
  assert.deepEqual(
    [result.boxes[0]?.left, result.boxes[0]?.top, result.boxes[0]?.right, result.boxes[0]?.bottom],
    [211, 228, 271, 255]
  );
  assert.deepEqual(result.masks[0]?.rle.size, [27, 60]);
  assert.ok(result.foreground_pixels > 0);
  assert.ok(result.foreground_pixels < 27 * 60 + 27 * 48);
  assert.ok(result.maskSvg.includes("<svg"));
  assert.ok(result.maskSvg.includes("viewBox=\"0 0 320 334\""));
  assert.ok(result.maskSvg.includes("<path"));
  assert.equal(result.droppedMasks, 0);
});

test("segmentConcept treats zero masks as valid empty", async () => {
  const result = await segmentConcept(TINY_PNG, "cell nuclei", {
    width: 320,
    height: 334,
    requestEvents: async () => emptyLaneEvents(),
  });
  assert.equal(result.count, 0);
  assert.deepEqual(result.boxes, []);
  assert.deepEqual(result.masks, []);
  assert.equal(result.foreground_pixels, 0);
  assert.equal(result.maskSvg, "");
});

test("segmentConcept throws when the response never completes", async () => {
  await assert.rejects(
    segmentConcept(TINY_PNG, "cell nuclei", {
      requestEvents: async () => eofEvents(),
    }),
    SamUpstreamError
  );
});

test("sam key prefers MODEL_API_KEY, falls back to META_API_KEY", () => {
  const saved = saveEnv();
  try {
    delete process.env.MODEL_API_KEY;
    delete process.env.META_API_KEY;
    assert.equal(getSamApiKey(), null);
    process.env.META_API_KEY = "meta-key";
    assert.equal(getSamApiKey(), "meta-key");
    process.env.MODEL_API_KEY = "model-key";
    assert.equal(getSamApiKey(), "model-key");
  } finally {
    restoreEnv(saved);
  }
});

test("analyze-image GET reports config without auth", async () => {
  const saved = saveEnv();
  try {
    delete process.env.MODEL_API_KEY;
    const response = await analyzeGET(getReq("http://x/api/analyze-image"));
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      success: boolean;
      data: { configured: boolean; model: string };
    };
    assert.equal(body.success, true);
    assert.equal(body.data.configured, false);
    assert.equal(body.data.model, SAM_MODEL);
  } finally {
    restoreEnv(saved);
  }
});

test("analyze-image run history requires auth", async () => {
  const saved = saveEnv();
  try {
    process.env.API_BEARER_TOKEN = TEST_TOKEN;
    const missing = await analyzeGET(
      getReq(`http://x/api/analyze-image?run=${RUN_ID}`)
    );
    assert.equal(missing.status, 401);
    const bad = await analyzeGET(
      getReq("http://x/api/analyze-image?run=nope", TEST_TOKEN)
    );
    assert.equal(bad.status, 400);
  } finally {
    restoreEnv(saved);
  }
});

function demoDataUrl(): string {
  const bytes = readFileSync("public/demo/cro-demo-nuclei.png");
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

test("isDemoImage matches only the shipped demo bytes", () => {
  const bytes = readFileSync("public/demo/cro-demo-nuclei.png");
  assert.equal(isDemoImage(bytes.toString("base64"), "image/png"), true);
  assert.equal(isDemoImage("iVBORw0KGgo=", "image/png"), false);
  assert.equal(
    isDemoImage(bytes.toString("base64"), "image/jpeg"),
    false
  );
});

test("demo run resolves, creates, and finds idempotently", async () => {
  const saved = saveEnv();
  try {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    const seen: Array<{ url: string; method: string; body: string }> = [];
    const created = await resolveDemoRunId({
      fetchImpl: (async (input: unknown, init: unknown) => {
        const request = init as { method?: string; body?: string };
        seen.push({
          url: String(input),
          method: request.method ?? "GET",
          body: request.body ?? "",
        });
        return { ok: true, status: 201 };
      }) as never,
    });
    assert.equal(created, DEMO_RUN_ID);
    assert.equal(seen.length, 1);
    assert.ok(seen[0]?.url.includes("/rest/v1/peptide_runs"));
    const posted = JSON.parse(seen[0]?.body ?? "{}") as Record<string, unknown>;
    assert.equal(posted["id"], DEMO_RUN_ID);
    assert.equal(posted["source"], "demo");
    assert.equal(typeof posted["target"], "string");
    assert.ok(typeof posted["request"] === "object");

    // Conflict: falls back to reading the existing row.
    const existing = await resolveDemoRunId({
      fetchImpl: (async (input: unknown, init: unknown) => {
        const request = init as { method?: string };
        if ((request.method ?? "GET") === "POST") return { ok: false, status: 409 };
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: DEMO_RUN_ID }],
        };
      }) as never,
    });
    assert.equal(existing, DEMO_RUN_ID);

    // Total failure: null, never throws.
    const failed = await resolveDemoRunId({
      fetchImpl: (async () => ({ ok: false, status: 500 })) as never,
    });
    assert.equal(failed, null);

    const found = await findDemoRunId({
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => [{ id: DEMO_RUN_ID }],
      })) as never,
    });
    assert.equal(found, DEMO_RUN_ID);
    const missing = await findDemoRunId({
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => [],
      })) as never,
    });
    assert.equal(missing, null);
  } finally {
    restoreEnv(saved);
  }
});

test("concept normalization is case- and whitespace-insensitive", () => {
  assert.equal(normalizeConcept("  Cell Nuclei "), "cell nuclei");
  assert.equal(normalizeConcept("cell nuclei"), "cell nuclei");
});

test("cached analysis lookup hits, misses, and fails cleanly", async () => {
  const saved = saveEnv();
  try {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    const row = {
      id: "analysis-1",
      run_id: RUN_ID,
      boxes: [{ objectId: "0" }],
      masks: [{ objectId: "0" }],
      foreground_pixels: 42,
      count: 1,
      mask_svg: "<svg></svg>",
      summary: { width: 696, height: 520 },
    };
    const seen: string[] = [];
    const hit = await findCachedAnalysis("abc123", "cell nuclei", "sam-3.1", {
      fetchImpl: (async (input: unknown) => {
        seen.push(String(input));
        return { ok: true, status: 200, json: async () => [row] };
      }) as never,
    });
    assert.deepEqual(hit, {
      id: "analysis-1",
      run_id: RUN_ID,
      boxes: row.boxes,
      masks: row.masks,
      foreground_pixels: 42,
      count: 1,
      mask_svg: "<svg></svg>",
      width: 696,
      height: 520,
    });
    assert.ok(seen[0]?.includes("image_sha256=eq.abc123"));
    assert.ok(seen[0]?.includes("sam_model=eq.sam-3.1"));

    const miss = await findCachedAnalysis("nope", "cell nuclei", "sam-3.1", {
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        json: async () => [],
      })) as never,
    });
    assert.equal(miss, null);

    const outage = await findCachedAnalysis("abc123", "cell nuclei", "sam-3.1", {
      fetchImpl: (async () => ({ ok: false, status: 500 })) as never,
    });
    assert.equal(outage, null);
  } finally {
    restoreEnv(saved);
  }
});

test("demo run resolution needs no store to fail cleanly", async () => {
  const saved = saveEnv();
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(await resolveDemoRunId(), null);
    assert.equal(await findDemoRunId(), null);
  } finally {
    restoreEnv(saved);
  }
});

test("analyze-image POST requires auth and a model key", async () => {
  const saved = saveEnv();
  try {
    process.env.API_BEARER_TOKEN = TEST_TOKEN;
    delete process.env.MODEL_API_KEY;
    delete process.env.META_API_KEY;
    const payload = { imageDataUrl: TINY_PNG, concepts: ["cell nuclei"] };
    const missing = await analyzePOST(postReq(payload));
    assert.equal(missing.status, 401);
    const noKey = await analyzePOST(postReq(payload, TEST_TOKEN));
    assert.equal(noKey.status, 503);
    const noKeyBody = (await noKey.json()) as { error: string };
    assert.ok(noKeyBody.error.includes("MODEL_API_KEY"));
  } finally {
    restoreEnv(saved);
  }
});

test("demo pixels analyze without a token but stay fenced", async () => {
  const saved = saveEnv();
  try {
    process.env.API_BEARER_TOKEN = TEST_TOKEN;
    process.env.MODEL_API_KEY = "model-key";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    // No auth header, demo pixels, demo ledger: passes auth, fails on store.
    const noAuth = await analyzePOST(
      postReq({
        imageDataUrl: demoDataUrl(),
        concepts: ["cell nuclei"],
        runId: "demo",
      })
    );
    assert.equal(noAuth.status, 503);
    const body = (await noAuth.json()) as { error: string };
    assert.ok(body.error.includes("Demo ledger"));
    // Same pixels aimed at a real run without auth: rejected.
    const fenced = await analyzePOST(
      postReq({
        imageDataUrl: demoDataUrl(),
        concepts: ["cell nuclei"],
        runId: RUN_ID,
      })
    );
    assert.equal(fenced.status, 401);
  } finally {
    restoreEnv(saved);
  }
});

test("demo history is public but store-aware", async () => {
  const saved = saveEnv();
  try {
    delete process.env.API_BEARER_TOKEN;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const response = await analyzeGET(
      getReq("http://x/api/analyze-image?run=demo")
    );
    assert.equal(response.status, 503);
  } finally {
    restoreEnv(saved);
  }
});

test("analyze-image POST validates before touching the model", async () => {
  const saved = saveEnv();
  try {
    process.env.API_BEARER_TOKEN = TEST_TOKEN;
    delete process.env.MODEL_API_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const badImage = await analyzePOST(
      postReq({ imageDataUrl: "not-a-data-url", concepts: ["x"] }, TEST_TOKEN)
    );
    assert.equal(badImage.status, 400);

    const noConcepts = await analyzePOST(
      postReq({ imageDataUrl: TINY_PNG, concepts: [] }, TEST_TOKEN)
    );
    assert.equal(noConcepts.status, 400);

    const tooMany = await analyzePOST(
      postReq(
        { imageDataUrl: TINY_PNG, concepts: ["a", "b", "c", "d", "e"] },
        TEST_TOKEN
      )
    );
    assert.equal(tooMany.status, 400);

    const badRun = await analyzePOST(
      postReq(
        { imageDataUrl: TINY_PNG, concepts: ["x"], runId: "nope" },
        TEST_TOKEN
      )
    );
    assert.equal(badRun.status, 400);

    const oversize = await analyzePOST(
      postReq(
        {
          imageDataUrl: `data:image/png;base64,${"A".repeat(28_000_000)}`,
          concepts: ["x"],
        },
        TEST_TOKEN
      )
    );
    assert.equal(oversize.status, 413);
  } finally {
    restoreEnv(saved);
  }
});
