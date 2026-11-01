import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";

import { cysteineIndices, parseKnottinGrammar } from "../lib/protein-grammar";
import {
  auditFailureModes,
  auditPeptideCandidate,
  buildVerificationReport,
  computeAliphaticIndex,
  computeBomanIndex,
  computeCleavageSusceptibilityIndex,
  computeIsoelectricPoint,
  computeMucosalAdhesionRatio,
  computeNetChargeAtPh,
} from "../lib/symbolic-auditor";
import {
  validateRequestSafety,
  extractRequestedLength,
} from "../lib/biosecurity";
import {
  CODON_TABLE,
  GC_CDS_MAX,
  GC_CDS_MIN,
  RARE_CODONS,
  RESTRICTION_SITES,
  computeCAI,
  findRestrictionSite,
  optimizeForSboulardii,
  optimizePayloadCds,
  translateCds,
} from "../lib/codon-optimizer";
import {
  ALPHA_FACTOR_LEADER_85,
  CASSETTE_FORMAT,
  CASSETTE_LEADER_PROTEIN,
  CYC1_TERMINATOR_250,
  DUAL_STOP_CODON,
  GIBSON_ARM_3,
  GIBSON_ARM_5,
  LEADER_CDS_5FLANK,
  LEADER_JUNCTION_DNA,
  buildCloningPayload,
  buildLabHandoff,
} from "../lib/lab-handoff";
import {
  NeurosymbolicVerificationError,
  extractCandidateSequences,
  generateVerifiedPeptide,
  repairTemperatureForCycle,
  sampleFallbackCandidates,
} from "../lib/meta-spark";
import {
  CandidatePayloadSchema,
  MetaSparkRequestSchema,
  MetaSparkResponseSchema,
} from "../types/peptide";
import {
  POST,
  OPTIONS,
  runtime,
  dynamic,
  maxDuration,
} from "../app/api/generate-peptide/route";
import { POST as demoPOST } from "../app/api/demo-generate/route";
import { POST as demoStreamPOST } from "../app/api/demo-stream/route";
import { DEMO_PRESETS } from "../lib/demo-config";
import {
  buildKnottinPrompt,
  buildRepairPrompt,
  buildSemanticProposePrompt,
  type PipelineEvent,
} from "../lib/meta-spark";
import {
  SPECIFICITY_MAX_TOKENS,
  buildSpecificityPrompt,
  checkSpecificity,
  matchIntendedTarget,
  parseSpecificityResponse,
} from "../lib/specificity";

const TARGET = "TNF-alpha gut inflammation";

test("route segment config exports", () => {
  assert.equal(runtime, "nodejs");
  assert.equal(dynamic, "force-dynamic");
  // 120s headroom: ~15s literature research plus the 50s generation budget.
  assert.equal(maxDuration, 120);
});

test("fallback sampler yields grammar-valid, audit-passing candidates", () => {
  for (const charge of [1, 2, 3, 4]) {
    const pool = sampleFallbackCandidates(TARGET, charge, 5);
    assert.equal(pool.length, 5);
    for (const seq of pool) {
      const grammar = parseKnottinGrammar(seq);
      assert.equal(grammar.valid, true);
      assert.deepEqual(grammar.syntaxErrors, []);
      const audit = auditPeptideCandidate(seq, charge);
      assert.equal(audit.passed, true);
      assert.deepEqual(auditFailureModes(audit), []);
    }
  }
});

test("grammar parser enforces the canonical ICK loop envelopes", () => {
  const notSixCys = `CAAACA${"A".repeat(24)}`;
  assert.equal(parseKnottinGrammar(notSixCys).valid, false);

  // L3 of 5 aa exceeds the 1-4 envelope (L1=3, L2=3, L4=2, L5=4 valid).
  const longL3 = "CAAACAAACAAAAACAAACAAAAC";
  const parsedLongL3 = parseKnottinGrammar(longL3);
  assert.equal(parsedLongL3.valid, false);
  assert.ok(parsedLongL3.syntaxErrors.some((e) => e.includes("L3_length")));
  assert.equal(parsedLongL3.loops["L3"], "AAAAA");

  // L5 of 3 aa violates the 4-10 envelope.
  const shortL5 = "CAAACAAACACAAACAAAC";
  const parsedShortL5 = parseKnottinGrammar(shortL5);
  assert.equal(parsedShortL5.valid, false);
  assert.ok(parsedShortL5.syntaxErrors.some((e) => e.includes("L5_length")));

  // L2 of 3 aa is inside the 3-6 envelope.
  const parsedMinL2 = parseKnottinGrammar("CAAACAAACACAAACAACAAAAC");
  assert.ok(
    parsedMinL2.syntaxErrors.every((e) => !e.includes("L2_length")),
    parsedMinL2.syntaxErrors.join("; ")
  );

  const valid = sampleFallbackCandidates(TARGET, 4, 1)[0] ?? "";
  const parsed = parseKnottinGrammar(valid);
  assert.equal(parsed.valid, true);
  const indices = cysteineIndices(valid);
  assert.equal(indices.length, 6);
  assert.deepEqual([...indices].sort((x, y) => x - y), indices);
  for (const [loop, [min, max]] of [
    ["L1", [3, 7]],
    ["L2", [3, 6]],
    ["L3", [1, 4]],
    ["L4", [2, 6]],
    ["L5", [4, 10]],
  ] as const) {
    const len = (parsed.loops[loop] ?? "").length;
    assert.ok(len >= min && len <= max, `${loop}=${len}`);
  }
});

test("auditor computes developability ledger metrics", () => {
  assert.equal(computeBomanIndex("A"), 2.1);
  assert.ok(Math.abs(computeAliphaticIndex("AAVVII") - 260) < 0.5);
  assert.ok(Math.abs(computeIsoelectricPoint("AAAA") - 5.55) < 0.05);
  assert.ok(Math.abs(computeNetChargeAtPh("AAAA", 7.4) + 0.2) < 0.1);
  assert.equal(computeCleavageSusceptibilityIndex("AAAAAA"), 0);
  assert.ok(computeCleavageSusceptibilityIndex("ACDDDDKEF") > 0);

  // L3 has 2 basic / 0 acidic, L5 has 0 basic / 2 acidic -> ratio 1.
  const ratioSeq = "CAAACAAAACKKAACSDDAAAC";
  assert.equal(computeMucosalAdhesionRatio(ratioSeq), 1);

  const audit = auditPeptideCandidate(sampleFallbackCandidates(TARGET, 4, 1)[0] ?? "", 4);
  for (const key of [
    "boman_index",
    "aliphatic_index",
    "isoelectric_point",
    "mucosal_adhesion_ratio",
    "cleavage_susceptibility_index",
    "net_charge_ph74",
  ] as const) {
    assert.ok(Number.isFinite(audit[key]), key);
  }
});

test("auditor rejects Kex2, sequon, chymotrypsin, N-term, and run liabilities", () => {
  const kex2 = auditPeptideCandidate(`CKRA${"A".repeat(24)}C`, 4);
  assert.ok(
    kex2.violations.some((v) => v.startsWith("kex2_site")),
    kex2.violations.join("; ")
  );
  assert.ok(auditFailureModes(kex2).includes("KEX2_SITE_DETECTED"));

  const pr = auditPeptideCandidate(`CPRA${"A".repeat(24)}C`, 4);
  assert.ok(auditFailureModes(pr).includes("KEX2_SITE_DETECTED"));

  const sequon = auditPeptideCandidate("CAAACNATAAAAAAAAACAAAAACAAAAC", 4);
  assert.ok(
    sequon.violations.some((v) => v.startsWith("liability_glycosylation")),
    sequon.violations.join("; ")
  );
  assert.ok(auditFailureModes(sequon).includes("N_GLYCOSYLATION_SEQUON"));

  const chymo = auditPeptideCandidate(`CFDKA${"A".repeat(23)}C`, 4);
  assert.ok(
    chymo.violations.some((v) => v.startsWith("chymotrypsin_exposed")),
    chymo.violations.join("; ")
  );
  assert.ok(auditFailureModes(chymo).includes("CHYMOTRYPSIN_EXPOSED_SITE"));

  const nterm = auditPeptideCandidate(`P${"A".repeat(27)}C`, 4);
  assert.ok(
    nterm.violations.some((v) => v.startsWith("n_terminus")),
    nterm.violations.join("; ")
  );
  assert.ok(auditFailureModes(nterm).includes("N_TERMINUS_BLOCKED"));

  const run = auditPeptideCandidate(`CAAAAVVVVA${"A".repeat(18)}C`, 4);
  assert.ok(
    run.violations.some((v) => v.startsWith("liability_aggregation")),
    run.violations.join("; ")
  );
  assert.ok(run.hydrophobic_run_max >= 4);
  assert.ok(auditFailureModes(run).includes("HYDROPHOBIC_RUN_TOO_LONG"));

  const uncharged = auditPeptideCandidate(`C${"A".repeat(27)}C`, 4);
  assert.ok(auditFailureModes(uncharged).includes("CHARGE_OUT_OF_BOUNDS"));

  const overcharged = auditPeptideCandidate(`CKKKKK${"A".repeat(21)}C`, 4);
  assert.ok(auditFailureModes(overcharged).includes("CHARGE_OUT_OF_BOUNDS"));

  const greasy = auditPeptideCandidate(`C${"I".repeat(27)}C`, 1);
  assert.ok(
    greasy.violations.some((v) => v.startsWith("gravy")),
    greasy.violations.join("; ")
  );
});

test("verification report confirms every bioprocess gate", () => {
  const valid = sampleFallbackCandidates(TARGET, 4, 1)[0] ?? "";
  const report = buildVerificationReport(
    parseKnottinGrammar(valid),
    auditPeptideCandidate(valid, 4)
  );
  for (const key of [
    "kex2_clean",
    "glycosylation_clean",
    "charge_window_ok",
    "protease_clean",
    "n_terminus_ok",
    "hydrophobic_runs_ok",
    "gravy_ok",
    "ick_topology_ok",
    "passed",
  ] as const) {
    assert.equal(report[key], true, key);
  }
  assert.deepEqual(report.failure_modes, []);

  const bad = auditPeptideCandidate(`CKRA${"A".repeat(24)}C`, 4);
  const badReport = buildVerificationReport(parseKnottinGrammar(`CKRA${"A".repeat(24)}C`), bad);
  assert.equal(badReport.kex2_clean, false);
  assert.equal(badReport.protease_clean, false);
  assert.equal(badReport.passed, false);
  assert.ok(badReport.failure_modes.includes("KEX2_SITE_DETECTED"));
});

test("biosecurity filter blocks toxins, enzymes, and long folds", () => {
  assert.equal(validateRequestSafety("ricin A-chain binder").safe, false);
  assert.equal(validateRequestSafety("abrin neutralizer").safe, false);
  assert.equal(
    validateRequestSafety("botulinum translocation motif blocker").safe,
    false
  );
  const enzyme = validateRequestSafety("lactase");
  assert.equal(enzyme.safe, false);
  assert.equal(enzyme.category, "catalytic-enzyme");
  assert.ok((enzyme.reason ?? "").includes("UniProt"));
  assert.equal(validateRequestSafety("gut protease", 60).safe, false);
  assert.equal(validateRequestSafety(TARGET).safe, true);
  assert.equal(extractRequestedLength("a 52 aa enzyme"), 52);
});

test("codon optimizer silences cloning sites and keeps CAI high", () => {
  for (const site of ["GAATTC", "GCGGCCGC", "CTCGAG", "GGTCTC", "CGTCTC"]) {
    assert.ok(RESTRICTION_SITES.includes(site), site);
  }
  assert.ok(!RESTRICTION_SITES.includes("GGATCC"));
  assert.equal(findRestrictionSite("AACGTCTCAA"), "CGTCTC");

  // Preferred codons for LNS embed EcoRI (TTGAATTCT): precondition.
  const preferredLNS = ["L", "N", "S"]
    .map((aa) => (CODON_TABLE[aa] ?? [])[0] ?? "")
    .join("");
  assert.ok(preferredLNS.includes("GAATTC"));

  const protein = "ACDELNSFGHIK";
  const { dna } = optimizeForSboulardii(protein);
  assert.equal(dna.length, 3 * protein.length);
  for (const site of RESTRICTION_SITES) {
    assert.ok(!dna.includes(site), site);
  }
  assert.ok(computeCAI(dna, protein) > 0.85);
  assert.equal(translateCds(dna), protein);
});

test("payload CDS optimizer tunes GC and avoids rare codons", () => {
  for (const charge of [1, 2, 3, 4]) {
    const pool = sampleFallbackCandidates(TARGET, charge, 2);
    for (const seq of pool) {
      const cds = optimizePayloadCds(seq);
      assert.equal(cds.dna.length, 3 * seq.length);
      assert.equal(cds.gcOk, true);
      assert.ok(cds.gcPercent >= GC_CDS_MIN * 100);
      assert.ok(cds.gcPercent <= GC_CDS_MAX * 100);
      assert.equal(findRestrictionSite(cds.dna), null);
      const codons = cds.dna.match(/.{3}/g) ?? [];
      for (const codon of codons) {
        assert.ok(!RARE_CODONS.has(codon), codon);
      }
      assert.ok(cds.cai > 0.75, String(cds.cai));
      assert.equal(translateCds(cds.dna), seq);
    }
  }
});

test("lab handoff builds the translational yeast cassette", () => {
  assert.equal(ALPHA_FACTOR_LEADER_85.length, 85);
  assert.ok(ALPHA_FACTOR_LEADER_85.endsWith("SLDKR"));
  assert.ok(ALPHA_FACTOR_LEADER_85.includes("YLDLEG"));
  assert.equal(
    GIBSON_ARM_5,
    "ACACAAACAAAAGATACACAAACAACGATATATACAAAAC"
  );
  assert.equal(
    GIBSON_ARM_3,
    "TCCTTGACGTTAAAGTATAGAGGTATATTAACAATTTTTT"
  );

  const mature = sampleFallbackCandidates(TARGET, 4, 1)[0] ?? "";
  const manifest = buildLabHandoff(mature);
  assert.equal(manifest.dna_gblock.length, 80 + 3 * (85 + mature.length));
  assert.ok(manifest.dna_gblock.startsWith(GIBSON_ARM_5));
  assert.ok(manifest.dna_gblock.endsWith(GIBSON_ARM_3));
  assert.ok(manifest.cai > 0.85);
  assert.equal(manifest.restriction_scrub.status, "clean");
  assert.ok(manifest.synthesis_order.dna_length > 400);
  assert.ok(manifest.synthesis_order.gc_percent > 0);
  assert.ok(manifest.yeast_chassis.includes("boulardii"));
});

test("cloning payload assembles the ready-to-clone yeast cassette", () => {
  assert.equal(LEADER_CDS_5FLANK.length, 255);
  assert.ok(LEADER_CDS_5FLANK.startsWith("ATG"));
  assert.ok(LEADER_CDS_5FLANK.endsWith(LEADER_JUNCTION_DNA));
  assert.equal(LEADER_JUNCTION_DNA, "AACCTGGAAAAGAGA");
  assert.equal(translateCds(LEADER_CDS_5FLANK), CASSETTE_LEADER_PROTEIN);
  assert.equal(CASSETTE_LEADER_PROTEIN.length, 85);
  assert.equal(CYC1_TERMINATOR_250.length, 250);
  assert.equal(DUAL_STOP_CODON, "TAATGA");
  assert.equal(CASSETTE_FORMAT, "MFalpha1-Kex2-Knottin-CYC1term");
  assert.equal(findRestrictionSite(LEADER_CDS_5FLANK), null);
  assert.equal(findRestrictionSite(CYC1_TERMINATOR_250), null);

  const mature = sampleFallbackCandidates(TARGET, 4, 1)[0] ?? "";
  const payload = buildCloningPayload(mature);
  assert.equal(payload.dna_sequence, payload.payload_cds);
  assert.equal(payload.cassette_format, CASSETTE_FORMAT);
  assert.equal(payload.stop_codon, DUAL_STOP_CODON);
  assert.equal(translateCds(payload.payload_cds), mature);
  assert.equal(
    payload.full_cassette_dna,
    `${LEADER_CDS_5FLANK}${payload.payload_cds}${DUAL_STOP_CODON}${CYC1_TERMINATOR_250}`
  );
  assert.equal(payload.restriction_scrub.status, "clean");
  assert.equal(payload.gc_ok, true);
  assert.ok(payload.payload_cai > 0.75, String(payload.payload_cai));
  assert.deepEqual(payload.rare_codons_avoided, ["CGG", "CGA", "CUG"]);
});

test("completion extraction handles scratchpad prose and labels", () => {
  const pool = sampleFallbackCandidates(TARGET, 4, 3);
  const completion = [
    "<scratchpad>Loop L1 uses proline turn induction for closure.</scratchpad>",
    `CANDIDATE 1: ${pool[0]}`,
    `CANDIDATE 2: ${pool[1]}`,
    ">fasta_one",
    pool[2],
  ].join("\n");
  assert.deepEqual(extractCandidateSequences(completion), pool);
  assert.deepEqual(extractCandidateSequences("no sequences here"), []);

  const spaced = `${pool[0]?.slice(0, 10)} ${pool[0]?.slice(10, 20)} ${pool[0]?.slice(20)}`;
  assert.deepEqual(
    extractCandidateSequences(`CANDIDATE 3: ${spaced}`),
    [pool[0]]
  );
});

test("generateVerifiedPeptide synthesizes with provenance and no key", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  const result = await generateVerifiedPeptide(TARGET, 4, 3);
  assert.equal(result.audit.passed, true);
  assert.ok(result.refinementHistory.length >= 1);
  const accepted = result.refinementHistory.filter(
    (entry) => entry.disposition === "accepted"
  );
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.candidate, result.candidate);
  assert.equal(accepted[0]?.source, "deterministic-synthesis");
  assert.deepEqual(accepted[0]?.failure_modes, []);
  assert.ok(
    result.refinementHistory.some(
      (entry) => entry.disposition === "superseded"
    )
  );
  await assert.rejects(
    generateVerifiedPeptide(TARGET, 99, 1),
    NeurosymbolicVerificationError
  );
});

test("completion schema tolerates null message content", () => {
  const parsed = MetaSparkResponseSchema.safeParse({
    id: "chatcmpl-test",
    choices: [
      { index: 0, message: { role: "assistant", content: null } },
      { index: 1, message: null },
    ],
  });
  assert.equal(parsed.success, true);
});

test("request schema carries reasoning effort control", () => {
  const parsed = MetaSparkRequestSchema.safeParse({
    model: "muse-spark-1.3-contributor",
    messages: [{ role: "user", content: "hi" }],
    reasoning_effort: "minimal",
    max_tokens: 4096,
  });
  assert.equal(parsed.success, true);
});

test("dead upstream degrades to synthesis instead of empty 502", async () => {
  process.env.META_API_KEY = "dummy-key-for-dead-endpoint-test";
  process.env.META_SPARK_API_URL = "http://127.0.0.1:1/unreachable";
  try {
    const result = await generateVerifiedPeptide(TARGET, 4, 1);
    assert.equal(result.audit.passed, true);
    assert.ok(result.refinementHistory.length >= 1);
    for (const turn of result.refinementHistory) {
      assert.equal(turn.source, "deterministic-synthesis");
    }
  } finally {
    delete process.env.META_API_KEY;
    delete process.env.META_SPARK_API_URL;
  }
});

test("route exposes the expanded candidate metadata", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  process.env.API_BEARER_TOKEN = "test-token";
  const req = (body: unknown, token?: string | null): NextRequest =>
    ({
      headers: new Headers(
        token === null || token === undefined
          ? {}
          : { authorization: `Bearer ${token}` }
      ),
      json: async () => body,
    }) as unknown as NextRequest;

  assert.equal((await POST(req({ target: "x" }, "wrong"))).status, 401);
  assert.equal((await POST(req({ nope: 1 }, "test-token"))).status, 400);
  assert.equal(
    (await POST(req({ target: TARGET, charge_target: 5 }, "test-token"))).status,
    400
  );

  const res422 = await POST(
    req({ target: "lactase for lactose intolerance" }, "test-token")
  );
  assert.equal(res422.status, 422);

  const res403 = await POST(
    req({ target: "ricin detection peptide" }, "test-token")
  );
  assert.equal(res403.status, 403);

  // Explicit knottin: this test pins the candidate metadata shape,
  // while Auto would resolve inflammation to the cyclotide scaffold.
  const res = await POST(
    req({ target: TARGET, charge_target: 4, modality: "knottin-6c" }, "test-token")
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body["success"], true);
  assert.equal(body["target"], TARGET);
  assert.equal(body["modality"], "engineered_knottin_microprotein");

  const provenance = body["neurosymbolic_provenance"] as Record<string, unknown>;
  assert.equal(provenance["proposer_model"], "Meta-Spark-1.3-Contributor");
  assert.equal(provenance["linguistic_paradigm"], "context_sensitive_loop_grammar");
  assert.ok(typeof provenance["compiler_refinement_cycles"] === "number");
  const trace = provenance["refinement_trace"] as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(trace));
  for (const turn of trace) {
    assert.ok(Array.isArray(turn["failure_modes"]), "failure_modes logged");
  }

  const candidate = body["candidate"] as Record<string, unknown>;
  assert.equal(CandidatePayloadSchema.safeParse(candidate).success, true);
  assert.ok((candidate["id"] as string).startsWith("SB-KNOT-"));
  assert.equal(candidate["sequence"], candidate["mature_sequence"]);
  assert.equal(candidate["length"], (candidate["sequence"] as string).length);
  assert.equal((candidate["cysteine_indices"] as number[]).length, 6);
  assert.equal((candidate["loop_segments"] as string[]).length, 5);
  const profile = candidate["biophysical_profile"] as Record<string, unknown>;
  for (const key of ["net_charge_ph74", "isoelectric_point", "gravy_score", "boman_index"]) {
    assert.ok(typeof profile[key] === "number", key);
  }
  const cloning = candidate["cloning_payload"] as Record<string, unknown>;
  assert.ok(typeof cloning["dna_sequence"] === "string");
  assert.equal(cloning["cassette_format"], "MFalpha1-Kex2-Knottin-CYC1term");
  assert.ok((cloning["full_cassette_dna"] as string).includes("AACCTGGAAAAGAGA"));
  const verification = candidate["verification_report"] as Record<string, unknown>;
  assert.equal(verification["passed"], true);
  assert.deepEqual(verification["failure_modes"], []);
  assert.equal(candidate["topology"], "C1-C4, C2-C5, C3-C6 ICK");
  assert.ok(typeof candidate["grammar_breakdown"] === "object");

  const audit = body["symbolic_audit"] as Record<string, unknown>;
  assert.equal(audit["passed"], true);
  assert.equal(audit["charge"], 4);
  for (const key of ["gravy", "boman_index", "aliphatic_index", "net_charge_ph74"]) {
    assert.ok(typeof audit[key] === "number", key);
  }
  assert.ok(
    (audit["liabilities_cleared"] as string[]).includes("Kex2-site")
  );
  assert.ok(
    (audit["liabilities_cleared"] as string[]).includes("N-glycosylation")
  );

  const specificity = body["specificity"] as Record<string, unknown>;
  assert.equal(specificity["checked"], false);

  const handoff = body["lab_handoff"] as Record<string, unknown>;
  for (const key of [
    "yeast_chassis",
    "secretion_leader",
    "cDNA_sequence",
    "gblock_manifest",
    "gibson_5p_arm",
    "gibson_3p_arm",
  ]) {
    assert.ok(typeof handoff[key] === "string", key);
  }

  assert.equal((await OPTIONS()).status, 204);
});

test("demo presets are biosecurity-clean", () => {
  assert.ok(DEMO_PRESETS.length >= 3);
  for (const preset of DEMO_PRESETS) {
    assert.equal(validateRequestSafety(preset.target).safe, true, preset.id);
  }
});

test("demo route serves presets with a per-IP cooldown", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  const demoReq = (body: unknown, ip: string): NextRequest =>
    ({
      headers: new Headers({ "x-forwarded-for": ip }),
      json: async () => body,
    }) as unknown as NextRequest;

  const preset = DEMO_PRESETS[0];
  assert.ok(preset !== undefined);
  const ok = await demoPOST(
    demoReq({ target: preset.target }, "test-demo-ip-1")
  );
  assert.equal(ok.status, 200);
  const okBody = (await ok.json()) as Record<string, unknown>;
  assert.equal(okBody["success"], true);
  // C. difficile auto-resolves to the hairpin scaffold (12-20 aa).
  assert.equal(okBody["modality_id"], "hairpin-2c");
  const candidate = okBody["candidate"] as Record<string, unknown>;
  assert.ok((candidate["mature_sequence"] as string).length >= 12);
  assert.equal(
    (candidate["verification_report"] as Record<string, unknown>)["passed"],
    true
  );

  const cooled = await demoPOST(
    demoReq({ target: preset.target }, "test-demo-ip-1")
  );
  assert.equal(cooled.status, 429);
  const cooledBody = (await cooled.json()) as Record<string, unknown>;
  const details = cooledBody["details"] as Record<string, unknown>;
  assert.ok((details["retry_after_seconds"] as number) > 0);

  const rejected = await demoPOST(
    demoReq({ target: "anything not on the allowlist" }, "test-demo-ip-2")
  );
  assert.equal(rejected.status, 400);
});

test("pipeline telemetry reports synthesis and verification", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  const events: PipelineEvent[] = [];
  const result = await generateVerifiedPeptide(TARGET, 4, 3, (event) =>
    events.push(event)
  );
  assert.equal(result.audit.passed, true);
  assert.ok(events.some((event) => event.stage === "synthesize"));
  const verifications = events.filter(
    (event) => event.stage === "verify"
  );
  assert.ok(verifications.length >= 1);
  assert.ok(
    verifications.every(
      (event) =>
        typeof event.candidate === "string" &&
        typeof event.issues === "number"
    )
  );
});

test("demo stream emits stages then the full result", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  const streamReq = (body: unknown, ip: string): NextRequest =>
    ({
      headers: new Headers({ "x-forwarded-for": ip }),
      json: async () => body,
    }) as unknown as NextRequest;

  const preset = DEMO_PRESETS[0];
  assert.ok(preset !== undefined);
  const ok = await demoStreamPOST(
    streamReq({ target: preset.target }, "test-stream-ip-1")
  );
  assert.equal(ok.status, 200);
  assert.ok(
    (ok.headers.get("content-type") ?? "").includes("text/event-stream")
  );
  const body = await ok.text();
  assert.ok(body.includes("event: stage"));
  assert.ok(body.includes("event: result"));
  assert.ok(body.includes('"success":true'));

  const cooled = await demoStreamPOST(
    streamReq({ target: preset.target }, "test-stream-ip-1")
  );
  assert.equal(cooled.status, 429);

  const rejected = await demoStreamPOST(
    streamReq({ target: "anything not on the allowlist" }, "test-stream-ip-2")
  );
  assert.equal(rejected.status, 400);
});

test("demo stream accepts designer options, rejects bad ones", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  const streamReq = (body: unknown, ip: string): NextRequest =>
    ({
      headers: new Headers({ "x-forwarded-for": ip }),
      json: async () => body,
    }) as unknown as NextRequest;

  const preset = DEMO_PRESETS[0];
  assert.ok(preset !== undefined);
  const ok = await demoStreamPOST(
    streamReq(
      {
        target: preset.target,
        charge_target: 2,
        modality: "linear",
        research: false,
      },
      "test-stream-ip-opts"
    )
  );
  assert.equal(ok.status, 200);
  const body = await ok.text();
  assert.ok(body.includes('"success":true'));
  assert.ok(body.includes("engineered_linear_peptide"));

  const badCharge = await demoStreamPOST(
    streamReq(
      { target: preset.target, charge_target: 9 },
      "test-stream-ip-bad1"
    )
  );
  assert.equal(badCharge.status, 400);

  const badModality = await demoStreamPOST(
    streamReq(
      { target: preset.target, modality: "antibody" },
      "test-stream-ip-bad2"
    )
  );
  assert.equal(badModality.status, 400);
});

test("prompts carry scaffolds, secretion framing, and bioprocess gates", () => {
  for (const prompt of [
    buildKnottinPrompt(TARGET, 4),
    buildSemanticProposePrompt(TARGET, 4),
  ]) {
    for (const snippet of [
      "EETI-II",
      "MCoTI-II",
      "Saccharomyces boulardii",
      "MFalpha1",
      "KR, RR, PR",
      "N[^P][ST]",
      "VILMFW",
      "+1 to +4",
    ]) {
      assert.ok(prompt.includes(snippet), snippet);
    }
  }
  assert.ok(
    buildKnottinPrompt(TARGET, 4).includes(
      "C-X(3,7)-C-X(3,6)-C-X(1,4)-C-X(2,6)-C-X(4,10)-C"
    )
  );
  assert.ok(
    buildSemanticProposePrompt(TARGET, 4).includes(
      "L1 3-7, L2 3-6, L3 1-4, L4 2-6, L5 4-10"
    )
  );
  const repair = buildRepairPrompt("CAAA", "KEX2_SITE_DETECTED", 4, "TPQR");
  assert.ok(repair.includes("CAAA"));
  assert.ok(repair.includes("KEX2_SITE_DETECTED"));
  assert.ok(repair.includes("TPQR"));
});

test("retry temperatures are penalized per cycle", () => {
  assert.equal(repairTemperatureForCycle(0), 0.7);
  assert.ok(Math.abs(repairTemperatureForCycle(1) - 0.55) < 1e-9);
  assert.ok(Math.abs(repairTemperatureForCycle(2) - 0.4) < 1e-9);
  assert.equal(repairTemperatureForCycle(10), 0.1);
});

test("specificity matching tolerates abbreviations", () => {
  assert.equal(
    matchIntendedTarget(
      "C. difficile TcdA receptor",
      "Clostridioides difficile colonization in the gut"
    ),
    true
  );
  assert.equal(
    matchIntendedTarget(
      "ETEC colonization factor",
      "Enterotoxigenic E. coli gut colonization blockade"
    ),
    true
  );
  assert.equal(
    matchIntendedTarget("hERG potassium channel", "Irritable bowel syndrome"),
    false
  );
});

test("specificity verdicts pass, fail, and skip honestly", () => {
  const pass = parseSpecificityResponse(
    [
      "TARGET: C. difficile TcdA receptor — cationic L3 matches the acidic pocket",
      "TARGET: gut mucin — weak charge interaction",
      "OFFTARGET: none",
    ].join("\n"),
    "Clostridioides difficile colonization in the gut"
  );
  assert.equal(pass.checked, true);
  assert.equal(pass.pass, true);

  const fail = parseSpecificityResponse(
    [
      "TARGET: hERG potassium channel — hydrophobic patch concern",
      "OFFTARGET: hERG potassium channel — possible blockade",
    ].join("\n"),
    "Clostridioides difficile colonization in the gut"
  );
  assert.equal(fail.checked, true);
  assert.equal(fail.pass, false);
  assert.ok(fail.high_risk_flags.length >= 1);

  const skipped = parseSpecificityResponse(
    "some unparseable prose",
    "Clostridioides difficile colonization in the gut"
  );
  assert.equal(skipped.checked, false);
  assert.equal(skipped.pass, true);
});

test("specificity prompt avoids upstream content-filter triggers", () => {
  const prompt = buildSpecificityPrompt("C".repeat(30), 4);
  assert.ok(
    prompt.includes("2. List any concerning off-target activity."),
    prompt
  );
  // Verified live: these example terms make the upstream API reject the
  // prompt with 400 content_policy_violation, so they must stay out.
  for (const trigger of [
    "hERG",
    "human ion channels",
    "ion channels",
    "hemolysis",
    "cytotoxicity",
    "clotting",
    "complement",
  ]) {
    assert.ok(!prompt.includes(trigger), trigger);
  }
  // Small budgets return content:null (reasoning consumes the tokens).
  assert.ok(SPECIFICITY_MAX_TOKENS >= 2048);
});

test("specificity review skips without an API key", async () => {
  delete process.env.META_API_KEY;
  const report = await checkSpecificity("C".repeat(30), TARGET, 4);
  assert.equal(report.checked, false);
  assert.equal(report.pass, true);
});

