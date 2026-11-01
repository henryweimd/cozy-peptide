import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildRunRecord,
  resetTraceColumnProbe,
  saveRun,
} from "../lib/db/runs";
import {
  clampRecentOffset,
  fetchRecentRuns,
  fetchRunById,
} from "../lib/db/recent";

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

const PARAMS = {
  target: "Clostridioides difficile colonization in the gut",
  charge_target: 4,
  modality: "knottin-6c",
  model: "muse-spark-1.3-contributor",
  research: true,
};

test("run record carries the stage trace capped at 100 events", () => {
  const trace = Array.from({ length: 150 }, (_, index) => ({
    stage: "verify",
    turn: index,
    message: `check ${index}`,
  }));
  const record = buildRunRecord({
    source: "api-stream",
    params: PARAMS,
    elapsedMs: 100,
    ok: true,
    payload: { success: true },
    stageTrace: trace,
  });
  assert.ok(Array.isArray(record.stage_trace));
  assert.equal((record.stage_trace as unknown[]).length, 100);
});

test("run record defaults trace and specificity to null", () => {
  const record = buildRunRecord({
    source: "api",
    params: PARAMS,
    elapsedMs: 100,
    ok: true,
    payload: { success: true },
  });
  assert.equal(record.stage_trace, null);
  assert.equal(record.specificity, null);
  assert.equal(record.chassis, null);
  assert.equal(record.biocontainment, null);
});

test("run record extracts chassis and biocontainment", () => {
  const chassis = {
    host: "ecoli-nissle",
    host_display: "E. coli Nissle",
    compatibility: [{ host: "ecoli-nissle", score: 95 }],
  };
  const biocontainment = {
    host: "ecoli-nissle",
    auxotrophy: ["dapA (diaminopimelate)"],
    kill_switches: ["deadman/passcode circuit"],
  };
  const record = buildRunRecord({
    source: "api",
    params: PARAMS,
    elapsedMs: 100,
    ok: true,
    payload: { success: true, chassis, biocontainment },
  });
  assert.deepEqual(record.chassis, chassis);
  assert.deepEqual(record.biocontainment, biocontainment);
});

test("run record extracts the specificity review", () => {
  const record = buildRunRecord({
    source: "api",
    params: PARAMS,
    elapsedMs: 100,
    ok: true,
    payload: {
      success: true,
      specificity: { checked: true, pass: true, reason: "match" },
    },
  });
  assert.deepEqual(record.specificity, {
    checked: true,
    pass: true,
    reason: "match",
  });
});

test("saveRun retries stripped when the trace columns are missing", async () => {
  const saved = savedEnv();
  resetTraceColumnProbe();
  process.env.SUPABASE_URL = "https://example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const bodies: string[] = [];
    const record = buildRunRecord({
      source: "api",
      params: PARAMS,
      elapsedMs: 100,
      ok: true,
      payload: {
        success: true,
        specificity: { checked: true, pass: true, reason: "match" },
        chassis: { host: "sboulardii" },
        biocontainment: { host: "sboulardii" },
      },
      stageTrace: [{ stage: "handoff", turn: 1, message: "done" }],
    });
    let calls = 0;
    const result = await saveRun(record, {
      fetchImpl: (async (_input, init) => {
        calls += 1;
        bodies.push(String(init?.body ?? ""));
        if (calls === 1) return { ok: false, status: 400 };
        return {
          ok: true,
          status: 201,
          json: async () => [{ id: "row-id" }],
        };
      }),
    });
    assert.equal(result.saved, true);
    assert.equal(result.id, "row-id");
    assert.equal(bodies.length, 2);
    assert.ok(bodies[0]?.includes("stage_trace"));
    assert.ok(!bodies[1]?.includes("stage_trace"));
    assert.ok(!bodies[1]?.includes("specificity"));
    assert.ok(bodies[0]?.includes("biocontainment"));
    assert.ok(!bodies[1]?.includes("chassis"));
    assert.ok(!bodies[1]?.includes("biocontainment"));

    // The probe sticks: the next save skips the doomed first attempt.
    calls = 0;
    bodies.length = 0;
    const again = await saveRun(record, {
      fetchImpl: (async (_input, init) => {
        calls += 1;
        bodies.push(String(init?.body ?? ""));
        return { ok: true, status: 201 };
      }),
    });
    assert.equal(again.saved, true);
    assert.equal(calls, 1);
    assert.ok(!bodies[0]?.includes("stage_trace"));
  } finally {
    resetTraceColumnProbe();
    restoreEnv(saved);
  }
});

test("recent offset clamps to 0..200, defaulting to 0", () => {
  assert.equal(clampRecentOffset(undefined), 0);
  assert.equal(clampRecentOffset("10"), 10);
  assert.equal(clampRecentOffset("9999"), 200);
  assert.equal(clampRecentOffset("-5"), 0);
  assert.equal(clampRecentOffset("nope"), 0);
  assert.equal(clampRecentOffset(25), 25);
});

test("recent runs page with limit and offset", async () => {
  const saved = savedEnv();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    let seenUrl = "";
    await fetchRecentRuns(10, {
      offset: 20,
      fetchImpl: async (input) => {
        seenUrl = String(input);
        return { ok: true, status: 200, json: async () => [] };
      },
    });
    assert.ok(seenUrl.includes("limit=10"));
    assert.ok(seenUrl.includes("offset=20"));
  } finally {
    restoreEnv(saved);
  }
});

test("run detail parses the stage trace and specificity", async () => {
  const saved = savedEnv();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const run = await fetchRunById("00000000-0000-0000-0000-000000000001", {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "00000000-0000-0000-0000-000000000001",
            created_at: "2026-11-01T00:00:00.000Z",
            source: "api-stream",
            status: "success",
            target: "Clostridioides difficile colonization in the gut",
            stage_trace: [
              { stage: "research", turn: 0, message: "reading papers" },
              { stage: "handoff", turn: 2, message: "compiling" },
            ],
            specificity: { checked: true, pass: true, reason: "match" },
            chassis: { host: "sboulardii", compatibility: [] },
            biocontainment: { host: "sboulardii", auxotrophy: ["ura3"] },
          },
        ],
      }),
    });
    assert.ok(run !== null);
    assert.equal(run?.status, "success");
    assert.deepEqual(run?.stageTrace, [
      { stage: "research", turn: 0, message: "reading papers" },
      { stage: "handoff", turn: 2, message: "compiling" },
    ]);
    assert.deepEqual(run?.specificity, {
      checked: true,
      pass: true,
      reason: "match",
    });
    assert.deepEqual(run?.chassis, { host: "sboulardii", compatibility: [] });
    assert.deepEqual(run?.biocontainment, {
      host: "sboulardii",
      auxotrophy: ["ura3"],
    });
  } finally {
    restoreEnv(saved);
  }
});
