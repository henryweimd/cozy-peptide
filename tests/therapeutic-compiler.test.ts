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
import {
  buildSpecificityPrompt,
  parseSpecificityResponse,
} from "../lib/specificity";
import {
  assessGutPlausibility,
  assessGutSite,
  flagsDistantSite,
} from "../lib/gut-targets";
import { validateRequestSafety } from "../lib/biosecurity";
import { DEMO_PRESETS } from "../lib/demo-config";
import {
  AGENT_TOOLS,
  agentToolNames,
  runAgentTools,
} from "../lib/agent-tools";
import { THERAPEUTIC_WEIGHTS } from "../lib/therapeutic-index";
import {
  assessSynthesisDifficulty,
  buildLabHandoff,
  buildOrderCsv,
} from "../lib/lab-handoff";
import { POST as auditPOST } from "../app/api/audit-peptide/route";
import { GET as modalitiesGET } from "../app/api/modalities/route";
import {
  META_SPARK_MODEL,
  META_WONDER_MODEL,
  displayNameForModel,
  shortLabelForModel,
} from "../lib/spark-config";
import {
  AgentToolResultSchema,
  CandidatePayloadSchema,
} from "../types/peptide";
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

test("gut-site filter refuses distant organs, keeps gut-anchored targets", () => {
  for (const target of [
    "glioblastoma brain tumor",
    "non-small cell lung cancer",
    "Alzheimer's disease",
    "metastatic melanoma",
    "rheumatoid arthritis",
  ]) {
    const verdict = validateRequestSafety(target);
    assert.equal(verdict.safe, false, target);
    assert.equal(verdict.category, "off-site", target);
  }
  // Gut-anchored or gut-axis requests pass, including exemptions.
  for (const target of [
    "colorectal cancer",
    "diabetic kidney disease",
    "Clostridioides difficile colonization in the gut",
    "GLP-1 receptor agonism for obesity",
  ]) {
    assert.equal(validateRequestSafety(target).safe, true, target);
  }
  for (const preset of DEMO_PRESETS) {
    assert.equal(assessGutSite(preset.target).plausible, true, preset.id);
    assert.equal(validateRequestSafety(preset.target).safe, true, preset.id);
  }
});

test("route refuses off-site targets with 422", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  process.env.API_BEARER_TOKEN = "test-token";
  const res = await POST({
    headers: new Headers({ authorization: "Bearer test-token" }),
    json: async () => ({ target: "glioblastoma brain tumor" }),
  } as unknown as NextRequest);
  assert.equal(res.status, 422);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body["success"], false);
});

test("specificity gate fails distant-site predictions, scores gut aim", () => {
  const distant = parseSpecificityResponse(
    [
      "TARGET: brain-derived neurotrophic factor receptor — loop charge match",
      "OFFTARGET: none",
    ].join("\n"),
    "Irritable bowel syndrome abdominal pain"
  );
  assert.equal(distant.pass, false);
  assert.ok(distant.high_risk_flags.length >= 1);

  const gut = parseSpecificityResponse(
    [
      "TARGET: C. difficile TcdA receptor — cationic loop matches the acidic pocket",
      "OFFTARGET: none",
    ].join("\n"),
    "Clostridioides difficile colonization in the gut"
  );
  assert.equal(gut.pass, true);
  assert.equal(gut.gut_plausible, true);

  // Intent match with unclear molecular aim warns but still passes.
  const vague = parseSpecificityResponse(
    ["TARGET: healing factor XR-7 — general association", "OFFTARGET: none"].join(
      "\n"
    ),
    "Irritable bowel syndrome healing"
  );
  assert.equal(vague.pass, true);
  assert.equal(vague.gut_plausible, false);
  assert.ok(vague.warnings.some((entry) => entry.includes("aim is unclear")));

  assert.deepEqual(flagsDistantSite(["pulmonary surfactant protein"]), [
    "pulmonary surfactant protein",
  ]);
  assert.deepEqual(flagsDistantSite(["C. difficile TcdA receptor"]), []);
  assert.equal(assessGutPlausibility(["TNF-alpha cytokine"]), true);
  assert.equal(assessGutPlausibility(["pulmonary surfactant protein"]), false);
  assert.equal(assessGutPlausibility([]), false);
});

test("steering briefs aim at plausible gut molecular targets", () => {
  const { brief } = buildSteeringBrief(
    "Clostridioides difficile colonization in the gut"
  );
  assert.ok(brief.includes("adhesins"));
  const { brief: barrier } = buildSteeringBrief(
    "Intestinal barrier dysfunction and mucosal healing"
  );
  assert.ok(barrier.includes("tight-junction"));
  const { brief: metabolic } = buildSteeringBrief("GLP-1 for obesity");
  assert.ok(metabolic.includes("GLP-1"));
});

test("agent tool stubs report honestly and never throw", async () => {
  assert.deepEqual(agentToolNames(), [
    "binding-affinity",
    "structure-fold",
    "off-target-panel",
  ]);
  assert.equal(AGENT_TOOLS.length, 3);
  const results = await runAgentTools({
    candidate: "ACDEFGHIKLMN",
    target: TARGET,
    modality: "linear",
    charge_target: 2,
  });
  assert.equal(results.length, 3);
  for (const result of results) {
    assert.equal(AgentToolResultSchema.safeParse(result).success, true);
    assert.equal(result.status, "not-configured");
    assert.ok(typeof result.latency_ms === "number");
  }
});

test("route payload carries agent tool results", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  process.env.API_BEARER_TOKEN = "test-token";
  const res = await POST({
    headers: new Headers({ authorization: "Bearer test-token" }),
    json: async () => ({ target: TARGET, charge_target: 2, modality: "linear" }),
  } as unknown as NextRequest);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  const tools = body["agent_tools"] as Array<Record<string, unknown>>;
  assert.equal(tools.length, 3);
  assert.deepEqual(
    tools.map((entry) => entry["tool"]),
    ["binding-affinity", "structure-fold", "off-target-panel"]
  );
});

test("therapeutic index weights follow the target class", () => {
  for (const weights of Object.values(THERAPEUTIC_WEIGHTS)) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
  }
  // A charge-heavy design scores higher where charge is weighted most.
  const seq = sampleFallbackCandidates(TARGET, 4, 1, "linear")[0] ?? "";
  const general = computeTherapeuticIndex(seq, "linear", 4, "general").index;
  const colonized = computeTherapeuticIndex(
    seq,
    "linear",
    4,
    "bacterial-colonization"
  ).index;
  assert.notEqual(general, colonized);
});

test("auditor rejects acid-labile bonds and low-complexity runs", () => {
  const clean = sampleFallbackCandidates(TARGET, 2, 1, "linear")[0] ?? "";
  const withDp = `${clean.slice(0, 6)}DP${clean.slice(8)}`;
  assert.ok(
    auditFailureModes(auditPeptideCandidate(withDp, 2, "linear")).includes(
      "ACID_LABILE_BOND"
    )
  );
  const polyA = "A".repeat(20);
  assert.ok(
    auditFailureModes(auditPeptideCandidate(polyA, 1, "linear")).includes(
      "LOW_COMPLEXITY_SEQUENCE"
    )
  );
  // The sampler repairs DP everywhere it samples.
  for (const modality of MODALITIES) {
    for (const seq of sampleFallbackCandidates(TARGET, 2, 2, modality)) {
      assert.ok(!seq.includes("DP"), `${modality} ${seq}`);
    }
  }
});

test("lab handoff scores synthesis difficulty and builds order CSV", () => {
  const easy = assessSynthesisDifficulty("ACGTACGTACGT");
  assert.equal(easy.score, 100);
  assert.deepEqual(easy.homopolymer_runs, []);
  const hard = assessSynthesisDifficulty(`ACGT${"A".repeat(8)}ACGTACGTACGT`);
  assert.ok(hard.score < 100);
  assert.ok(hard.homopolymer_runs.length >= 1);

  const csv = buildOrderCsv("SB-LIN-TEST", "ACGTACGT", "AAACCCGGGTTT");
  const lines = csv.split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[0]?.startsWith("construct_id,artifact,"));
  assert.ok(lines[1]?.includes("SB-LIN-TEST,gblock,8,"));
  assert.ok(lines[2]?.includes("SB-LIN-TEST,precursor_cdna,12,"));

  const manifest = buildLabHandoff("ACDEFGHIKLMN", "linear");
  assert.ok(typeof manifest.synthesis_difficulty?.score === "number");
  assert.ok((manifest.order_csv ?? "").includes("SB-LIN-"));
});

test("audit route scores caller-supplied sequences", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  process.env.API_BEARER_TOKEN = "test-token";
  const req = (body: unknown, token?: string): NextRequest =>
    ({
      headers: new Headers(
        token === undefined ? {} : { authorization: `Bearer ${token}` }
      ),
      json: async () => body,
    }) as unknown as NextRequest;

  assert.equal((await auditPOST(req({ sequence: "AAA" }, "wrong"))).status, 401);
  assert.equal((await auditPOST(req({ nope: 1 }, "test-token"))).status, 400);

  const good = sampleFallbackCandidates(TARGET, 2, 1, "linear")[0] ?? "";
  const ok = await auditPOST(
    req({ sequence: good, charge_target: 2, modality: "linear" }, "test-token")
  );
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as Record<string, unknown>;
  const data = body["data"] as Record<string, unknown>;
  assert.equal(data["audit_passed"], true);
  assert.ok(typeof data["therapeutic_index"] === "number");
  assert.ok(typeof data["safety_index"] === "number");

  const bad = await auditPOST(
    req({ sequence: "ACDE", charge_target: 4, modality: "linear" }, "test-token")
  );
  assert.equal(bad.status, 200);
  const badData = ((await bad.json()) as Record<string, unknown>)[
    "data"
  ] as Record<string, unknown>;
  assert.equal(badData["audit_passed"], false);
  assert.ok((badData["failure_modes"] as string[]).length >= 1);
});

test("modalities route lists compiler capabilities", async () => {
  const res = await modalitiesGET();
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  const data = body["data"] as Array<Record<string, unknown>>;
  assert.equal(data.length, 4);
  assert.equal(data[0]?.["modality"], "knottin-6c");
  assert.equal(data[0]?.["response_id"], "engineered_knottin_microprotein");
  assert.equal(data[3]?.["modality"], "linear");
});

test("route provenance carries the target class", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  process.env.API_BEARER_TOKEN = "test-token";
  const res = await POST({
    headers: new Headers({ authorization: "Bearer test-token" }),
    json: async () => ({
      target: "Clostridioides difficile colonization in the gut",
      charge_target: 2,
      modality: "linear",
    }),
  } as unknown as NextRequest);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  const provenance = body["neurosymbolic_provenance"] as Record<string, unknown>;
  assert.equal(provenance["target_class"], "bacterial-colonization");
});

test("route accepts a caller-selected model, defaulting to Spark", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  process.env.API_BEARER_TOKEN = "test-token";
  const req = (body: unknown): NextRequest =>
    ({
      headers: new Headers({ authorization: "Bearer test-token" }),
      json: async () => body,
    }) as unknown as NextRequest;

  assert.equal(
    (await POST(req({ target: TARGET, model: "../../etc/x" }))).status,
    400
  );

  const res = await POST(
    req({ target: TARGET, charge_target: 2, model: META_WONDER_MODEL })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  const provenance = body["neurosymbolic_provenance"] as Record<string, unknown>;
  assert.equal(provenance["proposer_model"], "Muse-Wonder-1.0");

  const spark = await POST(req({ target: TARGET, charge_target: 2 }));
  const sparkBody = (await spark.json()) as Record<string, unknown>;
  const sparkProvenance = sparkBody["neurosymbolic_provenance"] as Record<
    string,
    unknown
  >;
  assert.equal(sparkProvenance["proposer_model"], "Meta-Spark-1.3-Contributor");
});

test("prompts address the selected model", () => {
  const spark = buildSemanticProposePrompt(TARGET, 4);
  assert.ok(spark.includes("You are Muse Spark 1.3,"));
  const wonder = buildSemanticProposePrompt(
    TARGET,
    4,
    undefined,
    "knottin-6c",
    META_WONDER_MODEL
  );
  assert.ok(wonder.includes("You are Muse Wonder 1.0,"));
  assert.ok(!wonder.includes("Muse Spark 1.3"));
  const repair = buildRepairPrompt(
    "CAAA",
    "diag",
    4,
    undefined,
    undefined,
    "knottin-6c",
    META_WONDER_MODEL
  );
  assert.ok(repair.includes("Muse Wonder 1.0 performing"));
});

test("model labels pass unknown ids through", () => {
  assert.equal(displayNameForModel(META_SPARK_MODEL), "Meta-Spark-1.3-Contributor");
  assert.equal(shortLabelForModel(META_WONDER_MODEL), "Muse Wonder 1.0");
  assert.equal(displayNameForModel("future-model-9"), "future-model-9");
  assert.equal(shortLabelForModel("future-model-9"), "future-model-9");
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
