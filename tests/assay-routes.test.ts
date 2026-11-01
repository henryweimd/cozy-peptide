import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";

import { GET as templatesGET } from "../app/api/assay-templates/route";
import { POST as resultsPOST } from "../app/api/assay-results/route";
import { GET as dispatchGET } from "../app/api/lab-dispatch/route";
import { GET as exportGET } from "../app/api/assay-export/route";
import { BIOSECURITY_REFUSAL } from "../lib/biosecurity";
import { ASSAY_TEMPLATE_VERSION } from "../lib/assay-ingest";

const TEST_TOKEN = "lab-test-token";
const RUN_ID = "123e4567-e89b-12d3-a456-426614174000";

function saveEnv(): Record<string, string | undefined> {
  return {
    API_BEARER_TOKEN: process.env.API_BEARER_TOKEN,
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
  return {
    headers,
    nextUrl: new URL(url),
  } as unknown as NextRequest;
}

function postReq(body: unknown, token?: string): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return {
    headers,
    json: async () => body,
  } as unknown as NextRequest;
}

const MIC_CSV =
  "strain,mic_ug_ml,method,replicate\nC. difficile,8,broth microdilution,1\n";

function submission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: RUN_ID,
    assay_type: "mic",
    template_version: ASSAY_TEMPLATE_VERSION,
    file_name: "mic.csv",
    content_text: MIC_CSV,
    consent_community: false,
    ...overrides,
  };
}

test("assay templates download per type", async () => {
  const ok = await templatesGET(
    getReq("http://x/api/assay-templates?type=mic")
  );
  assert.equal(ok.status, 200);
  assert.ok((ok.headers.get("Content-Type") ?? "").includes("text/csv"));
  const body = await ok.text();
  assert.ok(body.startsWith("strain,mic_ug_ml,method,replicate"));

  const bad = await templatesGET(
    getReq("http://x/api/assay-templates?type=bogus")
  );
  assert.equal(bad.status, 400);
});

test("assay results require a Bearer [REDACTED]", async () => {
  const saved = saveEnv();
  try {
    process.env.API_BEARER_TOKEN = TEST_TOKEN;
    const missing = await resultsPOST(postReq(submission()));
    assert.equal(missing.status, 401);
    const wrong = await resultsPOST(postReq(submission(), "nope"));
    assert.equal(wrong.status, 401);
    delete process.env.API_BEARER_TOKEN;
    const misconfigured = await resultsPOST(
      postReq(submission(), TEST_TOKEN)
    );
    assert.equal(misconfigured.status, 500);
  } finally {
    restoreEnv(saved);
  }
});

test("assay results validate before touching the ledger", async () => {
  const saved = saveEnv();
  try {
    process.env.API_BEARER_TOKEN = TEST_TOKEN;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const badShape = await resultsPOST(
      postReq({ assay_type: "mic" }, TEST_TOKEN)
    );
    assert.equal(badShape.status, 400);

    const badVersion = await resultsPOST(
      postReq(submission({ template_version: "ancient" }), TEST_TOKEN)
    );
    assert.equal(badVersion.status, 400);

    const bothContents = await resultsPOST(
      postReq(
        submission({ content_base64: "QUJD" }),
        TEST_TOKEN
      )
    );
    assert.equal(bothContents.status, 400);

    const blocked = await resultsPOST(
      postReq(
        submission({ notes: "compare against ricin cytotoxicity" }),
        TEST_TOKEN
      )
    );
    assert.equal(blocked.status, 400);
    const blockedBody = (await blocked.json()) as Record<string, unknown>;
    assert.equal(blockedBody["error"], BIOSECURITY_REFUSAL);

    const badCsv = await resultsPOST(
      postReq(submission({ content_text: "a,b\n1,2\n" }), TEST_TOKEN)
    );
    assert.equal(badCsv.status, 400);
    const badCsvBody = (await badCsv.json()) as Record<string, unknown>;
    assert.ok(
      String(
        ((badCsvBody["details"] as Record<string, unknown>)?.["parse_errors"] as string[])?.[0] ?? ""
      ).includes("Unrecognized header")
    );

    const binary = await resultsPOST(
      postReq(
        submission({
          content_text: undefined,
          content_base64: Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64"),
        }),
        TEST_TOKEN
      )
    );
    assert.equal(binary.status, 400);

    const oversize = await resultsPOST(
      postReq(
        submission({ content_text: `strain,mic_ug_ml,method,replicate\n${"x".repeat(2_100_000)}` }),
        TEST_TOKEN
      )
    );
    assert.equal(oversize.status, 413);
  } finally {
    restoreEnv(saved);
  }
});

test("assay results report ledger outages as 503", async () => {
  const saved = saveEnv();
  try {
    process.env.API_BEARER_TOKEN = TEST_TOKEN;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const down = await resultsPOST(postReq(submission(), TEST_TOKEN));
    assert.equal(down.status, 503);
  } finally {
    restoreEnv(saved);
  }
});

test("assay results 404 unknown runs without network", async () => {
  const saved = saveEnv();
  try {
    process.env.API_BEARER_TOKEN = TEST_TOKEN;
    process.env.SUPABASE_URL = "http://127.0.0.1:1";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    const missing = await resultsPOST(postReq(submission(), TEST_TOKEN));
    assert.equal(missing.status, 404);
  } finally {
    restoreEnv(saved);
  }
});

test("lab dispatch gates, validates, and 404s cleanly", async () => {
  const saved = saveEnv();
  try {
    process.env.API_BEARER_TOKEN = TEST_TOKEN;
    const noAuth = await dispatchGET(
      getReq(`http://x/api/lab-dispatch?run=${RUN_ID}`)
    );
    assert.equal(noAuth.status, 401);
    const badRun = await dispatchGET(
      getReq("http://x/api/lab-dispatch?run=nope", TEST_TOKEN)
    );
    assert.equal(badRun.status, 400);
    process.env.SUPABASE_URL = "http://127.0.0.1:1";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    const missing = await dispatchGET(
      getReq(`http://x/api/lab-dispatch?run=${RUN_ID}`, TEST_TOKEN)
    );
    assert.equal(missing.status, 404);
  } finally {
    restoreEnv(saved);
  }
});

test("assay export gates and validates format", async () => {
  const saved = saveEnv();
  try {
    process.env.API_BEARER_TOKEN = TEST_TOKEN;
    const noAuth = await exportGET(getReq("http://x/api/assay-export"));
    assert.equal(noAuth.status, 401);
    const badFormat = await exportGET(
      getReq("http://x/api/assay-export?format=xml", TEST_TOKEN)
    );
    assert.equal(badFormat.status, 400);
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const down = await exportGET(
      getReq("http://x/api/assay-export", TEST_TOKEN)
    );
    assert.equal(down.status, 503);
  } finally {
    restoreEnv(saved);
  }
});
