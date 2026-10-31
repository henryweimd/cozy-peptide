import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";

import {
  FoldError,
  ESMFOLD_MAX_LENGTH,
  foldSequence,
  meanPlddtFromPdb,
  normalizePdbPlddt,
} from "../lib/esmfold";
import { POST as foldPOST } from "../app/api/fold-peptide/route";

const PDB = [
  "ATOM      1  N   CYS A   1      11.104  13.207   2.100  1.00 92.10           N",
  "ATOM      2  CA  CYS A   1      12.104  13.507   2.400  1.00 90.00           C",
  "ATOM      3  C   CYS A   1      13.104  13.807   2.700  1.00 88.00           C",
  "ATOM      4  N   ALA A   2      14.104  14.107   3.000  1.00 82.00           N",
  "ATOM      5  CA  ALA A   2      15.104  14.407   3.300  1.00 70.00           C",
  "ATOM      6  SG  CYS A   1      16.104  14.707   3.600  1.00 95.00           S",
  "TER",
  "END",
].join("\n");

test("pLDDT averages C-alpha B-factors only", () => {
  assert.equal(meanPlddtFromPdb(PDB), 80);
  assert.equal(meanPlddtFromPdb("ATOM      1  N   ALA A   1       0.0   0.0   0.0  1.00 50.00           N\n"), null);
  assert.equal(meanPlddtFromPdb("not a pdb file"), null);
  assert.equal(meanPlddtFromPdb(""), null);
});

test("fractional Atlas pLDDT normalizes to the 0-100 scale", () => {
  const fractional = [
    "ATOM      1  N   CYS A   1      11.104  13.207   2.100  1.00  0.92           N",
    "ATOM      2  CA  CYS A   1      12.104  13.507   2.400  1.00  0.90           C",
    "ATOM      3  C   CYS A   1      13.104  13.807   2.700  1.00  0.88           C",
    "ATOM      4  N   ALA A   2      14.104  14.107   3.000  1.00  0.82           N",
    "ATOM      5  CA  ALA A   2      15.104  14.407   3.300  1.00  0.70           C",
    "TER",
    "END",
  ].join("\n");
  const scaled = normalizePdbPlddt(fractional);
  assert.equal(meanPlddtFromPdb(scaled), 80);
  assert.ok(scaled.includes(" 90.00 "));
  assert.ok(scaled.includes(" 70.00 "));
  assert.equal(normalizePdbPlddt(PDB), PDB);
});

test("fold posts raw text and returns coordinates plus confidence", async () => {
  let seenUrl = "";
  let seenContentType = "";
  let seenBody = "";
  const result = await foldSequence("CAGSTCTGSA", {
    fetchImpl: async (input, init) => {
      seenUrl = String(input);
      seenContentType = new Headers(init?.headers).get("content-type") ?? "";
      seenBody = String(init?.body ?? "");
      return { ok: true, status: 200, text: async () => PDB };
    },
  });
  assert.equal(seenUrl, "https://api.esmatlas.com/foldSequence/v1/pdb/");
  assert.equal(seenContentType, "text/plain");
  assert.equal(seenBody, "CAGSTCTGSA");
  assert.equal(result.plddt, 80);
  assert.ok(result.pdb.includes("ATOM"));
});

test("fold maps rate limits, failures, and aborts to typed errors", async () => {
  await assert.rejects(
    foldSequence("CAGSTCTGSA", {
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        text: async () => "slow down",
      }),
    }),
    (error: unknown) =>
      error instanceof FoldError &&
      error.kind === "rate-limited" &&
      error.httpStatus === 429
  );
  await assert.rejects(
    foldSequence("CAGSTCTGSA", {
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        text: async () => "bad",
      }),
    }),
    (error: unknown) =>
      error instanceof FoldError && error.kind === "upstream"
  );
  await assert.rejects(
    foldSequence("CAGSTCTGSA", {
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => "" }),
    }),
    (error: unknown) =>
      error instanceof FoldError && error.kind === "unparseable"
  );
  const abort = new Error("aborted");
  abort.name = "AbortError";
  await assert.rejects(
    foldSequence("CAGSTCTGSA", {
      fetchImpl: async () => {
        throw abort;
      },
    }),
    (error: unknown) =>
      error instanceof FoldError &&
      error.kind === "timeout" &&
      error.httpStatus === 504
  );
});

test("fold route validates sequences before any upstream call", async () => {
  const req = (body: unknown): NextRequest =>
    ({
      headers: new Headers(),
      json: async () => body,
    }) as unknown as NextRequest;

  for (const bad of [
    { sequence: "cagstctgsa" },
    { sequence: "CAGSTCTGZ" },
    { sequence: "" },
    { sequence: "A".repeat(ESMFOLD_MAX_LENGTH + 1) },
    { nope: 1 },
  ]) {
    const res = await foldPOST(req(bad));
    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body["success"], false);
  }
});

test("fold route proxies success and rate limits as clean JSON", async () => {
  const realFetch = globalThis.fetch;
  const req = (body: unknown): NextRequest =>
    ({
      headers: new Headers(),
      json: async () => body,
    }) as unknown as NextRequest;
  try {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      text: async () => PDB,
    })) as unknown as typeof fetch;
    const ok = await foldPOST(req({ sequence: "CAGSTCTGSA" }));
    assert.equal(ok.status, 200);
    const okBody = (await ok.json()) as Record<string, unknown>;
    assert.equal(okBody["success"], true);
    assert.equal(okBody["plddt"], 80);
    assert.ok(String(okBody["pdb"]).includes("ATOM"));

    globalThis.fetch = (async () => ({
      ok: false,
      status: 429,
      text: async () => "slow down",
    })) as unknown as typeof fetch;
    const limited = await foldPOST(req({ sequence: "CAGSTCTGSA" }));
    assert.equal(limited.status, 429);
    const limitedBody = (await limited.json()) as Record<string, unknown>;
    assert.equal(limitedBody["success"], false);
  } finally {
    globalThis.fetch = realFetch;
  }
});
