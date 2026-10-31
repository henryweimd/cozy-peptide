import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";

import {
  clampRecentLimit,
  fetchRecentRuns,
  fetchRunById,
} from "../lib/db/recent";
import { GET as recentGET } from "../app/api/recent-peptides/route";
import { GET as runGET } from "../app/api/peptide-run/route";

const ROW = {
  id: "00000000-0000-0000-0000-000000000001",
  created_at: "2026-10-31T20:30:21.069278+00:00",
  source: "demo-stream",
  target: "Clostridioides difficile colonization in the gut",
  modality: "knottin-6c",
  charge_target: 4,
  research_status: "ok",
  candidate_id: "SB-KNOT-1ABC",
  candidate_sequence: "CAGSTCTGSACKQACTGAKCKTGASRTC",
  therapeutic_index: 90.1,
  safety_index: 94.2,
  elapsed_ms: 58604,
};

function savedEnv(): Record<string, string | undefined> {
  return {
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

test("recent limit clamps to 1..10, defaulting to 3", () => {
  assert.equal(clampRecentLimit(undefined), 3);
  assert.equal(clampRecentLimit("2"), 2);
  assert.equal(clampRecentLimit("99"), 10);
  assert.equal(clampRecentLimit("0"), 1);
  assert.equal(clampRecentLimit("nope"), 3);
  assert.equal(clampRecentLimit(5), 5);
});

test("recent runs parse rows newest-first", async () => {
  const saved = savedEnv();
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    let seenUrl = "";
    const runs = await fetchRecentRuns(2, {
      fetchImpl: async (input) => {
        seenUrl = String(input);
        return {
          ok: true,
          status: 200,
          json: async () => [ROW, { ...ROW, id: "second" }],
        };
      },
    });
    assert.ok(seenUrl.includes("/rest/v1/peptide_runs?"));
    assert.ok(seenUrl.includes("status=eq.success"));
    assert.ok(seenUrl.includes("order=created_at.desc"));
    assert.ok(seenUrl.includes("limit=2"));
    assert.equal(runs.length, 2);
    assert.equal(runs[0]?.candidateId, "SB-KNOT-1ABC");
    assert.equal(runs[0]?.createdAt, ROW.created_at);
    assert.equal(runs[1]?.id, "second");
  } finally {
    restoreEnv(saved);
  }
});

test("recent runs degrade to empty without env or on faults", async () => {
  const saved = savedEnv();
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    let calls = 0;
    const noEnv = await fetchRecentRuns(3, {
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200, json: async () => [] };
      },
    });
    assert.deepEqual(noEnv, []);
    assert.equal(calls, 0);

    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    const httpFail = await fetchRecentRuns(3, {
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    });
    assert.deepEqual(httpFail, []);
    const transportFail = await fetchRecentRuns(3, {
      fetchImpl: async () => {
        throw new Error("boom");
      },
    });
    assert.deepEqual(transportFail, []);
    const malformed = await fetchRecentRuns(3, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => [{ nope: true }, "junk", ROW],
      }),
    });
    assert.equal(malformed.length, 1);
    assert.equal(malformed[0]?.candidateId, "SB-KNOT-1ABC");
  } finally {
    restoreEnv(saved);
  }
});

test("run detail fetches one row with blobs", async () => {
  const saved = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  const restore = (): void => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    let seenUrl = "";
    const full = {
      ...ROW,
      target_class: "bacterial-colonization",
      request: { target: ROW.target },
      research_provenance: { status: "ok" },
      refinement_trace: [{ turn: 1 }],
      candidate: { sequence: ROW.candidate_sequence },
      symbolic_audit: { charge: 4 },
      lab_handoff: { cai: 0.98 },
      agent_tools: [],
    };
    const found = await fetchRunById(ROW.id, {
      fetchImpl: async (input) => {
        seenUrl = String(input);
        return {
          ok: true,
          status: 200,
          json: async () => [full],
        };
      },
    });
    assert.ok(seenUrl.includes(`id=eq.${ROW.id}`));
    assert.ok(found !== null);
    assert.equal(found.targetClass, "bacterial-colonization");
    assert.deepEqual(found.candidate, {
      sequence: ROW.candidate_sequence,
    });

    const missing = await fetchRunById(ROW.id, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => [],
      }),
    });
    assert.equal(missing, null);
    assert.equal(await fetchRunById("not-a-uuid"), null);
  } finally {
    restore();
  }
});

test("run route validates ids and degrades to 404", async () => {
  const saved = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bad = await runGET({
      headers: new Headers(),
      nextUrl: { searchParams: new URLSearchParams("id=nope") },
    } as unknown as NextRequest);
    assert.equal(bad.status, 400);
    const missing = await runGET({
      headers: new Headers(),
      nextUrl: { searchParams: new URLSearchParams(`id=${ROW.id}`) },
    } as unknown as NextRequest);
    assert.equal(missing.status, 404);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("recent route returns an empty feed without env", async () => {
  const saved = savedEnv();
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const req = {
      headers: new Headers(),
    } as unknown as NextRequest;
    const res = await recentGET(req);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body["success"], true);
    assert.deepEqual(body["data"], []);
  } finally {
    restoreEnv(saved);
  }
});
