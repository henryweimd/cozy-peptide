import { test } from "node:test";
import assert from "node:assert/strict";

import { buildRunRecord } from "../lib/db/runs";
import {
  buildAndCacheNarrative,
  narrativeInputFromRecord,
} from "../lib/research/report-cache";

const RUN_ID = "123e4567-e89b-42d3-a456-426614174000";

function successRecord(): ReturnType<typeof buildRunRecord> {
  return buildRunRecord({
    source: "demo-stream",
    params: { target: "bile acid diarrhea" },
    elapsedMs: 100,
    ok: true,
    payload: {
      success: true,
      research_provenance: {
        status: "ok",
        brief: {
          targets: [{ name: "FXR", rationale: "Bile acid sensor." }],
          mechanisms: [],
          avoid: [],
          citations: [{ ref: "pubmed:1", note: "n" }],
          evidenceCount: 1,
        },
        evidence: [
          {
            source: "pubmed",
            id: "1",
            title: "FXR study",
            snippet: "Findings.",
            url: "https://pubmed.ncbi.nlm.nih.gov/1/",
            year: "2024",
          },
        ],
      },
    },
  });
}

test("narrative input extracts target, brief, and citations", () => {
  const input = narrativeInputFromRecord(successRecord());
  assert.ok(input !== null);
  assert.equal(input?.target, "bile acid diarrhea");
  assert.equal(input?.brief?.targets.length, 1);
  assert.equal(input?.citations.length, 1);
  assert.equal(input?.citations[0]?.externalId, "1");
  assert.deepEqual(input?.snippets, ["Findings."]);
});

test("narrative input skips runs with nothing to synthesize", () => {
  const empty = buildRunRecord({
    source: "demo",
    params: { target: "bile acid diarrhea" },
    elapsedMs: 100,
    ok: false,
    payload: { success: false, error: "nope" },
    errorMessage: "nope",
  });
  assert.equal(narrativeInputFromRecord(empty), null);

  const blank = buildRunRecord({
    source: "demo",
    params: { target: "   " },
    elapsedMs: 100,
    ok: true,
    payload: { success: true },
  });
  assert.equal(narrativeInputFromRecord(blank), null);
});

test("buildAndCacheNarrative synthesizes and PATCHes the envelope", async () => {
  const saved = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const input = narrativeInputFromRecord(successRecord());
    assert.ok(input !== null);
    let seenBody = "";
    const ok = await buildAndCacheNarrative(RUN_ID, input as NonNullable<typeof input>, {
      synthesizeImpl: (async () =>
        JSON.stringify({
          background: "Bile acids cycle.",
          rationale: "FXR tunes synthesis.",
          targets: [{ name: "FXR", note: "Sensor.", cites: [1] }],
          safety: "",
          limitations: "",
        })),
      fetchImpl: (async (_url, init) => {
        seenBody = String(init?.body ?? "");
        return { ok: true, status: 200, json: async () => null };
      }),
    });
    assert.equal(ok, true);
    const body = JSON.parse(seenBody) as Record<string, unknown>;
    const envelope = body["research_narrative"] as Record<string, unknown>;
    const narrative = envelope["narrative"] as Record<string, unknown>;
    assert.equal(narrative["background"], "Bile acids cycle.");
  } finally {
    if (saved.SUPABASE_URL === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = saved.SUPABASE_URL;
    if (saved.SUPABASE_SERVICE_ROLE_KEY === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = saved.SUPABASE_SERVICE_ROLE_KEY;
    }
  }
});

test("buildAndCacheNarrative resolves false without caching fallback", async () => {
  const input = narrativeInputFromRecord(successRecord());
  assert.ok(input !== null);
  let calls = 0;
  const ok = await buildAndCacheNarrative(RUN_ID, input as NonNullable<typeof input>, {
    synthesizeImpl: (async () => null),
    fetchImpl: (async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => null };
    }),
  });
  assert.equal(ok, false);
  assert.equal(calls, 0);
});
