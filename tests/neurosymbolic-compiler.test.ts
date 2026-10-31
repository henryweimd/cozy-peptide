import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextRequest } from "next/server";

import { parseKnottinGrammar } from "../lib/protein-grammar";
import {
  auditPeptideCandidate,
  computeAliphaticIndex,
  computeBomanIndex,
  computeCleavageSusceptibilityIndex,
  computeIsoelectricPoint,
  computeMucosalAdhesionRatio,
} from "../lib/symbolic-auditor";
import {
  validateRequestSafety,
  extractRequestedLength,
} from "../lib/biosecurity";
import {
  CODON_TABLE,
  RESTRICTION_SITES,
  computeCAI,
  findRestrictionSite,
  optimizeForSboulardii,
} from "../lib/codon-optimizer";
import {
  ALPHA_FACTOR_LEADER_85,
  GIBSON_ARM_3,
  GIBSON_ARM_5,
  buildLabHandoff,
} from "../lib/lab-handoff";
import {
  NeurosymbolicVerificationError,
  extractCandidateSequences,
  generateVerifiedPeptide,
  sampleFallbackCandidates,
} from "../lib/meta-spark";
import {
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
import type { PipelineEvent } from "../lib/meta-spark";

const TARGET = "TNF-alpha gut inflammation";

test("route segment config exports", () => {
  assert.equal(runtime, "nodejs");
  assert.equal(dynamic, "force-dynamic");
  assert.equal(maxDuration, 60);
});

test("fallback sampler yields grammar-valid, audit-passing candidates", () => {
  const pool = sampleFallbackCandidates(TARGET, 4, 5);
  assert.equal(pool.length, 5);
  for (const seq of pool) {
    const grammar = parseKnottinGrammar(seq);
    assert.equal(grammar.valid, true);
    assert.deepEqual(grammar.syntaxErrors, []);
    const audit = auditPeptideCandidate(seq, 4);
    assert.equal(audit.passed, true);
  }
});

test("grammar parser rejects topological violations", () => {
  const notSixCys = `CAAACA${"A".repeat(24)}`;
  assert.equal(parseKnottinGrammar(notSixCys).valid, false);

  // L1 without turn-inducers P/G.
  const noTurn = "CAAACAAAAACAAAACSCAAAAC";
  const parsedNoTurn = parseKnottinGrammar(noTurn);
  assert.equal(parsedNoTurn.valid, false);
  assert.ok(parsedNoTurn.syntaxErrors.some((e) => e.includes("L1")));
  assert.equal(parsedNoTurn.loops["L1"], "AAA");

  // L2 with 100% bulky aromatics (limit 40%).
  const aromatic = "CPGACWWFFCAAAACSCAAAAC";
  const parsedAromatic = parseKnottinGrammar(aromatic);
  assert.equal(parsedAromatic.valid, false);
  assert.ok(parsedAromatic.syntaxErrors.some((e) => e.includes("L2")));

  // L4 containing a helix former (A).
  const helix = "CPGACAAAACAAAACACAAAAC";
  const parsedHelix = parseKnottinGrammar(helix);
  assert.equal(parsedHelix.valid, false);
  assert.ok(parsedHelix.syntaxErrors.some((e) => e.includes("L4")));
});

test("auditor computes developability ledger metrics", () => {
  assert.equal(computeBomanIndex("A"), 2.1);
  assert.ok(Math.abs(computeAliphaticIndex("AAVVII") - 260) < 0.5);
  assert.ok(Math.abs(computeIsoelectricPoint("AAAA") - 5.55) < 0.05);
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
  ] as const) {
    assert.ok(Number.isFinite(audit[key]), key);
  }
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

test("codon optimizer silences restriction sites and keeps CAI high", () => {
  for (const site of ["GAATTC", "GGATCC", "GCGGCCGC", "CTCGAG", "GGTCTC"]) {
    assert.ok(RESTRICTION_SITES.includes(site), site);
  }
  assert.equal(findRestrictionSite("AACTCGAGAA"), "CTCGAG");

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
});

test("lab handoff builds the translational yeast cassette", () => {
  assert.equal(ALPHA_FACTOR_LEADER_85.length, 85);
  assert.ok(ALPHA_FACTOR_LEADER_85.endsWith("SLDKR"));
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
  const last = result.refinementHistory[result.refinementHistory.length - 1];
  assert.equal(last?.disposition, "accepted");
  assert.equal(last?.source, "deterministic-synthesis");
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

test("route exposes the neurosymbolic narrative", async () => {
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

  const res422 = await POST(
    req({ target: "lactase for lactose intolerance" }, "test-token")
  );
  assert.equal(res422.status, 422);

  const res403 = await POST(
    req({ target: "ricin detection peptide" }, "test-token")
  );
  assert.equal(res403.status, 403);

  const res = await POST(
    req({ target: TARGET, charge_target: 4 }, "test-token")
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
  assert.ok(Array.isArray(provenance["refinement_trace"]));

  const candidate = body["candidate"] as Record<string, unknown>;
  assert.ok(typeof candidate["mature_sequence"] === "string");
  assert.equal(candidate["topology"], "C1-C4, C2-C5, C3-C6 ICK");
  assert.ok(typeof candidate["grammar_breakdown"] === "object");

  const audit = body["symbolic_audit"] as Record<string, unknown>;
  assert.equal(audit["passed"], true);
  assert.equal(audit["charge"], 4);
  for (const key of ["gravy", "boman_index", "aliphatic_index"]) {
    assert.ok(typeof audit[key] === "number", key);
  }
  assert.ok(
    (audit["liabilities_cleared"] as string[]).includes("Met-oxidation")
  );

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
  const candidate = okBody["candidate"] as Record<string, unknown>;
  assert.ok((candidate["mature_sequence"] as string).length >= 28);

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
