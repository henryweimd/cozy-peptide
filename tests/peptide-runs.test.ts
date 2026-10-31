import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildRunRecord,
  recordRun,
  saveRun,
  type RunRecord,
} from "../lib/db/runs";

const PARAMS = {
  target: "Clostridioides difficile colonization in the gut",
  charge_target: 4,
  modality: "knottin-6c",
  model: "muse-spark-1.3-contributor",
  research: true,
};

const SUCCESS_PAYLOAD = {
  success: true,
  target: PARAMS.target,
  candidate: { id: "SB-KNOT-1ABC", sequence: "CAGSTCTGSACKQACTGAKCKTGASRTC" },
  symbolic_audit: { passed: true, therapeutic_index: 90.1, safety_index: 94.2 },
  neurosymbolic_provenance: {
    target_class: "bacterial-colonization",
    refinement_trace: [{ turn: 1 }],
  },
  research_provenance: { status: "ok", evidence_count: 10 },
  agent_tools: [{ tool: "binding-affinity", status: "not-configured" }],
  lab_handoff: { yeast_chassis: "S. boulardii" },
};

function savedEnv(): Record<string, string | undefined> {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function stubRecord(): RunRecord {
  return buildRunRecord({
    source: "api",
    params: PARAMS,
    elapsedMs: 1234,
    ok: true,
    payload: SUCCESS_PAYLOAD,
  });
}

test("run record maps a success payload to scalar columns", () => {
  const record = stubRecord();
  assert.equal(record.status, "success");
  assert.equal(record.source, "api");
  assert.equal(record.target, PARAMS.target);
  assert.equal(record.candidate_sequence, "CAGSTCTGSACKQACTGAKCKTGASRTC");
  assert.equal(record.candidate_id, "SB-KNOT-1ABC");
  assert.equal(record.therapeutic_index, 90.1);
  assert.equal(record.safety_index, 94.2);
  assert.equal(record.target_class, "bacterial-colonization");
  assert.equal(record.research_status, "ok");
  assert.equal(record.research_enabled, true);
  assert.equal(record.error, null);
  assert.equal(record.elapsed_ms, 1234);
  assert.deepEqual(record.request, PARAMS);
  assert.ok(Array.isArray(record.agent_tools));
});

test("run record maps a failure envelope with the error kept", () => {
  const record = buildRunRecord({
    source: "demo",
    params: { target: PARAMS.target },
    elapsedMs: 42,
    ok: false,
    payload: { success: false, error: "Upstream generation failed" },
    errorMessage: "No verifiable candidate",
  });
  assert.equal(record.status, "error");
  assert.equal(record.error, "No verifiable candidate");
  assert.equal(record.candidate_sequence, null);
  assert.equal(record.therapeutic_index, null);
  assert.equal(record.research_status, null);
});

test("run record tolerates misshapen payloads", () => {
  for (const payload of [null, {}, "nope", 42]) {
    const record = buildRunRecord({
      source: "api",
      params: { target: PARAMS.target },
      elapsedMs: 1,
      ok: true,
      payload,
    });
    assert.equal(record.candidate_sequence, null);
    assert.equal(record.error, null);
  }
});

test("saveRun no-ops without Supabase env", async () => {
  const saved = savedEnv();
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    let calls = 0;
    const result = await saveRun(stubRecord(), {
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 201 };
      },
    });
    assert.equal(result.saved, false);
    assert.equal(calls, 0);
  } finally {
    restoreEnv(saved);
  }
});

test("saveRun posts the row, preferring the service-role key", async () => {
  const saved = savedEnv();
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co/";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    let seenUrl = "";
    let seenAuth = "";
    let seenBody = "";
    const result = await saveRun(stubRecord(), {
      fetchImpl: async (input, init) => {
        seenUrl = String(input);
        const headers = new Headers(init?.headers);
        seenAuth = headers.get("authorization") ?? "";
        seenBody = String(init?.body ?? "");
        return { ok: true, status: 201 };
      },
    });
    assert.equal(result.saved, true);
    assert.equal(seenUrl, "https://example.supabase.co/rest/v1/peptide_runs");
    assert.equal(seenAuth, "Bearer service-key");
    const body = JSON.parse(seenBody) as Record<string, unknown>;
    assert.equal(body["candidate_id"], "SB-KNOT-1ABC");
  } finally {
    restoreEnv(saved);
  }
});

test("saveRun falls back to the anon key", async () => {
  const saved = savedEnv();
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_ANON_KEY = "anon-key";
    let seenAuth = "";
    const result = await saveRun(stubRecord(), {
      fetchImpl: async (_input, init) => {
        seenAuth =
          new Headers(init?.headers).get("authorization") ?? "";
        return { ok: true, status: 201 };
      },
    });
    assert.equal(result.saved, true);
    assert.equal(seenAuth, "Bearer anon-key");
  } finally {
    restoreEnv(saved);
  }
});

test("saveRun reports HTTP and transport failures without throwing", async () => {
  const saved = savedEnv();
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    const httpFail = await saveRun(stubRecord(), {
      fetchImpl: async () => ({ ok: false, status: 500 }),
    });
    assert.equal(httpFail.saved, false);
    assert.ok((httpFail.error ?? "").includes("500"));
    const transportFail = await saveRun(stubRecord(), {
      fetchImpl: async () => {
        throw new Error("boom");
      },
    });
    assert.equal(transportFail.saved, false);
    assert.ok((transportFail.error ?? "").length > 0);
  } finally {
    restoreEnv(saved);
  }
});

test("recordRun never throws, even on transport failure", async () => {
  const saved = savedEnv();
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    await recordRun(stubRecord(), {
      fetchImpl: async () => {
        throw new Error("boom");
      },
    });
  } finally {
    restoreEnv(saved);
  }
});
