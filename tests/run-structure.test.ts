import { test } from "node:test";
import assert from "node:assert/strict";

import { buildRunRecord, recordRun } from "../lib/db/runs";
import { fetchRunById, updateRunStructure } from "../lib/db/recent";
import { FoldRequestSchema } from "../lib/esmfold";

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

const RUN_ID = "123e4567-e89b-42d3-a456-426614174000";

test("fold request accepts an optional run uuid", () => {
  const parsed = FoldRequestSchema.safeParse({
    sequence: "ACDEFGHIK",
    runId: RUN_ID,
  });
  assert.equal(parsed.success, true);
  const bare = FoldRequestSchema.safeParse({ sequence: "ACDEFGHIK" });
  assert.equal(bare.success, true);
  const bad = FoldRequestSchema.safeParse({
    sequence: "ACDEFGHIK",
    runId: "not-a-uuid",
  });
  assert.equal(bad.success, false);
});

test("recordRun resolves to the new row id", async () => {
  const saved = savedEnv();
  process.env.SUPABASE_URL = "https://example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const record = buildRunRecord({
      source: "api",
      params: { target: "bile acid diarrhea" },
      elapsedMs: 100,
      ok: true,
      payload: { success: true },
    });
    const id = await recordRun(record, {
      fetchImpl: (async () => ({
        ok: true,
        status: 201,
        json: async () => [{ id: RUN_ID }],
      })),
    });
    assert.equal(id, RUN_ID);
  } finally {
    restoreEnv(saved);
  }
});

test("recordRun resolves null when the ledger is down", async () => {
  const saved = savedEnv();
  process.env.SUPABASE_URL = "https://example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  try {
    const record = buildRunRecord({
      source: "api",
      params: { target: "bile acid diarrhea" },
      elapsedMs: 100,
      ok: true,
      payload: { success: true },
    });
    const id = await recordRun(record, {
      fetchImpl: (async () => ({ ok: false, status: 500 })),
    });
    assert.equal(id, null);
    assert.ok(warnings.some((warning) => warning.includes("ledger write")));
  } finally {
    console.warn = originalWarn;
    restoreEnv(saved);
  }
});

test("updateRunStructure patches first-write-wins columns", async () => {
  const saved = savedEnv();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    let seenUrl = "";
    let seenBody = "";
    let seenMethod = "";
    const ok = await updateRunStructure(
      RUN_ID,
      { pdb: "ATOM ...", plddt: 87.5 },
      {
        fetchImpl: (async (input, init) => {
          seenUrl = String(input);
          seenBody = String(init?.body ?? "");
          seenMethod = String(init?.method ?? "");
          return { ok: true, status: 200, json: async () => null };
        }),
      }
    );
    assert.equal(ok, true);
    assert.equal(seenMethod, "PATCH");
    assert.ok(seenUrl.includes(`/rest/v1/peptide_runs?id=eq.${RUN_ID}`));
    assert.ok(seenUrl.includes("structure_pdb=is.null"));
    const body = JSON.parse(seenBody) as Record<string, unknown>;
    assert.equal(body["structure_pdb"], "ATOM ...");
    assert.equal(body["structure_plddt"], 87.5);
    assert.ok(typeof body["structure_predicted_at"] === "string");
  } finally {
    restoreEnv(saved);
  }
});

test("updateRunStructure refuses bad ids and missing env", async () => {
  let called = false;
  const spy = {
    fetchImpl: (async () => {
      called = true;
      return { ok: true, status: 200, json: async () => null };
    }),
  };
  assert.equal(
    await updateRunStructure("not-a-uuid", { pdb: "x", plddt: 1 }, spy),
    false
  );
  assert.equal(
    await updateRunStructure(RUN_ID, { pdb: "", plddt: 1 }, spy),
    false
  );
  assert.equal(called, false);

  const saved = savedEnv();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.equal(
      await updateRunStructure(RUN_ID, { pdb: "x", plddt: 1 }, spy),
      false
    );
    assert.equal(called, false);
  } finally {
    restoreEnv(saved);
  }
});

test("run detail parses stored structure fields", async () => {
  const saved = savedEnv();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const run = await fetchRunById(RUN_ID, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: RUN_ID,
            created_at: "2026-11-01T00:00:00.000Z",
            source: "demo-stream",
            status: "success",
            target: "bile acid diarrhea",
            structure_pdb: "ATOM ...",
            structure_plddt: 87.5,
            structure_predicted_at: "2026-11-01T00:01:00.000Z",
          },
        ],
      }),
    });
    assert.equal(run?.structurePdb, "ATOM ...");
    assert.equal(run?.structurePlddt, 87.5);
    assert.equal(run?.structurePredictedAt, "2026-11-01T00:01:00.000Z");
  } finally {
    restoreEnv(saved);
  }
});
