import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fetchCitations,
  saveCitations,
  type StoredCitation,
} from "../lib/db/citations";
import { buildRunRecord, recordRun } from "../lib/db/runs";

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

function stubCitation(): StoredCitation {
  return {
    source: "pubmed",
    externalId: "12345",
    title: "A gut peptide study",
    snippet: "Findings about colonization resistance.",
    url: "https://pubmed.ncbi.nlm.nih.gov/12345/",
    year: "2024",
  };
}

test("saveCitations reports env-missing without throwing", async () => {
  const saved = savedEnv();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const result = await saveCitations("run-1", [stubCitation()]);
    assert.equal(result.saved, 0);
    assert.equal(result.error, "Supabase env not configured");
  } finally {
    restoreEnv(saved);
  }
});

test("saveCitations posts mapped rows with merge-duplicates", async () => {
  const saved = savedEnv();
  process.env.SUPABASE_URL = "https://example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    let seenUrl = "";
    let seenBody = "";
    let seenPrefer = "";
    const result = await saveCitations("run-1", [stubCitation()], {
      fetchImpl: (async (input, init) => {
        seenUrl = String(input);
        seenBody = String(init?.body ?? "");
        seenPrefer = String(
          (init?.headers as Record<string, string>)["Prefer"] ?? ""
        );
        return { ok: true, status: 201, json: async () => null };
      }),
    });
    assert.equal(result.saved, 1);
    assert.equal(result.error, undefined);
    assert.match(seenUrl, /\/rest\/v1\/research_citations$/);
    assert.match(seenPrefer, /merge-duplicates/);
    const rows = JSON.parse(seenBody) as Array<Record<string, unknown>>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.["run_id"], "run-1");
    assert.equal(rows[0]?.["external_id"], "12345");
    assert.equal(rows[0]?.["title"], "A gut peptide study");
  } finally {
    restoreEnv(saved);
  }
});

test("saveCitations surfaces HTTP faults as errors, never throws", async () => {
  const saved = savedEnv();
  process.env.SUPABASE_URL = "https://example.test";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  try {
    const result = await saveCitations("run-1", [stubCitation()], {
      fetchImpl: (async () => ({
        ok: false,
        status: 404,
        json: async () => null,
      })),
    });
    assert.equal(result.saved, 0);
    assert.equal(result.error, "Supabase HTTP 404");
  } finally {
    restoreEnv(saved);
  }
});

test("fetchCitations rejects non-UUID run ids without network", async () => {
  let called = false;
  const citations = await fetchCitations("not-a-uuid", {
    fetchImpl: (async () => {
      called = true;
      return { ok: true, status: 200, json: async () => [] };
    }),
  });
  assert.deepEqual(citations, []);
  assert.equal(called, false);
});

test("fetchCitations maps rows and skips malformed entries", async () => {
  const saved = savedEnv();
  process.env.SUPABASE_URL = "https://example.test";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  try {
    const citations = await fetchCitations(
      "11111111-1111-1111-1111-111111111111",
      {
        fetchImpl: (async () => ({
          ok: true,
          status: 200,
          json: async () => [
            {
              source: "pubmed",
              external_id: "12345",
              title: "A gut peptide study",
              snippet: "Findings.",
              url: "https://pubmed.ncbi.nlm.nih.gov/12345/",
              year: "2024",
            },
            { source: "", external_id: "" },
            "garbage",
          ],
        })),
      }
    );
    assert.equal(citations.length, 1);
    assert.equal(citations[0]?.externalId, "12345");
    assert.equal(citations[0]?.year, "2024");
  } finally {
    restoreEnv(saved);
  }
});

test("recordRun chains citation rows and stays silent on faults", async () => {
  const saved = savedEnv();
  // Discard-port localhost: citation write fails fast, offline-safe.
  process.env.SUPABASE_URL = "http://127.0.0.1:9";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  try {
    const record = buildRunRecord({
      source: "api",
      params: {
        target: "Clostridioides difficile colonization in the gut",
        charge_target: 4,
        modality: "knottin-6c",
        model: "muse-spark-1.3-contributor",
        research: true,
      },
      elapsedMs: 100,
      ok: true,
      payload: {
        success: true,
        research_provenance: {
          status: "ok",
          evidence: [
            {
              source: "pubmed",
              id: "12345",
              title: "A gut peptide study",
              snippet: "Findings.",
              url: "https://pubmed.ncbi.nlm.nih.gov/12345/",
              year: "2024",
            },
            { source: "", id: "" },
          ],
        },
      },
    });
    await recordRun(record, {
      fetchImpl: (async () => ({
        ok: true,
        status: 201,
        json: async () => [{ id: "22222222-2222-2222-2222-222222222222" }],
      })),
      timeoutMs: 2000,
    });
    assert.ok(
      warnings.some((warning) => warning.includes("citations write failed")),
      `expected a citations warning, got: ${warnings.join(" | ")}`
    );
  } finally {
    console.warn = originalWarn;
    restoreEnv(saved);
  }
});
