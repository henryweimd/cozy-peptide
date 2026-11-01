import {
  type AgentToolResult,
  type KnottinGrammarParse,
  type MetaSparkMessage,
  type RefinementTurn,
  type SpecificityReport,
  type SymbolicAuditResult,
} from "../types/peptide";
import {
  BLOCKED_N_TERMINI,
  HYDROPHOBIC_RUN_SET,
  MAX_METHIONINES,
  auditFailureModes,
  auditPeptideCandidate,
  computeHydrophobicMoment,
  grammarFailureModes,
} from "./symbolic-auditor";
import {
  checkSpecificity,
  summarizeSpecificity,
  uncheckedSpecificity,
} from "./specificity";
import {
  DEFAULT_MODALITY,
  type Modality,
  parseModalityGrammar,
  specForModality,
} from "./modality";
import { DEFAULT_HOST, type HostId } from "./hosts";
import {
  type TargetClass,
  buildRepairSteering,
  buildSteeringBrief,
  constraintBlockForModality,
  withResearchBrief,
} from "./prompt-steering";
import { requestSparkCompletion } from "./spark-client";
import {
  RESEARCH_DEFAULT_BUDGET_MS,
  runResearchBrief,
  type ResearchProvenance,
} from "./research/brief";
import { assessCandidate } from "./therapeutic-index";
import { runAgentTools } from "./agent-tools";
import {
  DEFAULT_MODEL,
  META_SPARK_MODEL,
  META_SPARK_DEFAULT_URL,
  META_SPARK_TIMEOUT_MS,
  getMetaSparkApiUrl,
  shortLabelForModel,
} from "./spark-config";

export {
  META_SPARK_MODEL,
  META_SPARK_DEFAULT_URL,
  META_SPARK_TIMEOUT_MS,
  getMetaSparkApiUrl,
};
export const META_SPARK_REASONING_EFFORT = "minimal";
export const META_SPARK_PROPOSE_MAX_TOKENS = 4096;
export const META_SPARK_REPAIR_MAX_TOKENS = 2048;
/** Minimum remaining API budget (ms) required to start another request. */
export const META_SPARK_MIN_REQUEST_BUDGET_MS = 10000;
export const KNOTTIN_TOPOLOGY = "C-X(3,7)-C-X(3,6)-C-X(1,4)-C-X(2,6)-C-X(4,10)-C";

/**
 * Sampling temperature schedule. The first proposal uses the base
 * temperature; every automatic retry re-prompts with a penalized
 * (lower, more deterministic) temperature until the batch requirement
 * is met or the budget is exhausted.
 */
export const META_SPARK_BASE_TEMPERATURE = 0.7;
export const META_SPARK_TEMPERATURE_PENALTY = 0.15;
export const META_SPARK_MIN_TEMPERATURE = 0.1;

/** Penalized temperature for refinement cycle `cycle` (0 = propose). */
export function repairTemperatureForCycle(cycle: number): number {
  const penalized =
    META_SPARK_BASE_TEMPERATURE - META_SPARK_TEMPERATURE_PENALTY * cycle;
  return Math.max(META_SPARK_MIN_TEMPERATURE, penalized);
}

/**
 * Natural knottin style anchors (UniProt P12071 / P82409) shown to the
 * proposer as few-shot pacing examples. The model must learn cysteine
 * pacing from them and invent novel loops — never copy them.
 */
export const KNOTTIN_SCAFFOLDS: Array<{ name: string; sequence: string }> = [
  {
    name: "EETI-II",
    sequence: "GCPRILMRCKQDSDCLAGCVCGPNGFCGSP",
  },
  {
    name: "MCoTI-II",
    sequence: "SGSDGGVCPKILKKCRRDSDCPGACICRGNGYCG",
  },
];

function scaffoldLines(): string[] {
  return KNOTTIN_SCAFFOLDS.map(
    (scaffold) => `  ${scaffold.name}: ${scaffold.sequence}`
  );
}

/**
 * Secretion framing for the chosen chassis. Yeast is the conservative
 * home case; bacterial hosts name their secretion route. The
 * bioprocess gates stay shared and conservative across chassis (a
 * design clean for yeast Golgi is clean for bacterial Sec too), so
 * only the framing — never the gates — varies by host.
 */
export function secretionFraming(host: HostId): string {
  switch (host) {
    case "ecoli-nissle":
      return "for Sec-to-periplasm secretion by Escherichia coli Nissle 1917 (PelB leader, Dsb oxidation)";
    case "lactococcus-lactis":
      return "for Sec secretion by Lactococcus lactis (SPusp45 leader)";
    case "bacillus-subtilis":
      return "for Sec secretion by Bacillus subtilis (WB800 protease-deficient background)";
    case "sboulardii":
    default:
      return "for continuous secretion by engineered yeast (Saccharomyces boulardii via the MFalpha1 pre-pro leader)";
  }
}

/**
 * Shared-gates portability note, appended for bacterial hosts so the
 * proposer understands why yeast Golgi liabilities are still excluded.
 */
function sharedGatesNote(host: HostId): string | null {
  if (host === "sboulardii") return null;
  return "Conservative shared gates: yeast Golgi liabilities (Kex2, glycosylation) are excluded as well, keeping the design portable across chassis.";
}

/**
 * Structured prompt instructing Meta Spark 1.3 to propose 3-5 peptide
 * secretion payloads for a design modality, defaulting to the canonical
 * ICK knottin topology with MFalpha1 bioprocess constraints. An optional
 * system-authored steering brief (target-class directives plus the safety
 * contract) focuses proposals on therapeutic potential.
 */
export function buildKnottinPrompt(
  target: string,
  chargeTarget: number,
  steering?: string,
  modality: Modality = "knottin-6c",
  model: string = META_SPARK_MODEL,
  host: HostId = DEFAULT_HOST
): string {
  const spec = specForModality(modality);
  const persona = shortLabelForModel(model);
  const framing =
    host === "sboulardii" ? null : secretionFraming(host);
  const lines = [
    `You are ${persona}, a protein-design contributor for therapeutic gut-delivered ${modality === "knottin-6c" ? "knottins" : `${spec.noun}s`}.`,
    `Target: ${target}.`,
    modality === "knottin-6c"
      ? `Propose 3-5 candidate knottin peptide sequences (single-letter amino acid code) optimized specifically as 6-cysteine knottin payloads (ICK topology C1-C4 / C2-C5 / C3-C6) ${framing ?? "for continuous secretion by engineered yeast (Saccharomyces boulardii via the MFalpha1 pre-pro leader)"}.`
      : `Propose 3-5 candidate ${spec.noun} sequences (single-letter amino acid code) ${framing ?? "for continuous secretion by Saccharomyces boulardii via the MFalpha1 pre-pro leader"}.`,
    "Every candidate MUST satisfy all of the following hard constraints:",
    ...constraintBlockForModality(modality, chargeTarget).map(
      (rule, index) => `${index + 1}. ${rule}`
    ),
  ];
  const gatesNote = sharedGatesNote(host);
  if (gatesNote !== null) lines.push(gatesNote);
  if (modality === "knottin-6c") {
    lines.push(
      "Gut-stable, non-toxic, non-antimicrobial design; no toxin or translocation-domain content.",
      "Style anchors from nature — learn their cysteine pacing, then invent novel loops (do not copy these sequences):",
      ...scaffoldLines()
    );
  }
  if (steering !== undefined && steering.length > 0) {
    lines.push(`System steering: ${steering}`);
  }
  lines.push(
    modality === "knottin-6c"
      ? "Output format: respond with ONLY the candidates, one per line, as bare uppercase sequences with no numbering, no headers, no FASTA headers, and no commentary."
      : "Output format: respond with ONLY the candidates, one per line, each labeled exactly as: CANDIDATE <n>: <BARE UPPERCASE SEQUENCE>. No FASTA headers, no commentary."
  );
  return lines.join("\n");
}

/**
 * Turn-0 semantic prompt: frames generation as evolutionary adaptation of
 * peptide secretion payloads to a clinical gut target, demanding an
 * explicit <scratchpad> reasoning trace per candidate. An optional
 * system-authored steering brief focuses the model on the therapeutic
 * goal; non-knottin modalities substitute their own grammar lines.
 */
export function buildSemanticProposePrompt(
  target: string,
  chargeTarget: number,
  steering?: string,
  modality: Modality = "knottin-6c",
  model: string = META_SPARK_MODEL,
  host: HostId = DEFAULT_HOST
): string {
  const spec = specForModality(modality);
  const persona = shortLabelForModel(model);
  const framing =
    host === "sboulardii"
      ? "optimized for continuous secretion by Saccharomyces boulardii via the MFalpha1 pre-pro leader"
      : `optimized ${secretionFraming(host)}`;
  const lines =
    modality === "knottin-6c"
      ? [
          `You are ${persona}, a semantic evolutionary orator for therapeutic micro-proteins.`,
          `Clinical gut target: ${target}. Adapt knottin secretion payloads to this target as evolution would: propose sequence tokens grounded in semantic context, functional fitness, and mucosal resilience, ${framing}.`,
          "Express exactly 3 candidate knottins in the loop grammar L0-C1-L1-C2-L2-C3-L3-C4-L4-C5-L5-C6-L6 with ICK pairing C1-C4, C2-C5, C3-C6.",
          "Hard syntactic and bioprocess constraints for every candidate:",
          `1. Canonical ICK loop envelopes: L1 3-7, L2 3-6, L3 1-4, L4 2-6, L5 4-10; total 28-36 aa; sequence starts and ends with cysteine.`,
          "2. Zero Kex2 internal cleavage: no KR, RR, PR, KK, or RK motifs.",
          "3. Zero N-linked glycosylation: no N[^P][ST] sequon (X != P).",
          "4. Clean N-terminal processing: residue 1 must be A, S, G, or C — never P, F, Y, or W.",
          `5. Net charge exactly +${chargeTarget} (inside the +1 to +4 window at pH 7.4); allocate charge preferentially to the L3 functional cassette and L5 presentation loop.`,
          "6. No exposed chymotrypsin sites [FYW][^P][KR]; hydrophobic runs over [VILMFW] at most 3 consecutive residues.",
          "7. GRAVY between -0.40 and +0.10; no NG, DG, or DP hotspots; at most one methionine; gut-stable and non-toxic.",
          "Style anchors from nature — learn their cysteine pacing, then invent novel loops (do not copy these sequences):",
          ...scaffoldLines(),
        ]
      : [
          `You are ${persona}, a semantic evolutionary orator for therapeutic micro-proteins.`,
          `Clinical gut target: ${target}. Adapt ${spec.noun} secretion payloads to this target as evolution would: propose sequence tokens grounded in semantic context, functional fitness, and mucosal resilience, ${framing}.`,
          `Express exactly 3 candidate ${spec.noun}s.`,
          "Hard syntactic and bioprocess constraints for every candidate:",
          ...constraintBlockForModality(modality, chargeTarget).map(
            (rule, index) => `${index + 1}. ${rule}`
          ),
        ];
  const gatesNote = sharedGatesNote(host);
  if (gatesNote !== null) lines.push(gatesNote);
  if (steering !== undefined && steering.length > 0) {
    lines.push(`System steering: ${steering}`);
  }
  lines.push(
    "For each candidate, first write a <scratchpad> trace of exactly one sentence explaining why its loop composition satisfies the target receptor interface without triggering host mucosal clearance, then emit the candidate on its own line as: CANDIDATE <n>: <BARE UPPERCASE SEQUENCE>."
  );
  return lines.join("\n");
}

/**
 * Repair prompt: hands a failed candidate plus its symbolic compiler
 * diagnostic back to the model for token-level repair. Optional repair
 * steering (recurring faults across turns) prioritizes whatever keeps
 * failing; non-knottin modalities substitute their own contract lines.
 */
export function buildRepairPrompt(
  failedSequence: string,
  compilerDiagnostic: string,
  chargeTarget: number,
  preservedCassette?: string,
  steering?: string,
  modality: Modality = "knottin-6c",
  model: string = META_SPARK_MODEL
): string {
  const spec = specForModality(modality);
  const persona = shortLabelForModel(model);
  const lines = [
    `You are ${persona} performing deterministic compiler-guided repair of a ${modality === "knottin-6c" ? "knottin" : spec.noun} secretion payload.`,
    `Failed candidate: ${failedSequence}`,
    `Symbolic compiler diagnostic: ${compilerDiagnostic}`,
    `Repair the semantic tokens to eliminate every listed fault while satisfying the full ${modality === "knottin-6c" ? "knottin" : spec.noun} secretion contract:`,
    modality === "knottin-6c"
      ? "L0-C1-L1-C2-L2-C3-L3-C4-L4-C5-L5-C6-L6, ICK pairing C1-C4/C2-C5/C3-C6, L1 3-7, L2 3-6, L3 1-4, L4 2-6, L5 4-10, total 28-36 aa,"
      : `${spec.noun} topology: exactly ${spec.cysteines} cysteines, total ${spec.minLength}-${spec.maxLength} aa,`,
    modality === "knottin-6c"
      ? `zero Kex2 motifs (KR, RR, PR, KK, RK), zero N[^P][ST] sequons, residue 1 in {A,S,G,C}, net charge exactly +${chargeTarget} (window +1 to +4 at pH 7.4), no [FYW][^P][KR], hydrophobic runs over [VILMFW] of at most 3, GRAVY in [-0.40, +0.10], no NG/DG/DP hotspots, at most one M.`
      : `zero Kex2 motifs (KR, RR, PR, KK, RK), zero N[^P][ST] sequons, residue 1 in {A,S,G,C}, net charge exactly +${chargeTarget} (window +1 to +4 at pH 7.4), no [FYW][^P][KR], hydrophobic runs over [VILMFW] of at most 3, GRAVY in [${spec.gravyMin.toFixed(2)}, +${spec.gravyMax.toFixed(2)}], no NG/DG/DP hotspots, at most one M.`,
  ];
  if (preservedCassette !== undefined && preservedCassette.length > 0) {
    lines.push(
      `Preserve the functional L3 epitope cassette '${preservedCassette}' unless it carries a fault.`
    );
  }
  if (steering !== undefined && steering.length > 0) {
    lines.push(steering);
  }
  if (modality === "helical") {
    lines.push(
      `Helical amphipathicity: cluster hydrophobics on one helical face so the KD-scale hydrophobic moment clears ${(spec.momentMin ?? 1.2).toFixed(2)}; no proline (helix breaker).`
    );
  }
  if (modality === "cyclotide-6c") {
    lines.push(
      "Cyclic termini: the C-terminal residue must not be proline (ligation junction)."
    );
  }
  lines.push(
    modality === "knottin-6c"
      ? "Respond with ONLY 1-3 repaired candidates, one per line, as bare uppercase sequences with no commentary."
      : "Respond with ONLY 1-3 repaired candidates, one per line, each labeled exactly as: CANDIDATE <n>: <BARE UPPERCASE SEQUENCE>. No commentary."
  );
  return lines.join("\n");
}

const CANONICAL_AA_PATTERN = /^[ACDEFGHIKLMNPQRSTVWY]+$/;

/**
 * Extracts pure candidate sequences from a model completion via regex,
 * preserving document order across FASTA blocks, CANDIDATE labels, and
 * bare sequences (including <scratchpad> interleavings). Shorter
 * modalities disable bare-word extraction: English prose words would
 * otherwise match, so labeled candidates are required.
 */
export function extractCandidateSequences(
  completion: string,
  minLength = 28,
  maxLength = 36,
  allowBare = true
): string[] {
  const hits: Array<{ index: number; seq: string }> = [];
  const inWindow = (seq: string): boolean =>
    seq.length >= minLength &&
    seq.length <= maxLength &&
    CANONICAL_AA_PATTERN.test(seq);

  const fastaRe = />[^\n]*\n([A-Za-z\s]+)/g;
  let fastaMatch: RegExpExecArray | null;
  while ((fastaMatch = fastaRe.exec(completion)) !== null) {
    const body = (fastaMatch[1] ?? "").replace(/\s+/g, "").toUpperCase();
    if (inWindow(body)) {
      hits.push({ index: fastaMatch.index, seq: body });
    }
  }

  // Labeled candidates, one per line; internal spaces are tolerated.
  let lineStart = 0;
  for (const line of completion.split("\n")) {
    const candidateMatch = /CANDIDATE\s*\d*\s*[:\-]\s*([A-Za-z][A-Za-z ]*)/i.exec(
      line
    );
    if (candidateMatch !== null) {
      const seq = (candidateMatch[1] ?? "")
        .replace(/\s+/g, "")
        .toUpperCase();
      if (inWindow(seq)) {
        hits.push({ index: lineStart + candidateMatch.index, seq });
      }
    }
    lineStart += line.length + 1;
  }

  if (allowBare) {
    const bareRe = new RegExp(
      `\\b[ACDEFGHIKLMNPQRSTVWYacdefghiklmnpqrstvwy]{${minLength},${maxLength}}\\b`,
      "g"
    );
    let bareMatch: RegExpExecArray | null;
    while ((bareMatch = bareRe.exec(completion)) !== null) {
      const seq = (bareMatch[0] ?? "").toUpperCase();
      if (CANONICAL_AA_PATTERN.test(seq)) {
        hits.push({ index: bareMatch.index, seq });
      }
    }
  }

  hits.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const found: string[] = [];
  for (const hit of hits) {
    if (seen.has(hit.seq)) continue;
    seen.add(hit.seq);
    found.push(hit.seq);
    if (found.length >= 8) break;
  }
  return found;
}

/**
 * Sends one chat completion to the Meta Spark 1.3 Contributor API and
 * returns extracted candidates, or an empty array on any failure.
 */
export interface CandidateExtraction {
  minLength: number;
  maxLength: number;
  allowBare: boolean;
}

export function extractionForModality(modality: Modality): CandidateExtraction {
  const spec = specForModality(modality);
  return {
    minLength: spec.minLength,
    maxLength: spec.maxLength,
    allowBare: modality === "knottin-6c",
  };
}

export async function requestSparkCandidates(
  messages: MetaSparkMessage[],
  maxTokens = META_SPARK_PROPOSE_MAX_TOKENS,
  timeoutMs = META_SPARK_TIMEOUT_MS,
  temperature = META_SPARK_BASE_TEMPERATURE,
  extraction: CandidateExtraction = {
    minLength: 28,
    maxLength: 36,
    allowBare: true,
  },
  model: string = META_SPARK_MODEL
): Promise<string[]> {
  const completion = await requestSparkCompletion(messages, {
    maxTokens,
    timeoutMs,
    temperature,
    model,
  });
  if (completion === null) return [];
  const candidates = extractCandidateSequences(
    completion.text,
    extraction.minLength,
    extraction.maxLength,
    extraction.allowBare
  );
  if (candidates.length === 0) {
    console.warn(
      `[meta-spark] zero candidates extracted from ${completion.text.length} chars (finish=${completion.finish})`
    );
  }
  return candidates;
}

/**
 * Calls the Meta Spark 1.3 Contributor API for knottin sequence proposals.
 * Falls back to deterministic algorithmic sampling when the API key is
 * missing, the request fails, or the completion is unparseable.
 */
export async function callMetaSpark(
  target: string,
  chargeTarget: number,
  options: {
    modality?: Modality;
    mechanism?: string;
    model?: string;
    host?: HostId;
  } = {}
): Promise<string[]> {
  const modality = options.modality ?? DEFAULT_MODALITY;
  const model = options.model ?? DEFAULT_MODEL;
  const host = options.host ?? DEFAULT_HOST;
  const spec = specForModality(modality);
  const { brief } = buildSteeringBrief(target, options.mechanism);
  const systemLine =
    host === "sboulardii"
      ? `You design therapeutic gut-delivered ${spec.noun} secretion payloads for Saccharomyces boulardii (MFalpha1 pre-pro leader) under strict bioprocess constraints.`
      : `You design therapeutic gut-delivered ${spec.noun} secretion payloads ${secretionFraming(host)} under strict bioprocess constraints.`;
  const candidates = await requestSparkCandidates(
    [
      {
        role: "system",
        content: systemLine,
      },
      {
        role: "user",
        content: buildKnottinPrompt(
          target,
          chargeTarget,
          brief,
          modality,
          model,
          host
        ),
      },
    ],
    META_SPARK_PROPOSE_MAX_TOKENS,
    META_SPARK_TIMEOUT_MS,
    META_SPARK_BASE_TEMPERATURE,
    extractionForModality(modality),
    model
  );
  if (candidates.length === 0) {
    return sampleFallbackCandidates(target, chargeTarget, 5, modality);
  }
  return candidates;
}

function findMotif(
  sequence: string,
  pattern: RegExp
): { index: number; match: string } | null {
  const found = pattern.exec(sequence);
  if (found === null || found.index === undefined) return null;
  return { index: found.index, match: found[0] ?? "" };
}

/**
 * Renders the symbolic compiler diagnostic for a failed candidate,
 * detailing exact grammar and audit faults with motif positions and the
 * machine-readable failure modes that drive the automatic retry.
 */
export function buildCompilerDiagnostic(
  candidate: string,
  grammar: KnottinGrammarParse,
  audit: SymbolicAuditResult,
  chargeTarget: number
): string {
  const faults: string[] = [];
  for (const error of grammar.syntaxErrors) {
    faults.push(`Syntax Violation: ${error}`);
  }
  if (audit.formal_charge !== chargeTarget) {
    const sign = audit.formal_charge >= 0 ? "+" : "";
    faults.push(
      `Formal charge ${sign}${audit.formal_charge} deviates from target +${chargeTarget}`
    );
  }
  const kex2 = findMotif(candidate, /(KR|RR|KK|RK|PR)/);
  if (kex2 !== null) {
    faults.push(
      `Kex2 cleavage liability at index ${kex2.index} ('${kex2.match}')`
    );
  }
  const chymo = findMotif(candidate, /[FYW][^P][KR]/);
  if (chymo !== null) {
    faults.push(
      `Exposed chymotrypsin site at index ${chymo.index} ('${chymo.match}')`
    );
  }
  for (const violation of audit.violations) {
    if (
      violation.startsWith("formal_charge:") ||
      violation.startsWith("formal_charge_window:") ||
      violation.startsWith("kex2_site:") ||
      violation.startsWith("chymotrypsin_exposed:")
    ) {
      continue;
    }
    faults.push(`Audit Violation: ${violation}`);
  }
  if (faults.length === 0) {
    return `Sequence ${candidate}: clean, satisfies grammar and audit.`;
  }
  const modes = [
    ...grammarFailureModes(grammar),
    ...auditFailureModes(audit),
  ];
  return `Sequence ${candidate}: ${faults.length} fault(s) [${modes.join(", ")}]. ${faults.join("; ")}.`;
}

/** Thrown when refinement turns are exhausted; carries the trace. */
export class NeurosymbolicVerificationError extends Error {
  readonly refinementHistory: RefinementTurn[];

  constructor(message: string, refinementHistory: RefinementTurn[]) {
    super(message);
    this.name = "NeurosymbolicVerificationError";
    this.refinementHistory = refinementHistory;
  }
}

interface Verification {
  grammar: KnottinGrammarParse;
  audit: SymbolicAuditResult;
  diagnostic: string;
  failureModes: string[];
  pass: boolean;
}

function verifyCandidate(
  candidate: string,
  chargeTarget: number,
  modality: Modality,
  targetClass: TargetClass
): Verification {
  const grammar = parseModalityGrammar(candidate, modality);
  const baseAudit = auditPeptideCandidate(candidate, chargeTarget, modality);
  const assessment = assessCandidate(
    candidate,
    modality,
    chargeTarget,
    targetClass
  );
  const audit: SymbolicAuditResult = {
    ...baseAudit,
    therapeutic_index: assessment.therapeutic_index,
    safety_index: assessment.safety_index,
  };
  return {
    grammar,
    audit,
    diagnostic: buildCompilerDiagnostic(candidate, grammar, audit, chargeTarget),
    failureModes: [
      ...grammarFailureModes(grammar),
      ...auditFailureModes(audit),
    ],
    pass: grammar.valid && audit.passed,
  };
}

/** Total upstream API time budget per generation, reserving room for synthesis and handoff inside maxDuration. */
export const META_SPARK_API_BUDGET_MS = 50000;
/** Minimum remaining budget to start a specificity review. */
export const SPECIFICITY_MIN_BUDGET_MS = 20000;
/** Cap on blinded specificity reviews per generation. */
export const MAX_SPECIFICITY_CHECKS = 4;

/** Pipeline stages emitted as live telemetry during generation. */
export type PipelineStage =
  | "research"
  | "propose"
  | "verify"
  | "repair"
  | "synthesize"
  | "containment"
  | "handoff";

export interface PipelineEvent {
  stage: PipelineStage;
  turn: number;
  message: string;
  source?: RefinementTurn["source"];
  candidate?: string;
  grammarValid?: boolean;
  auditPassed?: boolean;
  issues?: number;
  diagnostic?: string;
  temperature?: number;
}

/**
 * Best-of-pool ranking score (lower wins): GRAVY centrality within the
 * allowed window, then cleavage susceptibility, then the therapeutic
 * and safety indices (higher wins, hence subtracted). Stable sort keeps
 * pool order as the final tiebreak.
 */
function auditScore(audit: SymbolicAuditResult, modality: Modality): number {
  const therapeutic = audit.therapeutic_index ?? 50;
  const safety = audit.safety_index ?? 50;
  const spec = specForModality(modality);
  const center = (spec.gravyMin + spec.gravyMax) / 2;
  return (
    Math.abs(audit.gravy_score - center) * 10 +
    audit.cleavage_susceptibility_index -
    (therapeutic + safety) / 100
  );
}

interface SyncVerdict {
  index: number;
  candidate: string;
  grammar: KnottinGrammarParse;
  audit: SymbolicAuditResult;
  diagnostic: string;
  failureModes: string[];
  issues: number;
  pass: boolean;
}

/**
 * Evaluates one candidate pool, recording provenance in pool order, and
 * returns the best accepted candidate — or null when the pool holds none.
 * Model-proposed pools pass through the blinded specificity gate (top
 * ranked candidates first); synthesis pools accept on audit alone.
 */
async function evaluatePool(
  pool: string[],
  chargeTarget: number,
  modality: Modality,
  targetClass: TargetClass,
  turn: number,
  source: RefinementTurn["source"],
  terminal: boolean,
  refinementHistory: RefinementTurn[],
  onEvent?: (event: PipelineEvent) => void,
  checkSpecificityGated?: (candidate: string) => Promise<SpecificityReport>,
  gateSpecificity?: boolean,
  temperature?: number
): Promise<{ candidate: string; audit: SymbolicAuditResult } | null> {
  const sync: SyncVerdict[] = pool.map((candidate, index) => {
    const verification = verifyCandidate(
      candidate,
      chargeTarget,
      modality,
      targetClass
    );
    return {
      index,
      candidate,
      grammar: verification.grammar,
      audit: verification.audit,
      diagnostic: verification.diagnostic,
      failureModes: verification.failureModes,
      issues:
        verification.grammar.syntaxErrors.length +
        verification.audit.violations.length,
      pass: verification.pass,
    };
  });
  for (const entry of sync) {
    onEvent?.({
      stage: "verify",
      turn,
      source,
      candidate: entry.candidate,
      grammarValid: entry.grammar.valid,
      auditPassed: entry.audit.passed,
      issues: entry.issues,
      message: entry.pass
        ? "Grammar and audit clean"
        : `${entry.issues} fault(s) found`,
    });
  }

  const ranked = sync
    .filter((entry) => entry.pass)
    .sort((a, b) => auditScore(a.audit, modality) - auditScore(b.audit, modality));

  const specByIndex = new Map<number, SpecificityReport>();
  let winner: SyncVerdict | null = null;
  if (checkSpecificityGated !== undefined && gateSpecificity === true) {
    for (const entry of ranked.slice(0, 2)) {
      onEvent?.({
        stage: "verify",
        turn,
        source,
        candidate: entry.candidate,
        message: "Requesting blinded specificity review…",
      });
      const report = await checkSpecificityGated(entry.candidate);
      specByIndex.set(entry.index, report);
      onEvent?.({
        stage: "verify",
        turn,
        source,
        candidate: entry.candidate,
        message: report.pass
          ? `Specificity ✓ — ${report.predicted_targets[0] ?? "confirmed"}`
          : `Specificity ✗ — ${report.reason}`,
      });
      if (report.pass) {
        winner = entry;
        break;
      }
    }
  } else if (ranked.length > 0) {
    winner = ranked[0] ?? null;
  }

  for (const entry of sync) {
    const spec = specByIndex.get(entry.index);
    const specFailed = spec !== undefined && !spec.pass;
    const isWinner = winner !== null && entry.index === winner.index;
    refinementHistory.push({
      turn,
      candidate: entry.candidate,
      grammar_valid: entry.grammar.valid,
      syntax_errors: entry.grammar.syntaxErrors,
      audit_passed: entry.audit.passed,
      violations: entry.audit.violations,
      compiler_diagnostic:
        entry.diagnostic +
        (specFailed && spec !== undefined
          ? ` Specificity review failed: ${summarizeSpecificity(spec)}.`
          : ""),
      disposition: isWinner
        ? "accepted"
        : specFailed
          ? "repaired"
          : entry.pass
            ? "superseded"
            : terminal
              ? "exhausted"
              : "repaired",
      source,
      specificity: spec,
      failure_modes: entry.failureModes,
      temperature,
    });
  }

  if (winner !== null) {
    onEvent?.({
      stage: "verify",
      turn,
      source,
      candidate: winner.candidate,
      grammarValid: true,
      auditPassed: true,
      issues: 0,
      message: "Accepted as cycle winner",
    });
    return { candidate: winner.candidate, audit: winner.audit };
  }
  return null;
}

export interface GenerationOptions {
  modality?: Modality;
  mechanism?: string;
  model?: string;
  /** Chassis the design is framed for (secretion route in prompts). */
  host?: HostId;
  /**
   * Literature research stage. Disabled by default so the library keeps
   * its existing contract; API routes enable it explicitly. Any research
   * fault falls back to the static steering brief.
   */
  research?: {
    enabled?: boolean;
    budgetMs?: number;
  };
}

export interface VerifiedPeptide {
  candidate: string;
  audit: SymbolicAuditResult;
  refinementHistory: RefinementTurn[];
  agentTools: AgentToolResult[];
  targetClass: TargetClass;
  research: ResearchProvenance;
}

/**
 * Neurosymbolic closed-loop reflection engine. Proposes candidates with
 * Meta Spark 1.3 under a system-authored steering brief, intercepts them
 * with the grammar parser and symbolic auditor, and feeds compiler
 * diagnostics plus recurring-fault steering back for deterministic repair
 * instead of discarding failures. Every automatic retry re-prompts with
 * a penalized temperature. Repairs are never cut short for fallback;
 * only when turns or the API time budget are exhausted does the
 * grammar-constrained deterministic synthesizer serve as the final
 * backstop, with source-labeled provenance either way. An optional
 * event callback receives live pipeline telemetry for streaming UIs.
 * When `options.research.enabled` is set, a literature research stage
 * first converges PubMed and Europe PMC evidence into a brief that
 * sharpens the steering prompt; research faults fall back to the
 * static brief without touching generation or the compiler.
 */
export async function generateVerifiedPeptide(
  target: string,
  chargeTarget: number,
  maxRefinementTurns = 3,
  onEvent?: (event: PipelineEvent) => void,
  options: GenerationOptions = {}
): Promise<VerifiedPeptide> {
  const refinementHistory: RefinementTurn[] = [];
  const apiKey = process.env.META_API_KEY;
  const apiAvailable = apiKey !== undefined && apiKey.length > 0;
  const modality = options.modality ?? DEFAULT_MODALITY;
  const model = options.model ?? DEFAULT_MODEL;
  const host = options.host ?? DEFAULT_HOST;
  const modelLabel = shortLabelForModel(model);
  const spec = specForModality(modality);
  const { targetClass, brief: staticBrief } = buildSteeringBrief(
    target,
    options.mechanism
  );
  const extraction = extractionForModality(modality);

  /**
   * Literature research stage. Runs on its own wall-clock budget before
   * the generation budget clock starts, so research can only sharpen
   * the prompt — never steal time from propose/repair. Any fault keeps
   * the static brief: generation and the compiler finish exactly as
   * before.
   */
  const researchEnabled = options.research?.enabled === true;
  let research: ResearchProvenance;
  if (!researchEnabled) {
    research = {
      status: "disabled",
      latencyMs: 0,
      evidenceCount: 0,
      cached: false,
      sources: [],
    };
  } else if (!apiAvailable) {
    research = {
      status: "skipped",
      reason: "Meta API key not configured",
      latencyMs: 0,
      evidenceCount: 0,
      cached: false,
      sources: [],
    };
  } else {
    research = await runResearchBrief(target, options.mechanism, {
      budgetMs: options.research?.budgetMs ?? RESEARCH_DEFAULT_BUDGET_MS,
      model,
      onEvent,
    });
  }
  const steeringBrief = withResearchBrief(staticBrief, research.brief ?? null);

  const acceptWithTools = async (accepted: {
    candidate: string;
    audit: SymbolicAuditResult;
  }): Promise<VerifiedPeptide> => {
    const agentTools = await runAgentTools({
      candidate: accepted.candidate,
      target,
      modality,
      charge_target: chargeTarget,
    });
    return { ...accepted, refinementHistory, agentTools, targetClass, research };
  };

  const synthesize = async (
    turn: number,
    reason: string
  ): Promise<VerifiedPeptide> => {
    onEvent?.({
      stage: "synthesize",
      turn,
      source: "deterministic-synthesis",
      message: reason,
    });
    const pool = sampleFallbackCandidates(target, chargeTarget, 5, modality);
    const accepted = await evaluatePool(
      pool,
      chargeTarget,
      modality,
      targetClass,
      turn,
      "deterministic-synthesis",
      true,
      refinementHistory,
      onEvent
    );
    if (accepted !== null) {
      return acceptWithTools(accepted);
    }
    throw new NeurosymbolicVerificationError(
      `No verifiable candidate for target '${target}' from proposal, repair, or deterministic synthesis.`,
      refinementHistory
    );
  };

  if (!apiAvailable) {
    return synthesize(
      0,
      "No API key configured — synthesizing from the deterministic grammar sampler"
    );
  }

  const startedAt = Date.now();
  let specificityChecks = 0;

  /**
   * Budgeted blinded specificity review. Skips honestly (unchecked report)
   * when the check allowance or API budget is spent.
   */
  const checkBudgeted = async (
    candidate: string
  ): Promise<SpecificityReport> => {
    const remaining = META_SPARK_API_BUDGET_MS - (Date.now() - startedAt);
    specificityChecks += 1;
    if (specificityChecks > MAX_SPECIFICITY_CHECKS) {
      return uncheckedSpecificity(target, "Specificity check budget spent");
    }
    if (remaining < SPECIFICITY_MIN_BUDGET_MS) {
      return uncheckedSpecificity(target, "API budget reserved for generation");
    }
    return checkSpecificity(
      candidate,
      target,
      chargeTarget,
      Math.min(META_SPARK_TIMEOUT_MS, remaining),
      modality,
      model
    );
  };

  /**
   * One budgeted upstream request: capped by the remaining API budget,
   * or null when too little budget remains to start another request.
   */
  const requestBudgeted = async (
    messages: MetaSparkMessage[],
    maxTokens: number,
    temperature: number
  ): Promise<string[] | null> => {
    const remaining = META_SPARK_API_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < META_SPARK_MIN_REQUEST_BUDGET_MS) return null;
    return requestSparkCandidates(
      messages,
      maxTokens,
      Math.min(META_SPARK_TIMEOUT_MS, remaining),
      temperature,
      extraction,
      model
    );
  };

  /**
   * One upstream request with telemetry: announces the dispatch, then
   * reports how many candidates came back.
   */
  const fetchPool = async (
    messages: MetaSparkMessage[],
    maxTokens: number,
    turn: number,
    stage: "propose" | "repair",
    requestMessage: string,
    temperature: number,
    extra?: Partial<PipelineEvent>
  ): Promise<string[]> => {
    onEvent?.({ stage, turn, message: requestMessage, temperature, ...extra });
    const pool = (await requestBudgeted(messages, maxTokens, temperature)) ?? [];
    onEvent?.({
      stage,
      turn,
      message:
        pool.length > 0
          ? `Received ${pool.length} candidate(s)`
          : "Upstream returned no parseable candidates",
      temperature,
      ...extra,
    });
    return pool;
  };

  const proposeMessages = (): MetaSparkMessage[] => [
    {
      role: "system",
      content: `You are ${modelLabel}, a semantic evolutionary orator for therapeutic micro-proteins.`,
    },
    {
      role: "user",
      content: buildSemanticProposePrompt(
        target,
        chargeTarget,
        steeringBrief,
        modality,
        model,
        host
      ),
    },
  ];
  const proposalNoun =
    modality === "knottin-6c" ? "knottin" : spec.noun;

  let pool = await fetchPool(
    proposeMessages(),
    META_SPARK_PROPOSE_MAX_TOKENS,
    0,
    "propose",
    `Requesting ${proposalNoun} proposals from ${modelLabel}…`,
    repairTemperatureForCycle(0)
  );
  let cycle = 0;

  for (;;) {
    const accepted = await evaluatePool(
      pool,
      chargeTarget,
      modality,
      targetClass,
      cycle,
      "meta-spark-1.3",
      cycle >= maxRefinementTurns,
      refinementHistory,
      onEvent,
      checkBudgeted,
      true,
      repairTemperatureForCycle(cycle)
    );
    if (accepted !== null) {
      return acceptWithTools(accepted);
    }

    const turnsExhausted = cycle >= maxRefinementTurns;
    const budgetExhausted =
      Date.now() - startedAt >= META_SPARK_API_BUDGET_MS;
    if (turnsExhausted || budgetExhausted) {
      return synthesize(
        cycle,
        "Turns and API budget exhausted — deterministic synthesis backstop engaged"
      );
    }

    const failures = refinementHistory.filter(
      (entry) =>
        entry.disposition !== "accepted" &&
        entry.disposition !== "superseded"
    );
    const retryTemperature = repairTemperatureForCycle(cycle + 1);
    if (failures.length === 0) {
      pool = await fetchPool(
        proposeMessages(),
        META_SPARK_PROPOSE_MAX_TOKENS,
        cycle + 1,
        "propose",
        `Re-requesting ${proposalNoun} proposals from ${modelLabel} (temperature penalized to ${retryTemperature.toFixed(2)})…`,
        retryTemperature
      );
    } else {
      const failureWeight = (entry: RefinementTurn): number =>
        entry.syntax_errors.length +
        entry.violations.length +
        (entry.specificity !== undefined && !entry.specificity.pass ? 3 : 0);
      let best = failures[0];
      for (const entry of failures) {
        const bestIssues = best === undefined ? 0 : failureWeight(best);
        if (failureWeight(entry) < bestIssues) best = entry;
      }
      const failedCandidate = best?.candidate ?? "";
      const failedGrammar = parseModalityGrammar(failedCandidate, modality);
      const failedIssues =
        (best?.syntax_errors.length ?? 0) + (best?.violations.length ?? 0);
      const repairSteering =
        buildRepairSteering(refinementHistory) ?? steeringBrief;
      const repairNoun =
        modality === "knottin-6c" ? "knottin" : spec.noun;
      pool = await fetchPool(
        [
          {
            role: "system",
            content: `You are ${modelLabel} performing deterministic compiler-guided repair of a ${repairNoun} secretion payload.`,
          },
          {
            role: "user",
            content: buildRepairPrompt(
              failedCandidate,
              best?.compiler_diagnostic ?? "",
              chargeTarget,
              failedGrammar.loops["L3"],
              repairSteering,
              modality,
              model
            ),
          },
        ],
        META_SPARK_REPAIR_MAX_TOKENS,
        cycle + 1,
        "repair",
        `Repairing best candidate (${failedIssues} fault(s), temperature penalized to ${retryTemperature.toFixed(2)})…`,
        retryTemperature,
        {
          candidate: failedCandidate,
          diagnostic: best?.compiler_diagnostic ?? "",
          issues: failedIssues,
        }
      );
    }
    cycle += 1;
  }
}

/** Deterministic PRNG (mulberry32) for reproducible fallback sampling. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Neutral filler alphabet: no C (framework only), no charged residues. */
const NEUTRAL_FILLER = "AFGHILNPQSTVWY";

/** Hydrophobic-biased filler for helical-face positions. */
const HELICAL_FACE_FILLER = "AILMFV";

/** Polar-biased filler for the solvent-exposed helical face. */
const HELICAL_POLAR_FILLER = "GHNQST";

const BASIC_RESIDUES = new Set(["K", "R"]);

/** Face-biased sampling directive for amphipathic helices. */
export interface HelicalFaceBias {
  face: Set<number>;
  momentMin: number;
}

/**
 * Helical-wheel face: positions whose 100-degree wheel angle points at
 * the hydrophobic side (cosine above 0.25). The sampler fills these
 * hydrophobically and the rest polar, seeding amphipathicity that the
 * moment-repair pass below then polishes.
 */
export function helicalFacePositions(total: number): Set<number> {
  const face = new Set<number>();
  const step = (100 * Math.PI) / 180;
  for (let i = 0; i < total; i += 1) {
    if (Math.cos(i * step) > 0.25) face.add(i);
  }
  return face;
}
const AROMATIC_CHYMO = new Set(["F", "Y", "W"]);

function fitsNeighbors(seq: string[], index: number, aa: string): boolean {
  const prev = index > 0 ? (seq[index - 1] ?? "") : "";
  const prevprev = index > 1 ? (seq[index - 2] ?? "") : "";
  const next = index + 1 < seq.length ? (seq[index + 1] ?? "") : "";
  const nextnext = index + 2 < seq.length ? (seq[index + 2] ?? "") : "";
  // No dibasic Kex2/trypsin pairs.
  if (BASIC_RESIDUES.has(prev) && BASIC_RESIDUES.has(aa)) return false;
  if (BASIC_RESIDUES.has(aa) && BASIC_RESIDUES.has(next)) return false;
  // No PR Kex2 liability.
  if (prev === "P" && aa === "R") return false;
  if (aa === "P" && next === "R") return false;
  // No N-X-[ST] sequon completed as third or first residue.
  if (prevprev === "N" && prev !== "" && prev !== "P" && (aa === "S" || aa === "T")) {
    return false;
  }
  if (aa === "N" && next !== "" && next !== "P" && (nextnext === "S" || nextnext === "T")) {
    return false;
  }
  // No exposed chymotrypsin site completed in any of the three roles.
  if (AROMATIC_CHYMO.has(aa) && next !== "" && next !== "P" && BASIC_RESIDUES.has(nextnext)) {
    return false;
  }
  if (AROMATIC_CHYMO.has(prev) && aa !== "P" && BASIC_RESIDUES.has(next)) {
    return false;
  }
  if (AROMATIC_CHYMO.has(prevprev) && prev !== "" && prev !== "P" && BASIC_RESIDUES.has(aa)) {
    return false;
  }
  return true;
}

function pickFiller(
  rand: () => number,
  prev: string,
  prevprev: string,
  alphabet: string = NEUTRAL_FILLER
): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const aa = alphabet[Math.floor(rand() * alphabet.length)] ?? "A";
    if (prevprev === "N" && prev !== "P" && (aa === "S" || aa === "T")) continue;
    return aa;
  }
  return "A";
}

/** Start index of the first 4+ hydrophobic run, or null. */
function findHydrophobicRun(seq: string[], minLength: number): number | null {
  let run = 0;
  for (let i = 0; i < seq.length; i += 1) {
    if (HYDROPHOBIC_RUN_SET.has(seq[i] ?? "")) {
      run += 1;
      if (run >= minLength) return i - minLength + 1;
    } else {
      run = 0;
    }
  }
  return null;
}

/** Start index of the first N-X-[ST] sequon, or null. */
function findSequon(seq: string[]): number | null {
  const joined = seq.join("");
  const match = /N[^P][ST]/.exec(joined);
  return match === null ? null : match.index;
}

/** Start index of the first exposed chymotrypsin site, or null. */
function findExposedChymotrypsin(seq: string[]): number | null {
  const joined = seq.join("");
  const match = /[FYW][^P][KR]/.exec(joined);
  return match === null ? null : match.index;
}

/** Start index of the first PR Kex2 liability, or null. */
function findPrLiability(seq: string[]): number | null {
  const joined = seq.join("");
  const match = /PR/.exec(joined);
  return match === null ? null : match.index;
}

interface LoopPlan {
  lengths: [number, number, number, number, number];
  total: number;
}

function sampleLoopPlan(rand: () => number): LoopPlan | null {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const lengths: [number, number, number, number, number] = [
      randInt(rand, 3, 7),
      randInt(rand, 3, 6),
      randInt(rand, 1, 4),
      randInt(rand, 2, 6),
      randInt(rand, 4, 10),
    ];
    const total = 6 + lengths[0] + lengths[1] + lengths[2] + lengths[3] + lengths[4];
    if (total >= 28 && total <= 36) return { lengths, total };
  }
  return null;
}

function sampleTopologySequence(
  rand: () => number,
  chargeTarget: number
): string | null {
  const plan = sampleLoopPlan(rand);
  if (plan === null) return null;

  // Framework cysteine positions for C-X(a)-C-X(b)-C-X(c)-C-X(d)-C-X(e)-C.
  const [a, b, c, d] = plan.lengths;
  const cysPositions: number[] = [];
  let pos = 0;
  cysPositions.push(pos);
  pos += 1 + (a ?? 0);
  cysPositions.push(pos);
  pos += 1 + (b ?? 0);
  cysPositions.push(pos);
  pos += 1 + (c ?? 0);
  cysPositions.push(pos);
  pos += 1 + (d ?? 0);
  cysPositions.push(pos);
  cysPositions.push(plan.total - 1);
  return fillSequence(rand, plan.total, new Set(cysPositions), chargeTarget);
}

/**
 * Samples framework cysteine positions for a non-knottin modality:
 * a random total inside the length window with the required cysteine
 * count placed at least minCysSpacing apart.
 */
function sampleDisulfidePositions(
  rand: () => number,
  spec: { minLength: number; maxLength: number; cysteines: number | null; minCysSpacing: number }
): { total: number; cys: Set<number> } | null {
  const count = spec.cysteines ?? 0;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const total = randInt(rand, spec.minLength, spec.maxLength);
    if (count === 0) return { total, cys: new Set() };
    const slots: number[] = [];
    for (let i = 0; i < total; i += 1) slots.push(i);
    for (let i = slots.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = slots[i] ?? 0;
      slots[i] = slots[j] ?? 0;
      slots[j] = tmp;
    }
    const chosen: number[] = [];
    for (const slot of slots) {
      if (chosen.length >= count) break;
      if (
        chosen.every((other) => Math.abs(other - slot) - 1 >= spec.minCysSpacing)
      ) {
        chosen.push(slot);
      }
    }
    if (chosen.length === count) return { total, cys: new Set(chosen) };
  }
  return null;
}

/**
 * Shared sequence fill: places chargeTarget non-adjacent K/R residues,
 * fills the rest with neutral residues, then repairs every motif
 * liability (sequons, PR, chymotrypsin, hotspots, runs, N-terminus).
 * Cysteine and positive slots are never rewritten by repairs. With a
 * helical face bias, positives prefer the polar face, fillers split by
 * face, and a final moment-repair pass polishes amphipathicity.
 */
function fillSequence(
  rand: () => number,
  total: number,
  cys: Set<number>,
  chargeTarget: number,
  faceBias?: HelicalFaceBias
): string | null {
  // Choose chargeTarget positive (K/R) positions, never adjacent to
  // each other (no dibasic Kex2 pairs).
  const slots: number[] = [];
  for (let i = 0; i < total; i += 1) {
    if (!cys.has(i)) slots.push(i);
  }
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = slots[i] ?? 0;
    slots[i] = slots[j] ?? 0;
    slots[j] = tmp;
  }
  if (faceBias !== undefined) {
    // Cationics belong on the polar face; face slots are last resort.
    slots.sort((a, b) => {
      const fa = faceBias.face.has(a) ? 1 : 0;
      const fb = faceBias.face.has(b) ? 1 : 0;
      return fa - fb;
    });
  }
  const positives = new Set<number>();
  for (const slot of slots) {
    if (positives.size >= chargeTarget) break;
    if (positives.has(slot - 1) || positives.has(slot + 1)) continue;
    positives.add(slot);
  }
  if (positives.size < chargeTarget) return null;

  const out: string[] = [];
  for (let i = 0; i < total; i += 1) {
    if (cys.has(i)) {
      out.push("C");
      continue;
    }
    if (positives.has(i)) {
      // K after proline avoids the PR Kex2 liability.
      out.push(out[i - 1] === "P" || rand() < 0.5 ? "K" : "R");
      continue;
    }
    const alphabet =
      faceBias === undefined
        ? NEUTRAL_FILLER
        : faceBias.face.has(i)
          ? HELICAL_FACE_FILLER
          : HELICAL_POLAR_FILLER;
    out.push(pickFiller(rand, out[i - 1] ?? "", out[i - 2] ?? "", alphabet));
  }

  // Break N-X-[ST] sequons (middle -> P when filler, else third -> polar).
  for (let repair = 0; repair < 20; repair += 1) {
    const start = findSequon(out);
    if (start === null) break;
    const middle = start + 1;
    const third = start + 2;
    const middleIsFiller = !cys.has(middle) && !positives.has(middle);
    const thirdIsFiller = !cys.has(third) && !positives.has(third);
    if (middleIsFiller && fitsNeighbors(out, middle, "P")) {
      out[middle] = "P";
      continue;
    }
    let swapped = false;
    if (thirdIsFiller) {
      for (const aa of ["N", "Q", "H", "A"]) {
        if (fitsNeighbors(out, third, aa)) {
          out[third] = aa;
          swapped = true;
          break;
        }
      }
    }
    if (!swapped) return null;
  }

  // Break PR Kex2 liabilities (P is always a filler slot here).
  for (let repair = 0; repair < 20; repair += 1) {
    const start = findPrLiability(out);
    if (start === null) break;
    let swapped = false;
    for (const aa of ["G", "A", "S", "Q", "T"]) {
      if (fitsNeighbors(out, start, aa)) {
        out[start] = aa;
        swapped = true;
        break;
      }
    }
    if (!swapped) return null;
  }

  // Break exposed chymotrypsin sites: middle -> P when the basic is K,
  // otherwise the leading aromatic -> small polar (always a filler).
  for (let repair = 0; repair < 20; repair += 1) {
    const start = findExposedChymotrypsin(out);
    if (start === null) break;
    const middle = start + 1;
    const third = start + 2;
    const middleIsFiller = !cys.has(middle) && !positives.has(middle);
    if ((out[third] ?? "") === "K" && middleIsFiller && fitsNeighbors(out, middle, "P")) {
      out[middle] = "P";
      continue;
    }
    let swapped = false;
    for (const aa of ["S", "G", "A", "T", "Q"]) {
      if (fitsNeighbors(out, start, aa)) {
        out[start] = aa;
        swapped = true;
        break;
      }
    }
    if (!swapped) return null;
  }

  // Cap methionines (oxidation risk): extras become leucine, a
  // hydrophobic-neutral swap repaired runs revisit below if needed.
  for (let repair = 0; repair < 20; repair += 1) {
    const mets: number[] = [];
    for (let i = 0; i < out.length; i += 1) {
      if ((out[i] ?? "") === "M") mets.push(i);
    }
    if (mets.length <= MAX_METHIONINES) break;
    let swapped = false;
    for (const slot of mets.slice(MAX_METHIONINES)) {
      for (const aa of ["L", "A", "V"]) {
        if (fitsNeighbors(out, slot, aa)) {
          out[slot] = aa;
          swapped = true;
          break;
        }
      }
      if (swapped) break;
    }
    if (!swapped) return null;
  }

  // Break NG deamidation and DG isomerization hotspots by swapping the
  // glycine (always a neutral filler slot) to a small stable residue.
  for (let repair = 0; repair < 20; repair += 1) {
    const joined = out.join("");
    const ng = /NG/.exec(joined);
    const dg = /DG/.exec(joined);
    const hit = ng !== null ? ng : dg;
    if (hit === null || hit.index === undefined) break;
    const slot = hit.index + 1;
    let swapped = false;
    for (const aa of ["A", "S", "Q", "T"]) {
      if (fitsNeighbors(out, slot, aa)) {
        out[slot] = aa;
        swapped = true;
        break;
      }
    }
    if (!swapped) return null;
  }

  // Break DP acid-labile bonds by swapping the proline (always a neutral
  // filler slot) to a small stable residue.
  for (let repair = 0; repair < 20; repair += 1) {
    const hit = /DP/.exec(out.join(""));
    if (hit === null || hit.index === undefined) break;
    const slot = hit.index + 1;
    let swapped = false;
    for (const aa of ["A", "S", "G", "T"]) {
      if (fitsNeighbors(out, slot, aa)) {
        out[slot] = aa;
        swapped = true;
        break;
      }
    }
    if (!swapped) return null;
  }

  // Fix a blocked N-terminus (non-knottin position 0 is filler, never
  // framework): P/F/Y/W become small unhindered residues.
  if (BLOCKED_N_TERMINI.has(out[0] ?? "")) {
    let swapped = false;
    for (const aa of ["A", "S", "G"]) {
      if (fitsNeighbors(out, 0, aa)) {
        out[0] = aa;
        swapped = true;
        break;
      }
    }
    if (!swapped) return null;
  }

  // Break secretion-blocking hydrophobic runs via polar swaps. Run
  // positions are always neutral filler (K/R/C are outside the run set).
  for (let repair = 0; repair < 20; repair += 1) {
    const start = findHydrophobicRun(out, 4);
    if (start === null) break;
    const slot = start + 2;
    let swapped = false;
    for (const aa of ["S", "G", "T", "N", "Q", "H"]) {
      if (fitsNeighbors(out, slot, aa)) {
        out[slot] = aa;
        swapped = true;
        break;
      }
    }
    if (!swapped) return null;
  }

  // Amphipathicity polish (helical sampling only): hill-climb the
  // hydrophobic moment with guarded single swaps. Best effort — the
  // caller still filters by the real audit.
  if (faceBias !== undefined) {
    for (let repair = 0; repair < 60; repair += 1) {
      const current = computeHydrophobicMoment(out.join(""));
      if (current >= faceBias.momentMin) break;
      let improved = false;
      for (let i = 0; i < out.length && !improved; i += 1) {
        if (cys.has(i) || positives.has(i)) continue;
        const candidates = faceBias.face.has(i)
          ? ["I", "L", "F", "V", "M", "A"]
          : ["S", "T", "N", "Q", "H", "G"];
        for (const aa of candidates) {
          if (aa === out[i] || !fitsMomentSwap(out, i, aa)) continue;
          const incumbent = out[i] ?? "";
          out[i] = aa;
          if (computeHydrophobicMoment(out.join("")) > current) {
            improved = true;
            break;
          }
          out[i] = incumbent;
        }
      }
      if (!improved) break;
    }
  }

  return out.join("");
}

/**
 * Guards one moment-repair swap: motif neighbors plus the gates
 * fitsNeighbors doesn't cover (N-terminus, NG/DG hotspots — DP is
 * impossible since neither P nor D is ever offered — the methionine
 * cap, and the 4+ hydrophobic run cap).
 */
function fitsMomentSwap(seq: string[], index: number, aa: string): boolean {
  if (!fitsNeighbors(seq, index, aa)) return false;
  if (index === 0 && BLOCKED_N_TERMINI.has(aa)) return false;
  const prev = index > 0 ? (seq[index - 1] ?? "") : "";
  const next = index + 1 < seq.length ? (seq[index + 1] ?? "") : "";
  if (aa === "G" && (prev === "N" || prev === "D")) return false;
  if (aa === "N" && next === "G") return false;
  if (aa === "M") {
    let mets = 0;
    for (let k = 0; k < seq.length; k += 1) {
      if (k !== index && seq[k] === "M") mets += 1;
    }
    if (mets >= MAX_METHIONINES) return false;
  }
  if (HYDROPHOBIC_RUN_SET.has(aa)) {
    let run = 1;
    for (let k = index - 1; k >= 0; k -= 1) {
      if (!HYDROPHOBIC_RUN_SET.has(seq[k] ?? "")) break;
      run += 1;
    }
    for (let k = index + 1; k < seq.length; k += 1) {
      if (!HYDROPHOBIC_RUN_SET.has(seq[k] ?? "")) break;
      run += 1;
    }
    if (run > 3) return false;
  }
  return true;
}

/**
 * Deterministic algorithmic fallback: samples modality-topology sequences
 * and keeps only candidates that pass both the grammar parser and the
 * symbolic auditor.
 */
export function sampleFallbackCandidates(
  target: string,
  chargeTarget: number,
  count = 5,
  modality: Modality = "knottin-6c"
): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  const seedTag = modality === "knottin-6c" ? "knottin-v2" : `${modality}-v1`;
  const rand = mulberry32(hashSeed(`${target}|${chargeTarget}|${seedTag}`));
  const spec = specForModality(modality);

  for (let attempt = 0; attempt < 5000 && kept.length < count; attempt += 1) {
    let seq: string | null;
    if (modality === "knottin-6c" || modality === "cyclotide-6c") {
      // Cyclotides share the knottin loop envelopes, so the knottin
      // framework sampler seeds them too; the audit's C-terminal gate
      // and the 28-37 window still filter.
      seq = sampleTopologySequence(rand, chargeTarget);
    } else {
      const frame = sampleDisulfidePositions(rand, spec);
      if (frame === null) {
        seq = null;
      } else if (modality === "helical") {
        seq = fillSequence(rand, frame.total, frame.cys, chargeTarget, {
          face: helicalFacePositions(frame.total),
          momentMin: spec.momentMin ?? 1.2,
        });
      } else {
        seq = fillSequence(rand, frame.total, frame.cys, chargeTarget);
      }
    }
    if (seq === null || seen.has(seq)) continue;
    seen.add(seq);
    if (
      parseModalityGrammar(seq, modality).valid &&
      auditPeptideCandidate(seq, chargeTarget, modality).passed
    ) {
      kept.push(seq);
    }
  }
  return kept;
}
