import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fetchCommunityAssays,
  saveAssayResult,
  uploadAssayRaw,
} from "../lib/db/assays";

function saveEnv(): Record<string, string | undefined> {
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

function useFakeLedger(): void {
  process.env.SUPABASE_URL = "http://ledger.local";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
}

test("assay store reports missing env without network", async () => {
  const saved = saveEnv();
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const result = await saveAssayResult({
      run_id: "123e4567-e89b-12d3-a456-426614174000",
      assay_type: "mic",
      template_version: "labguide-1",
      measurements: [],
      consent_community: false,
      consent_license: "CC0",
    });
    assert.equal(result.saved, false);
    assert.equal(await fetchCommunityAssays(10), null);
    const upload = await uploadAssayRaw("a/b.csv", "QUJD", "text/csv");
    assert.equal(upload.ok, false);
  } finally {
    restoreEnv(saved);
  }
});

test("assay store saves and exports through mocked fetch", async () => {
  const saved = saveEnv();
  const seen: string[] = [];
  try {
    useFakeLedger();
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("/rest/v1/assay_results") && !url.includes("consent_community")) {
        return {
          ok: true,
          status: 201,
          json: async () => [{ id: "assay-1" }],
        };
      }
      if (url.includes("/rest/v1/assay_results")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "assay-1",
              created_at: "2026-11-01T00:00:00Z",
              run_id: "run-1",
              assay_type: "mic",
              template_version: "labguide-1",
              organism_or_cells: "C. difficile",
              value_num: 8,
              value_unit: "ug/mL",
              value_text: null,
              passed: null,
              measurements: [],
              consent_license: "CC0",
            },
          ],
        };
      }
      return { ok: true, status: 200 };
    };
    const result = await saveAssayResult(
      {
        run_id: "123e4567-e89b-12d3-a456-426614174000",
        assay_type: "mic",
        template_version: "labguide-1",
        organism_or_cells: "C. difficile",
        value_num: 8,
        value_unit: "ug/mL",
        measurements: [{ row: 2, fields: { strain: "C. difficile" } }],
        raw_file_name: "mic.csv",
        raw_storage_path: "run/mic/1-mic.csv",
        consent_community: true,
        consent_license: "CC0",
      },
      { fetchImpl }
    );
    assert.equal(result.saved, true);
    assert.equal(result.id, "assay-1");

    const upload = await uploadAssayRaw("run/mic/1-mic.csv", "QUJD", "text/csv", {
      fetchImpl,
    });
    assert.equal(upload.ok, true);
    assert.ok(seen.some((url) => url.includes("/storage/v1/object/assay-raw/")));

    const rows = await fetchCommunityAssays(10, { fetchImpl });
    assert.ok(rows !== null && rows.length === 1);
    assert.equal(rows?.[0]?.consent_license, "CC0");
    assert.ok(
      seen.some((url) => url.includes("consent_community=eq.true")),
      "export filters to consented rows"
    );
  } finally {
    restoreEnv(saved);
  }
});
