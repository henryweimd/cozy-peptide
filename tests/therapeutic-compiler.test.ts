import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";

import {
  auditFailureModes,
  auditPeptideCandidate,
} from "../lib/symbolic-auditor";
import {
  MODALITIES,
  loopSegmentsForModality,
  parseModalityGrammar,
  specForModality,
} from "../lib/modality";
import {
  buildRepairSteering,
  buildSteeringBrief,
  inferTargetClass,
} from "../lib/prompt-steering";
import {
  assessCandidate,
  computeSafetyIndex,
  computeTherapeuticIndex,
} from "../lib/therapeutic-index";
import {
  buildKnottinPrompt,
  buildRepairPrompt,
  buildSemanticProposePrompt,
  extractCandidateSequences,
  generateVerifiedPeptide,
  sampleFallbackCandidates,
} from "../lib/meta-spark";
import { buildSpecificityPrompt } from "../lib/specificity";
import { CandidatePayloadSchema } from "../types/peptide";
import { POST } from "../app/api/generate-peptide/route";

const TARGET = "TNF-alpha gut inflammation";

test("modality grammars enforce topology per scaffold", () => {
  // 4-cysteine: gaps of 3 pass, adjacent cysteines fail spacing.
  assert.equal(parseModalityGrammar("CAAACAAACAAAC", "disulfide-4c").valid, true);
  const tight = parseModalityGrammar("CCAAAAACAAAAAC", "disulfide-4c");
  assert.equal(tight.valid, false);
  assert.ok(tight.syntaxErrors.some((e) => e.includes("cysteine_spacing")));

  // 2-cysteine: loop of 6 passes, short loop fails.
  assert.equal(parseModalityGrammar("CAAAAAAC", "disulfide-2c").valid, true);
  const short = parseModalityGrammar("CAAAC", "disulfide-2c");
  assert.equal(short.valid, false);

  // Linear: cysteine-free passes, any cysteine fails.
  assert.equal(parseModalityGrammar("ADEFGHIKLMNQSTVWY", "linear").valid, true);
  const withCys = parseModalityGrammar("ACDEFGHIKLMNQSTVWY", "linear");
  assert.equal(withCys.valid, false);
  assert.ok(withCys.syntaxErrors.some((e) => e.includes("cysteine_topology")));

  // Knottin dispatch matches the canonical parser.
  const knot = sampleFallbackCandidates(TARGET, 4, 1)[0] ?? "";
  assert.equal(parseModalityGrammar(knot, "knottin-6c").valid, true);
  assert.deepEqual(loopSegmentsForModality(parseModalityGrammar(knot, "knottin-6c"), "knottin-6c").length, 5);
  assert.deepEqual(
    loopSegmentsForModality(
      parseModalityGrammar("CAAACAAACAAAC", "disulfide-4c"),
      "disulfide-4c"
    ),
    ["AAA", "AAA", "AAA"]
  );
  assert.deepEqual(
    loopSegmentsForModality(
      parseModalityGrammar("ADEFGHIKLMNQSTVWY", "linear"),
      "linear"
    ),
    []
  );
});

test("auditor rejects oxidation, deamidation, and isomerization liabilities", () => {
  const clean = sampleFallbackCandidates(TARGET, 2, 1)[0] ?? "";
  assert.equal(auditPeptideCandidate(clean, 2).passed, true);

  // Two methionines trip the oxidation gate.
  const metRich = `MM${clean.slice(2)}`;
  assert.ok(
    auditFailureModes(auditPeptideCandidate(metRich, 2)).includes(
      "OXIDATION_LIABILITY"
    )
  );

  // NG and DG hotspots trip their own gates.
  const withNg = `${clean.slice(0, 10)}NG${clean.slice(12)}`;
  assert.ok(
    auditFailureModes(auditPeptideCandidate(withNg, 2)).includes(
      "DEAMIDATION_HOTSPOT"
    )
  );
  const withDg = `${clean.slice(0, 10)}DG${clean.slice(12)}`;
  assert.ok(
    auditFailureModes(auditPeptideCandidate(withDg, 2)).includes(
      "ISOMERIZATION_HOTSPOT"
    )
  );
});

test("auditor enforces modality length and cysteine windows", () => {
  // A knottin-length linear body fails the linear cysteine rule (6 Cys).
  const knot = sampleFallbackCandidates(TARGET, 4, 1)[0] ?? "";
  assert.ok(
    auditFailureModes(auditPeptideCandidate(knot, 4, "linear")).includes(
      "CYSTEINE_TOPOLOGY_VIOLATION"
    )
  );

  // A valid linear fails knottin length + cysteine rules.
  const lin = sampleFallbackCandidates(TARGET, 2, 1, "linear")[0] ?? "";
  const modes = auditFailureModes(auditPeptideCandidate(lin, 2, "knottin-6c"));
  assert.ok(modes.includes("LENGTH_VIOLATION"));
  assert.ok(modes.includes("CYSTEINE_TOPOLOGY_VIOLATION"));

  // Every modality spec carries a sane window.
  for (const modality of MODALITIES) {
    const spec = specForModality(modality);
    assert.ok(spec.minLength >= 8 && spec.maxLength <= 36);
    assert.ok(spec.gravyMin < spec.gravyMax);
  }
});

test("fallback sampler yields passing candidates for every modality", () => {
  for (const modality of MODALITIES) {
    for (const charge of [1, 2, 3, 4]) {
      const pool = sampleFallbackCandidates(TARGET, charge, 3, modality);
      assert.equal(pool.length, 3, `${modality} charge ${charge}`);
      for (const seq of pool) {
        assert.equal(
          parseModalityGrammar(seq, modality).valid,
          true,
          `${modality} ${seq}`
        );
        const audit = auditPeptideCandidate(seq, charge, modality);
        assert.equal(audit.passed, true, `${modality} ${seq}: ${audit.violations.join("; ")}`);
        assert.deepEqual(auditFailureModes(audit), []);
      }
    }
  }
});

test("prompt steering classifies targets and briefs the model", () => {
  assert.equal(
    inferTargetClass("Clostridioides difficile colonization in the gut"),
    "bacterial-colonization"
  );
  assert.equal(
    inferTargetClass("Irritable bowel syndrome abdominal pain"),
    "pain-motility"
  );
  assert.equal(
    inferTargetClass("Intestinal barrier dysfunction and mucosal healing"),
    "barrier-repair"
  );
  assert.equal(
    inferTargetClass("Some entirely novel condition xyz"),
    "general"
  );

  const { targetClass, brief } = buildSteeringBrief(
    "Clostridioides difficile colonization in the gut",
    "cationic membrane activity"
  );
  assert.equal(targetClass, "bacterial-colonization");
  assert.ok(brief.includes("bacterial colonization"));
  assert.ok(brief.includes("Safety contract"));
  assert.ok(brief.includes("cationic membrane activity"));

  // Repair steering ranks recurring failure modes first.
  const steering = buildRepairSteering([
    { failure_modes: ["CHARGE_TARGET_MISMATCH"] },
    { failure_modes: ["CHARGE_TARGET_MISMATCH", "GRAVY_OUT_OF_BOUNDS"] },
  ] as never);
  assert.ok(steering !== null && steering.includes("CHARGE_TARGET_MISMATCH (x2)"));
  assert.equal(buildRepairSteering([]), null);
});

test("therapeutic and safety indices reward clean designs", () => {
  const clean = sampleFallbackCandidates(TARGET, 2, 1, "linear")[0] ?? "";
  const dirty = `MMKK${clean.slice(4)}`;
  const cleanTherapeutic = computeTherapeuticIndex(clean, "linear", 2);
  const dirtyTherapeutic = computeTherapeuticIndex(dirty, "linear", 2);
  const cleanSafety = computeSafetyIndex(clean);
  const dirtySafety = computeSafetyIndex(dirty);
  for (const value of [
    cleanTherapeutic.index,
    dirtyTherapeutic.index,
    cleanSafety.index,
    dirtySafety.index,
  ]) {
    assert.ok(value >= 0 && value <= 100);
  }
  assert.ok(
    cleanSafety.index > dirtySafety.index,
    `${cleanSafety.index} vs ${dirtySafety.index}`
  );
  assert.ok(
    cleanTherapeutic.index > dirtyTherapeutic.index,
    `${cleanTherapeutic.index} vs ${dirtyTherapeutic.index}`
  );

  const assessment = assessCandidate(clean, "linear", 2);
  assert.equal(assessment.therapeutic_index, cleanTherapeutic.index);
  assert.equal(assessment.safety_index, cleanSafety.index);
  assert.ok(typeof assessment.therapeutic_breakdown.proteaseResistance === "number");
  assert.ok(typeof assessment.safety_breakdown.chemicalStability === "number");
});

test("prompts carry steering, modality constraints, and labels", () => {
  const linear = buildSemanticProposePrompt(TARGET, 2, "brief text", "linear");
  assert.ok(linear.includes("Linear topology"));
  assert.ok(linear.includes("System steering: brief text"));
  assert.ok(linear.includes("Saccharomyces boulardii"));

  const repair = buildRepairPrompt("ACDE", "diag", 2, undefined, "steer", "linear");
  assert.ok(repair.includes("linear peptide secretion payload"));
  assert.ok(repair.includes("steer"));
  assert.ok(repair.includes("CANDIDATE <n>"));

  const knottin = buildKnottinPrompt(TARGET, 4, "brief text");
  assert.ok(knottin.includes("System steering: brief text"));

  assert.ok(buildSpecificityPrompt("C".repeat(30), 4, "linear").includes("linear peptide"));
});

test("extraction requires labels for short modalities", () => {
  // "CANDIDATE" alone is 9 canonical letters — bare extraction would
  // mistake prose for peptides, so short modalities require labels.
  const completion = [
    "CANDIDATE words appear in this prose.",
    "CANDIDATE 1: ACDEFGHIKLMN",
  ].join("\n");
  assert.deepEqual(
    extractCandidateSequences(completion, 8, 30, false),
    ["ACDEFGHIKLMN"]
  );
  assert.ok(
    extractCandidateSequences(completion, 8, 30, true).includes("CANDIDATE")
  );
});

test("route serves every modality with indices and handoff", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  process.env.API_BEARER_TOKEN = "test-token";
  const req = (body: unknown): NextRequest =>
    ({
      headers: new Headers({ authorization: "Bearer test-token" }),
      json: async () => body,
    }) as unknown as NextRequest;

  assert.equal(
    (await POST(req({ target: TARGET, modality: "bogus" }))).status,
    400
  );

  const cases = [
    {
      modality: "linear",
      responseId: "engineered_linear_peptide",
      idPrefix: "SB-LIN-",
      cys: 0,
    },
    {
      modality: "disulfide-2c",
      responseId: "engineered_disulfide_peptide_2c",
      idPrefix: "SB-SS2-",
      cys: 2,
    },
    {
      modality: "disulfide-4c",
      responseId: "engineered_disulfide_peptide_4c",
      idPrefix: "SB-SS4-",
      cys: 4,
    },
  ] as const;
  for (const { modality, responseId, idPrefix, cys } of cases) {
    const res = await POST(req({ target: TARGET, charge_target: 2, modality }));
    assert.equal(res.status, 200, modality);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body["modality"], responseId);
    const candidate = body["candidate"] as Record<string, unknown>;
    assert.equal(CandidatePayloadSchema.safeParse(candidate).success, true);
    assert.ok((candidate["id"] as string).startsWith(idPrefix));
    assert.equal((candidate["cysteine_indices"] as number[]).length, cys);
    const audit = body["symbolic_audit"] as Record<string, unknown>;
    assert.equal(audit["passed"], true);
    assert.ok(typeof audit["therapeutic_index"] === "number");
    assert.ok(typeof audit["safety_index"] === "number");
    const cloning = candidate["cloning_payload"] as Record<string, unknown>;
    assert.ok(
      ((cloning["cassette_format"] as string) ?? "").startsWith("MFalpha1-Kex2-")
    );
  }
});

test("generation threads mechanism into steering", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  const result = await generateVerifiedPeptide(TARGET, 2, 3, undefined, {
    modality: "linear",
    mechanism: "cationic membrane activity",
  });
  assert.equal(result.audit.passed, true);
  assert.ok(typeof result.audit.therapeutic_index === "number");
  assert.ok(typeof result.audit.safety_index === "number");
  assert.ok(
    result.refinementHistory.some((entry) => entry.disposition === "accepted")
  );
});
