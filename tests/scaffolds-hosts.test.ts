import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MODALITIES,
  isModality,
  modalityLabel,
  parseModalityGrammar,
  specForModality,
} from "../lib/modality";
import {
  DEFAULT_MODALITY_BY_CLASS,
  inferTargetClass,
  selectDefaultModality,
  type TargetClass,
} from "../lib/prompt-steering";
import {
  auditFailureModes,
  auditPeptideCandidate,
  buildVerificationReport,
  computeHydrophobicMoment,
} from "../lib/symbolic-auditor";
import {
  buildKnottinPrompt,
  buildSemanticProposePrompt,
  sampleFallbackCandidates,
  secretionFraming,
} from "../lib/meta-spark";
import {
  DEFAULT_HOST,
  HOSTS,
  PELB_LEADER_22,
  SACB_LEADER_29,
  USP45_LEADER_27,
  hostLabel,
  isHost,
  specForHost,
} from "../lib/hosts";
import {
  BSUBTILIS_CODON_TABLE,
  BSUBTILIS_RARE_CODONS,
  LLACTIS_CODON_TABLE,
  LLACTIS_RARE_CODONS,
  optimizeCdsForHostId,
} from "../lib/codon-optimizer";
import {
  assessHostCompatibility,
  scoreAllHosts,
  selectDefaultHost,
} from "../lib/chassis-compat";
import { planBiocontainment } from "../lib/biocontainment";
import {
  buildBacterialHandoff,
  buildCloningPayload,
  buildLabHandoff,
} from "../lib/lab-handoff";
import {
  PROVIDERS,
  providersByKind,
  providersForHost,
} from "../lib/providers";
import { FUTURE_BADGE, ROADMAP_STUBS } from "../lib/roadmap";
import { AGENT_TOOLS, runAgentTools } from "../lib/agent-tools";
import { resolveDesignChoices } from "../lib/design-choices";
import {
  LabHandoffManifestSchema,
  PeptideRequestSchema,
} from "../types/peptide";
import { GET as hostsGET } from "../app/api/hosts/route";
import { GET as modalitiesGET } from "../app/api/modalities/route";

const KNOTTIN = "CSRTTCSQDTVCKVSKCSVCRIKSVNTC";
const TARGET = "Clostridioides difficile colonization in the gut";

test("auto scaffold resolves per objective, always to a small peptide", () => {
  const classes: TargetClass[] = [
    "bacterial-colonization",
    "toxin-blockade",
    "barrier-repair",
    "inflammation",
    "pain-motility",
    "metabolic",
    "general",
  ];
  assert.equal(MODALITIES.length, 7);
  for (const modality of MODALITIES) {
    const spec = specForModality(modality);
    assert.ok(spec.maxLength <= 37, `${modality} stays a small peptide`);
    assert.ok(isModality(modality));
    assert.ok(modalityLabel(modality).length > 0);
  }
  assert.equal(selectDefaultModality("bacterial-colonization").modality, "hairpin-2c");
  assert.equal(selectDefaultModality("metabolic").modality, "helical");
  assert.equal(selectDefaultModality("inflammation").modality, "cyclotide-6c");
  assert.equal(selectDefaultModality("barrier-repair").modality, "cyclotide-6c");
  assert.equal(selectDefaultModality("toxin-blockade").modality, "knottin-6c");
  assert.equal(selectDefaultModality("general").modality, "knottin-6c");
  for (const cls of classes) {
    const entry = DEFAULT_MODALITY_BY_CLASS[cls];
    assert.ok(MODALITIES.includes(entry.modality));
    assert.ok(entry.reason.length > 0);
    assert.equal(inferTargetClass(TARGET), "bacterial-colonization");
  }
  const cyclotide = specForModality("cyclotide-6c");
  assert.equal(cyclotide.cyclic, true);
  assert.equal(specForModality("helical").momentMin, 1.2);
});

test("new scaffold grammars enforce their topologies", () => {
  // Cyclotides share the knottin envelopes with a CCK relabel.
  assert.equal(parseModalityGrammar(KNOTTIN, "cyclotide-6c").valid, true);
  const badCyc = parseModalityGrammar("ACDEFGHIKLMNPQRSTVWYACDE", "cyclotide-6c");
  assert.equal(badCyc.valid, false);
  assert.ok(badCyc.syntaxErrors.some((error) => error.includes("CCK")));
  // Hairpins need a real inter-cysteine loop for two strands.
  assert.equal(
    parseModalityGrammar("CSARIHKCRFAILNKHI", "hairpin-2c").valid,
    true
  );
  const tight = parseModalityGrammar("ACDCEFGHIKLMNPQRSTVWY", "hairpin-2c");
  assert.equal(tight.valid, false);
  assert.ok(tight.syntaxErrors.some((error) => error.includes("cysteine_spacing")));
  // Helical scaffolds are cysteine-free like linears.
  assert.equal(
    parseModalityGrammar("LQKAASKFPKSANRLV", "helical").valid,
    true
  );
  assert.equal(
    parseModalityGrammar("LQKAASKCPKSANRLV", "helical").valid,
    false
  );
});

test("helical moment gate admits amphipathicity, rejects uniformity", () => {
  // Magainin-2's amphipathic helix is the positive control.
  assert.ok(computeHydrophobicMoment("GIGKFLHSAKKFGKAFVGEIMNS") >= 1.2);
  const sampled =
    sampleFallbackCandidates("TNF-alpha gut inflammation", 4, 1, "helical")[0] ??
    "";
  assert.ok(sampled.length >= 12);
  assert.ok(computeHydrophobicMoment(sampled) >= 1.2);
  assert.equal(auditPeptideCandidate(sampled, 4, "helical").passed, true);
  const uniform = auditPeptideCandidate("AAAAAAAAAAAAAAAAAA", 4, "helical");
  assert.equal(uniform.passed, false);
  assert.ok(auditFailureModes(uniform).includes("HELIX_MOMENT_LOW"));
});

test("cyclotide audit rejects a ligation-hostile C-terminus", () => {
  assert.equal(auditPeptideCandidate(KNOTTIN, 4, "cyclotide-6c").passed, true);
  const blocked = auditPeptideCandidate(`${KNOTTIN}GAP`, 4, "cyclotide-6c");
  assert.equal(blocked.passed, false);
  assert.ok(
    blocked.violations.some((violation) => violation.startsWith("c_terminus:"))
  );
  assert.ok(auditFailureModes(blocked).includes("C_TERMINUS_BLOCKED"));
  const report = buildVerificationReport(
    parseModalityGrammar(`${KNOTTIN}GAP`, "cyclotide-6c"),
    blocked
  );
  assert.equal(report.c_terminus_ok, false);
  assert.equal(report.helix_moment_ok, true);
});

test("fallback sampler yields passing candidates for every scaffold", () => {
  for (const modality of MODALITIES) {
    const kept = sampleFallbackCandidates(TARGET, 4, 2, modality);
    assert.ok(kept.length >= 1, `${modality} samples a passing candidate`);
    for (const seq of kept) {
      assert.equal(parseModalityGrammar(seq, modality).valid, true);
      assert.equal(auditPeptideCandidate(seq, 4, modality).passed, true);
    }
  }
});

test("prompts frame the chosen chassis, defaulting to yeast", () => {
  const yeast = buildSemanticProposePrompt(TARGET, 4);
  assert.ok(yeast.includes("Saccharomyces boulardii"));
  assert.ok(yeast.includes("MFalpha1"));
  const nissle = buildSemanticProposePrompt(
    TARGET,
    4,
    undefined,
    "hairpin-2c",
    "muse-spark-1.3-contributor",
    "ecoli-nissle"
  );
  assert.ok(nissle.includes("Nissle 1917"));
  assert.ok(nissle.includes("Conservative shared gates"));
  const knottin = buildKnottinPrompt(TARGET, 4, undefined, "knottin-6c");
  assert.ok(knottin.includes("Saccharomyces boulardii"));
  assert.ok(secretionFraming("bacillus-subtilis").includes("WB800"));
});

test("host registry covers four oral chassis with honest leaders", () => {
  assert.deepEqual(HOSTS, [
    "sboulardii",
    "ecoli-nissle",
    "lactococcus-lactis",
    "bacillus-subtilis",
  ]);
  assert.equal(DEFAULT_HOST, "sboulardii");
  for (const host of HOSTS) {
    const spec = specForHost(host);
    assert.ok(isHost(host));
    assert.ok(spec.delivery.includes("oral"));
    assert.ok(hostLabel(host).length > 0);
    assert.ok(spec.containment.auxotrophy.length >= 1);
    assert.ok(spec.containment.killSwitches.length >= 1);
    assert.ok(spec.containment.integration.length > 0);
  }
  // Every bacterial leader is vouched: PelB from the pET manuals,
  // SPusp45 and SacB from UniProt SIGNAL features (P22865, P05655).
  assert.equal(PELB_LEADER_22.length, 22);
  assert.equal(USP45_LEADER_27.length, 27);
  assert.equal(SACB_LEADER_29.length, 29);
  assert.equal(
    specForHost("ecoli-nissle").secretion.leaderSequence,
    PELB_LEADER_22
  );
  assert.equal(
    specForHost("lactococcus-lactis").secretion.leaderSequence,
    USP45_LEADER_27
  );
  assert.equal(
    specForHost("lactococcus-lactis").secretion.leaderEvidence,
    "uniprot"
  );
  assert.equal(
    specForHost("bacillus-subtilis").secretion.leaderSequence,
    SACB_LEADER_29
  );
  assert.equal(
    specForHost("bacillus-subtilis").secretion.leaderEvidence,
    "uniprot"
  );
  for (const host of HOSTS) {
    assert.equal(specForHost(host).codonBasis, "native");
  }
});

test("native codon tables match RefSeq usage peaks", () => {
  // Lactococcus is AT-extreme: AAA, GAA, TTT lead their synonyms.
  assert.deepEqual(LLACTIS_CODON_TABLE["K"]?.slice(0, 1), ["AAA"]);
  assert.deepEqual(LLACTIS_CODON_TABLE["E"]?.slice(0, 1), ["GAA"]);
  assert.deepEqual(LLACTIS_CODON_TABLE["L"]?.slice(0, 1), ["TTA"]);
  assert.deepEqual(LLACTIS_CODON_TABLE["R"]?.slice(0, 1), ["CGT"]);
  // Bacillus is moderate: CCG proline, ACA threonine, AGA arginine.
  assert.deepEqual(BSUBTILIS_CODON_TABLE["P"]?.slice(0, 1), ["CCG"]);
  assert.deepEqual(BSUBTILIS_CODON_TABLE["T"]?.slice(0, 1), ["ACA"]);
  assert.deepEqual(BSUBTILIS_CODON_TABLE["R"]?.slice(0, 1), ["AGA"]);
  for (const table of [LLACTIS_CODON_TABLE, BSUBTILIS_CODON_TABLE]) {
    assert.equal(Object.keys(table).length, 20);
  }
  assert.ok(LLACTIS_RARE_CODONS.has("AGG"));
  assert.ok(LLACTIS_RARE_CODONS.has("CTG"));
  assert.ok(BSUBTILIS_RARE_CODONS.has("CTA"));
  assert.ok(!BSUBTILIS_RARE_CODONS.has("AAA"));
});

test("host codon optimization tunes into each GC window", () => {
  const ll = optimizeCdsForHostId("lactococcus-lactis", KNOTTIN);
  assert.equal(ll.basis, "native");
  assert.equal(ll.dna.length, KNOTTIN.length * 3);
  assert.ok(ll.gcContent >= 0.3 && ll.gcContent <= 0.4);
  assert.ok(ll.cai >= 0.9);
  const bs = optimizeCdsForHostId("bacillus-subtilis", KNOTTIN);
  assert.equal(bs.basis, "native");
  assert.ok(bs.gcContent >= 0.38 && bs.gcContent <= 0.5);
  assert.ok(bs.cai >= 0.9);
  const ec = optimizeCdsForHostId("ecoli-nissle", KNOTTIN);
  assert.equal(ec.basis, "native");
  assert.throws(() => optimizeCdsForHostId("nope", KNOTTIN));
});

test("default chassis follows folding physics and target biology", () => {
  assert.equal(
    selectDefaultHost("general", "knottin-6c").host,
    "sboulardii"
  );
  assert.equal(
    selectDefaultHost("inflammation", "cyclotide-6c").host,
    "sboulardii"
  );
  assert.equal(
    selectDefaultHost("bacterial-colonization", "hairpin-2c").host,
    "ecoli-nissle"
  );
  assert.equal(
    selectDefaultHost("metabolic", "helical").host,
    "lactococcus-lactis"
  );
  for (const entry of Object.values(DEFAULT_MODALITY_BY_CLASS)) {
    const { host, reason } = selectDefaultHost("general", entry.modality);
    assert.ok(isHost(host));
    assert.ok(reason.length > 0);
  }
});

test("chassis compatibility ranks folding capacity first", () => {
  const knottin = scoreAllHosts(KNOTTIN, "knottin-6c");
  assert.equal(knottin.length, 4);
  assert.equal(knottin[0]?.host, "sboulardii");
  assert.ok((knottin[0]?.score ?? 0) >= (knottin[3]?.score ?? 0));
  const lactis = knottin.find((entry) => entry.host === "lactococcus-lactis");
  assert.equal(lactis?.score, 70);
  assert.ok(
    lactis?.secretion.notes.some((note) => note.includes("disulfide"))
  );
  const subtilis = knottin.find((entry) => entry.host === "bacillus-subtilis");
  assert.equal(subtilis?.score, 65);
  const linear = scoreAllHosts("GSNRHAPALIKQRLTKWQ", "linear");
  for (const entry of linear) {
    assert.ok(entry.score >= 0 && entry.score <= 100);
    assert.ok(entry.secretion.notes.length > 0);
    assert.ok(entry.burden.notes.length > 0);
    assert.ok(entry.processing.notes.length > 0);
  }
  const single = assessHostCompatibility(KNOTTIN, "knottin-6c", "sboulardii");
  assert.equal(single.verdict, "excellent");
  assert.equal(single.score, 100);
});

test("biocontainment plans layers and pre-screens sequence risk", () => {
  for (const host of HOSTS) {
    const plan = planBiocontainment(KNOTTIN, "knottin-6c", host);
    assert.equal(plan.host, host);
    assert.ok(plan.auxotrophy.length >= 1);
    assert.ok(plan.killSwitches.length >= 1);
    assert.ok(plan.integration.length > 0);
    assert.ok(["stable", "review", "fragile"].includes(plan.plasmidStability.verdict));
    assert.ok(["low", "moderate", "elevated"].includes(plan.payloadToxicity.risk));
  }
  const repeats = planBiocontainment("ACACACACACACACAC", "linear", "sboulardii");
  assert.equal(repeats.plasmidStability.verdict, "fragile");
  assert.ok(repeats.plasmidStability.flags.length >= 2);
  assert.ok(repeats.plasmidStability.mitigations.length >= 1);
  const toxic = planBiocontainment("KLFKLFKLFKLFK", "linear", "ecoli-nissle");
  assert.equal(toxic.payloadToxicity.risk, "elevated");
  const calm = planBiocontainment("GSNRHAPALIKQRLTKWQ", "linear", "sboulardii");
  assert.equal(calm.plasmidStability.verdict, "stable");
});

test("bacterial handoff builds clean, schema-valid fragments", () => {
  for (const host of ["ecoli-nissle", "lactococcus-lactis", "bacillus-subtilis"] as const) {
    const manifest = buildLabHandoff(KNOTTIN, "knottin-6c", host);
    assert.equal(LabHandoffManifestSchema.safeParse(manifest).success, true);
    assert.equal(manifest.host, host);
    assert.equal(manifest.restriction_scrub.status, "clean");
    assert.ok(manifest.dna_gblock.endsWith("TAA"));
    assert.ok((manifest.host_plan?.["kill_switches"] as string[]).length >= 1);
  }
  const nissle = buildBacterialHandoff(KNOTTIN, "knottin-6c", "ecoli-nissle");
  assert.equal(nissle.codon_basis, "native");
  assert.ok(nissle.precursor_fasta.includes("PelB_22aa_periplasm"));
  const lactis = buildBacterialHandoff(KNOTTIN, "knottin-6c", "lactococcus-lactis");
  assert.equal(lactis.codon_basis, "native");
  assert.ok(lactis.precursor_fasta.includes("SPusp45_27aa"));
  const subtilis = buildBacterialHandoff(KNOTTIN, "knottin-6c", "bacillus-subtilis");
  assert.equal(subtilis.codon_basis, "native");
  assert.ok(subtilis.precursor_fasta.includes("SacB_29aa"));
  const yeast = buildLabHandoff(KNOTTIN, "knottin-6c", "sboulardii");
  assert.equal(yeast.codon_basis, "native");
  assert.ok(yeast.dna_gblock.length > 400);
  const cloning = buildCloningPayload("GSNRHAPALIKQRLTKWQ", "linear", "ecoli-nissle");
  assert.equal(cloning.cassette_format, "PelB-Sec-Periplasm-TAA");
  assert.equal(cloning.stop_codon, "TAA");
  assert.equal(cloning.leader_dna_5flank.length, PELB_LEADER_22.length * 3);
});

test("provider directory links synthesis and CRO partners per host", () => {
  assert.ok(PROVIDERS.length >= 14);
  for (const provider of PROVIDERS) {
    assert.ok(provider.url.startsWith("https://"), provider.name);
    assert.ok(provider.relevance.length > 0);
  }
  assert.ok(providersByKind("synthesis").length >= 7);
  assert.ok(providersByKind("cro-cdmo").length >= 8);
  const yeast = providersForHost("sboulardii").map((entry) => entry.name);
  assert.ok(yeast.includes("Lallemand Health Solutions"));
  const nissle = providersForHost("ecoli-nissle").map((entry) => entry.name);
  assert.ok(!nissle.includes("Lallemand Health Solutions"));
  assert.ok(nissle.includes("Wacker Biotech"));
  const wacker = PROVIDERS.find((entry) => entry.name === "Wacker Biotech");
  assert.equal(wacker?.url, "https://www.wacker.com/biologics");
});

test("roadmap stubs render future functionality honestly", async () => {
  assert.equal(FUTURE_BADGE, "Future functionality");
  assert.deepEqual(
    ROADMAP_STUBS.map((stub) => stub.id),
    ["wetlab-feedback", "potency-prediction", "gut-safety-panel"]
  );
  for (const stub of ROADMAP_STUBS) {
    assert.equal(stub.badge, FUTURE_BADGE);
    assert.ok(stub.summary.length > 0);
    assert.ok(stub.how.length > 20);
  }
  const results = await runAgentTools({
    candidate: KNOTTIN,
    target: TARGET,
    modality: "knottin-6c",
    charge_target: 4,
  });
  assert.equal(results.length, AGENT_TOOLS.length);
  for (const stub of ROADMAP_STUBS) {
    const hit = results.find((entry) => entry.tool === stub.id);
    assert.equal(hit?.status, "not-configured");
    assert.ok((hit?.detail ?? "").includes(stub.how));
  }
});

test("design choices resolve auto with recorded reasons", () => {
  const auto = resolveDesignChoices(TARGET, undefined, undefined, undefined);
  assert.equal(auto.targetClass, "bacterial-colonization");
  assert.equal(auto.modality, "hairpin-2c");
  assert.equal(auto.host, "ecoli-nissle");
  assert.equal(auto.choices.modalityRequested, "auto");
  assert.equal(auto.choices.hostRequested, "auto");
  assert.ok((auto.choices.modalityReason ?? "").length > 0);
  assert.ok((auto.choices.hostReason ?? "").length > 0);
  assert.equal(auto.params.modality_requested, "auto");
  const explicit = resolveDesignChoices(TARGET, undefined, "linear", "sboulardii");
  assert.equal(explicit.modality, "linear");
  assert.equal(explicit.host, "sboulardii");
  assert.equal(explicit.choices.modalityRequested, "linear");
  assert.equal(explicit.params.host_requested, "sboulardii");
  assert.equal(PeptideRequestSchema.safeParse({ target: TARGET }).success, true);
  assert.equal(
    PeptideRequestSchema.safeParse({
      target: TARGET,
      modality: "cyclotide-6c",
      host: "bacillus-subtilis",
    }).success,
    true
  );
  assert.equal(
    PeptideRequestSchema.safeParse({ target: TARGET, modality: "auto", host: "auto" })
      .success,
    true
  );
  assert.equal(
    PeptideRequestSchema.safeParse({ target: TARGET, host: "bogus" }).success,
    false
  );
});

test("hosts route lists chassis with partners", async () => {
  const res = await hostsGET();
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  const data = body["data"] as Array<Record<string, unknown>>;
  assert.equal(data.length, 4);
  assert.equal(data[0]?.["host"], "sboulardii");
  const nissle = data.find((entry) => entry["host"] === "ecoli-nissle");
  assert.equal(nissle?.["codon_basis"], "native");
  assert.ok(((nissle?.["providers"] as unknown[]) ?? []).length >= 5);
  const lactis = data.find((entry) => entry["host"] === "lactococcus-lactis");
  assert.equal(lactis?.["codon_basis"], "native");
  assert.equal(lactis?.["leader_evidence"], "uniprot");
});

test("modalities route maps auto defaults per objective", async () => {
  const res = await modalitiesGET();
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  const data = body["data"] as Array<Record<string, unknown>>;
  const hairpin = data.find((entry) => entry["modality"] === "hairpin-2c");
  assert.ok(
    ((hairpin?.["auto_default_for"] as string[]) ?? []).includes("bacterial-colonization")
  );
  assert.ok(((hairpin?.["auto_default_reason"] as string) ?? "").length > 0);
});
