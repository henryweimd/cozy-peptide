import { test } from "node:test";
import assert from "node:assert/strict";

import { buildLabHandoff } from "../lib/lab-handoff";
import {
  LAB_DISPATCH_SCHEMA,
  buildLabDispatch,
} from "../lib/lab-dispatch";
import type { RunDetail } from "../lib/db/recent";

function detailWithHandoff(labHandoff: unknown): RunDetail {
  return {
    id: "123e4567-e89b-12d3-a456-426614174000",
    createdAt: "2026-11-01T00:00:00Z",
    source: "api",
    status: "success",
    target: "C. difficile colonization",
    modality: "knottin-6c",
    chargeTarget: 4,
    researchStatus: "complete",
    candidateId: "cand-1",
    candidateSequence: "CSRTTCSQDTVCKVSKCSVCRIKSVNTC",
    therapeuticIndex: 9.1,
    safetyIndex: 88.4,
    elapsedMs: 1200,
    targetClass: "bacterial-colonization",
    narrative: null,
    request: null,
    researchProvenance: null,
    refinementTrace: null,
    candidate: null,
    symbolicAudit: null,
    labHandoff,
    agentTools: null,
    stageTrace: null,
    specificity: null,
    chassis: null,
    biocontainment: null,
    sparkFailures: null,
    structurePdb: null,
    structurePlddt: null,
    structurePredictedAt: null,
  };
}

test("dispatch packages design specs plus the experiment panel", () => {
  const handoff = buildLabHandoff(
    "CSRTTCSQDTVCKVSKCSVCRIKSVNTC",
    "knottin-6c",
    "sboulardii"
  );
  const dispatch = buildLabDispatch(detailWithHandoff(handoff));
  assert.ok(dispatch !== null);
  assert.equal(dispatch?.schema, LAB_DISPATCH_SCHEMA);
  assert.equal(dispatch?.design.candidate_sequence, "CSRTTCSQDTVCKVSKCSVCRIKSVNTC");
  assert.ok((dispatch?.design.dna_gblock.length ?? 0) > 100);
  assert.deepEqual(
    Object.keys(dispatch?.experiment_panel ?? {}).sort(),
    ["cytotoxicity", "expression_titer", "mic", "sequence_verification"]
  );
  assert.equal(dispatch?.result_ingest.endpoint, "/api/assay-results");
  assert.equal(dispatch?.result_ingest.consent_license_default, "CC0");
});

test("dispatch accepts the stored ledger shape", () => {
  const built = buildLabHandoff(
    "CSRTTCSQDTVCKVSKCSVCRIKSVNTC",
    "knottin-6c",
    "sboulardii"
  );
  const { dna_gblock, cdna_sequence, ...rest } = built;
  const stored = {
    ...rest,
    gblock_manifest: dna_gblock,
    cDNA_sequence: cdna_sequence,
  };
  const dispatch = buildLabDispatch(detailWithHandoff(stored));
  assert.ok(dispatch !== null);
  assert.equal(dispatch?.design.dna_gblock, dna_gblock);
  assert.equal(dispatch?.design.cdna_sequence, cdna_sequence);
});

test("dispatch refuses runs without a usable handoff", () => {
  assert.equal(buildLabDispatch(detailWithHandoff(null)), null);
  assert.equal(buildLabDispatch(detailWithHandoff({ nope: true })), null);
  const detail = detailWithHandoff(
    buildLabHandoff("CSRTTCSQDTVCKVSKCSVCRIKSVNTC", "knottin-6c", "sboulardii")
  );
  detail.candidateSequence = null;
  assert.equal(buildLabDispatch(detail), null);
});
