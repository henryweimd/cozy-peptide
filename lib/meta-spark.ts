import {
  MetaSparkResponseSchema,
  type KnottinGrammarParse,
  type MetaSparkMessage,
  type MetaSparkRequest,
  type RefinementTurn,
  type SpecificityReport,
  type SymbolicAuditResult,
} from "../types/peptide";
import {
  HYDROPHOBIC_RUN_SET,
  auditFailureModes,
  auditPeptideCandidate,
  grammarFailureModes,
} from "./symbolic-auditor";
import {
  checkSpecificity,
  summarizeSpecificity,
  uncheckedSpecificity,
} from "./specificity";
import { parseKnottinGrammar } from "./protein-grammar";
import {
  META_SPARK_MODEL,
  META_SPARK_DEFAULT_URL,
  META_SPARK_TIMEOUT_MS,
  getMetaSparkApiUrl,
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
 * Structured prompt instructing Meta Spark 1.3 to propose 3-5 knottin
 * secretion payloads conforming to the canonical ICK cysteine topology
 * and the MFalpha1 bioprocess constraints.
 */
export function buildKnottinPrompt(
  target: string,
  chargeTarget: number
): string {
  return [
    "You are Meta Spark 1.3, a protein-design contributor for therapeutic gut-delivered knottins.",
    `Target: ${target}.`,
    "Propose 3-5 candidate knottin peptide sequences (single-letter amino acid code) optimized specifically as 6-cysteine knottin payloads (ICK topology C1-C4 / C2-C5 / C3-C6) for continuous secretion by eukaryotic probiotics (Saccharomyces boulardii via the MFalpha1 pre-pro leader).",
    "Every candidate MUST satisfy all of the following hard constraints:",
    `1. Knottin cysteine topology: ${KNOTTIN_TOPOLOGY} (exactly 6 cysteines, C1-C4 / C2-C5 / C3-C6); total length 28-36 amino acids.`,
    "2. Zero Kex2 internal cleavage: no KR, RR, PR, or KK motifs anywhere (they fragment during Golgi processing); also no RK dibasic.",
    "3. Zero N-linked glycosylation: no N[^P][ST] sequon (yeast hyper-mannosylation would occlude binding loops).",
    "4. Clean N-terminal processing: residue 1 (immediately downstream of the Kex2 cleavage boundary) must be small and unhindered (A, S, G, or C) — never P, F, Y, or W.",
    `5. Charge and hydropathy: net charge exactly +${chargeTarget} (inside the +1 to +4 window at pH 7.4 for gentle mucosal retention); Kyte-Doolittle GRAVY between -0.40 and +0.10; hydrophobic runs over [VILMFW] at most 3 consecutive residues.`,
    "6. No exposed chymotrypsin consensus sites ([FYW][^P][KR]).",
    "7. Gut-stable, non-toxic, non-antimicrobial design; no toxin or translocation-domain content.",
    "Style anchors from nature — learn their cysteine pacing, then invent novel loops (do not copy these sequences):",
    ...scaffoldLines(),
    "Output format: respond with ONLY the candidates, one per line, as bare uppercase sequences with no numbering, no headers, no FASTA headers, and no commentary.",
  ].join("\n");
}

/**
 * Turn-0 semantic prompt: frames generation as evolutionary adaptation of
 * knottin secretion payloads to a clinical gut target, demanding an
 * explicit <scratchpad> reasoning trace per candidate.
 */
export function buildSemanticProposePrompt(
  target: string,
  chargeTarget: number
): string {
  return [
    "You are Meta Spark 1.3, a semantic evolutionary orator for therapeutic micro-proteins.",
    `Clinical gut target: ${target}. Adapt knottin secretion payloads to this target as evolution would: propose sequence tokens grounded in semantic context, functional fitness, and mucosal resilience, optimized for continuous secretion by Saccharomyces boulardii via the MFalpha1 pre-pro leader.`,
    "Express exactly 3 candidate knottins in the loop grammar L0-C1-L1-C2-L2-C3-L3-C4-L4-C5-L5-C6-L6 with ICK pairing C1-C4, C2-C5, C3-C6.",
    "Hard syntactic and bioprocess constraints for every candidate:",
    `1. Canonical ICK loop envelopes: L1 3-7, L2 3-6, L3 1-4, L4 2-6, L5 4-10; total 28-36 aa; sequence starts and ends with cysteine.`,
    "2. Zero Kex2 internal cleavage: no KR, RR, PR, KK, or RK motifs.",
    "3. Zero N-linked glycosylation: no N[^P][ST] sequon (X != P).",
    "4. Clean N-terminal processing: residue 1 must be A, S, G, or C — never P, F, Y, or W.",
    `5. Net charge exactly +${chargeTarget} (inside the +1 to +4 window at pH 7.4); allocate charge preferentially to the L3 functional cassette and L5 presentation loop.`,
    "6. No exposed chymotrypsin sites [FYW][^P][KR]; hydrophobic runs over [VILMFW] at most 3 consecutive residues.",
    "7. GRAVY between -0.40 and +0.10; gut-stable and non-toxic.",
    "Style anchors from nature — learn their cysteine pacing, then invent novel loops (do not copy these sequences):",
    ...scaffoldLines(),
    "For each candidate, first write a <scratchpad> trace of exactly one sentence explaining why its loop composition satisfies the target receptor interface without triggering host mucosal clearance, then emit the candidate on its own line as: CANDIDATE <n>: <BARE UPPERCASE SEQUENCE>.",
  ].join("\n");
}

/**
 * Repair prompt: hands a failed candidate plus its symbolic compiler
 * diagnostic back to the model for token-level repair.
 */
export function buildRepairPrompt(
  failedSequence: string,
  compilerDiagnostic: string,
  chargeTarget: number,
  preservedCassette?: string
): string {
  const lines = [
    "You are Meta Spark 1.3 performing deterministic compiler-guided repair of a knottin secretion payload.",
    `Failed candidate: ${failedSequence}`,
    `Symbolic compiler diagnostic: ${compilerDiagnostic}`,
    "Repair the semantic tokens to eliminate every listed fault while satisfying the full knottin secretion contract:",
    "L0-C1-L1-C2-L2-C3-L3-C4-L4-C5-L5-C6-L6, ICK pairing C1-C4/C2-C5/C3-C6, L1 3-7, L2 3-6, L3 1-4, L4 2-6, L5 4-10, total 28-36 aa,",
    `zero Kex2 motifs (KR, RR, PR, KK, RK), zero N[^P][ST] sequons, residue 1 in {A,S,G,C}, net charge exactly +${chargeTarget} (window +1 to +4 at pH 7.4), no [FYW][^P][KR], hydrophobic runs over [VILMFW] of at most 3, GRAVY in [-0.40, +0.10].`,
  ];
  if (preservedCassette !== undefined && preservedCassette.length > 0) {
    lines.push(
      `Preserve the functional L3 epitope cassette '${preservedCassette}' unless it carries a fault.`
    );
  }
  lines.push(
    "Respond with ONLY 1-3 repaired candidates, one per line, as bare uppercase sequences with no commentary."
  );
  return lines.join("\n");
}

const CANONICAL_AA_PATTERN = /^[ACDEFGHIKLMNPQRSTVWY]+$/;

/**
 * Extracts pure candidate sequences from a model completion via regex,
 * preserving document order across FASTA blocks, CANDIDATE labels, and
 * bare sequences (including <scratchpad> interleavings).
 */
export function extractCandidateSequences(completion: string): string[] {
  const hits: Array<{ index: number; seq: string }> = [];

  const fastaRe = />[^\n]*\n([A-Za-z\s]+)/g;
  let fastaMatch: RegExpExecArray | null;
  while ((fastaMatch = fastaRe.exec(completion)) !== null) {
    const body = (fastaMatch[1] ?? "").replace(/\s+/g, "").toUpperCase();
    if (
      body.length >= 28 &&
      body.length <= 36 &&
      CANONICAL_AA_PATTERN.test(body)
    ) {
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
      if (
        seq.length >= 28 &&
        seq.length <= 36 &&
        CANONICAL_AA_PATTERN.test(seq)
      ) {
        hits.push({ index: lineStart + candidateMatch.index, seq });
      }
    }
    lineStart += line.length + 1;
  }

  const bareRe = /\b[ACDEFGHIKLMNPQRSTVWYacdefghiklmnpqrstvwy]{28,36}\b/g;
  let bareMatch: RegExpExecArray | null;
  while ((bareMatch = bareRe.exec(completion)) !== null) {
    const seq = (bareMatch[0] ?? "").toUpperCase();
    if (CANONICAL_AA_PATTERN.test(seq)) {
      hits.push({ index: bareMatch.index, seq });
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
export async function requestSparkCandidates(
  messages: MetaSparkMessage[],
  maxTokens = META_SPARK_PROPOSE_MAX_TOKENS,
  timeoutMs = META_SPARK_TIMEOUT_MS,
  temperature = META_SPARK_BASE_TEMPERATURE
): Promise<string[]> {
  const apiKey = process.env.META_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return [];

  const payload: MetaSparkRequest = {
    model: META_SPARK_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
    reasoning_effort: META_SPARK_REASONING_EFFORT,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(getMetaSparkApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`[meta-spark] upstream HTTP ${response.status}`);
      return [];
    }

    const parsed = MetaSparkResponseSchema.safeParse(
      (await response.json()) as unknown
    );
    if (!parsed.success) {
      console.warn("[meta-spark] unparseable response envelope");
      return [];
    }

    const data = parsed.data;
    const finish = data.choices?.[0]?.finish_reason ?? "unknown";
    const content =
      data.choices
        ?.map((choice) => choice.message?.content ?? choice.text ?? "")
        .filter((text) => text.length > 0)
        .join("\n") ?? "";
    const completion = `${content}\n${data.output_text ?? ""}`.trim();
    if (completion.length === 0) {
      console.warn(`[meta-spark] empty completion (finish=${finish})`);
      return [];
    }
    const candidates = extractCandidateSequences(completion);
    if (candidates.length === 0) {
      console.warn(
        `[meta-spark] zero candidates extracted from ${completion.length} chars (finish=${finish})`
      );
    }
    return candidates;
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    console.warn(`[meta-spark] request error: ${name}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Calls the Meta Spark 1.3 Contributor API for knottin sequence proposals.
 * Falls back to deterministic algorithmic sampling when the API key is
 * missing, the request fails, or the completion is unparseable.
 */
export async function callMetaSpark(
  target: string,
  chargeTarget: number
): Promise<string[]> {
  const candidates = await requestSparkCandidates([
    {
      role: "system",
      content:
        "You design therapeutic gut-delivered knottin secretion payloads for Saccharomyces boulardii (MFalpha1 pre-pro leader) under strict bioprocess constraints.",
    },
    { role: "user", content: buildKnottinPrompt(target, chargeTarget) },
  ]);
  if (candidates.length === 0) {
    return sampleFallbackCandidates(target, chargeTarget);
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
  chargeTarget: number
): Verification {
  const grammar = parseKnottinGrammar(candidate);
  const audit = auditPeptideCandidate(candidate, chargeTarget);
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
  | "propose"
  | "verify"
  | "repair"
  | "synthesize"
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
 * allowed window, then cleavage susceptibility. Stable sort keeps pool
 * order as the final tiebreak.
 */
function auditScore(audit: SymbolicAuditResult): number {
  return Math.abs(audit.gravy_score + 0.15) * 10 + audit.cleavage_susceptibility_index;
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
    const verification = verifyCandidate(candidate, chargeTarget);
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
    .sort((a, b) => auditScore(a.audit) - auditScore(b.audit));

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

/**
 * Neurosymbolic closed-loop reflection engine. Proposes candidates with
 * Meta Spark 1.3, intercepts them with the grammar parser and symbolic
 * auditor, and feeds compiler diagnostics back for deterministic repair
 * instead of discarding failures. Every automatic retry re-prompts with
 * a penalized temperature. Repairs are never cut short for fallback;
 * only when turns or the API time budget are exhausted does the
 * grammar-constrained deterministic synthesizer serve as the final
 * backstop, with source-labeled provenance either way. An optional
 * event callback receives live pipeline telemetry for streaming UIs.
 */
export async function generateVerifiedPeptide(
  target: string,
  chargeTarget: number,
  maxRefinementTurns = 3,
  onEvent?: (event: PipelineEvent) => void
): Promise<{
  candidate: string;
  audit: SymbolicAuditResult;
  refinementHistory: RefinementTurn[];
}> {
  const refinementHistory: RefinementTurn[] = [];
  const apiKey = process.env.META_API_KEY;
  const apiAvailable = apiKey !== undefined && apiKey.length > 0;

  const synthesize = async (
    turn: number,
    reason: string
  ): Promise<{
    candidate: string;
    audit: SymbolicAuditResult;
    refinementHistory: RefinementTurn[];
  }> => {
    onEvent?.({
      stage: "synthesize",
      turn,
      source: "deterministic-synthesis",
      message: reason,
    });
    const pool = sampleFallbackCandidates(target, chargeTarget, 5);
    const accepted = await evaluatePool(
      pool,
      chargeTarget,
      turn,
      "deterministic-synthesis",
      true,
      refinementHistory,
      onEvent
    );
    if (accepted !== null) {
      return { ...accepted, refinementHistory };
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
      Math.min(META_SPARK_TIMEOUT_MS, remaining)
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
      temperature
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
      content:
        "You are Meta Spark 1.3, a semantic evolutionary orator for therapeutic micro-proteins.",
    },
    {
      role: "user",
      content: buildSemanticProposePrompt(target, chargeTarget),
    },
  ];

  let pool = await fetchPool(
    proposeMessages(),
    META_SPARK_PROPOSE_MAX_TOKENS,
    0,
    "propose",
    "Requesting knottin proposals from Muse Spark 1.3…",
    repairTemperatureForCycle(0)
  );
  let cycle = 0;

  for (;;) {
    const accepted = await evaluatePool(
      pool,
      chargeTarget,
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
      return { ...accepted, refinementHistory };
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
        `Re-requesting knottin proposals from Muse Spark 1.3 (temperature penalized to ${retryTemperature.toFixed(2)})…`,
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
      const failedGrammar = parseKnottinGrammar(failedCandidate);
      const failedIssues =
        (best?.syntax_errors.length ?? 0) + (best?.violations.length ?? 0);
      pool = await fetchPool(
        [
          {
            role: "system",
            content:
              "You are Meta Spark 1.3 performing deterministic compiler-guided repair of a knottin secretion payload.",
          },
          {
            role: "user",
            content: buildRepairPrompt(
              failedCandidate,
              best?.compiler_diagnostic ?? "",
              chargeTarget,
              failedGrammar.loops["L3"]
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

const BASIC_RESIDUES = new Set(["K", "R"]);
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
  prevprev: string
): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const aa = NEUTRAL_FILLER[Math.floor(rand() * NEUTRAL_FILLER.length)] ?? "A";
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
  const cys = new Set(cysPositions);

  // Choose chargeTarget positive (K/R) positions, never adjacent to
  // each other (no dibasic Kex2 pairs).
  const slots: number[] = [];
  for (let i = 0; i < plan.total; i += 1) {
    if (!cys.has(i)) slots.push(i);
  }
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = slots[i] ?? 0;
    slots[i] = slots[j] ?? 0;
    slots[j] = tmp;
  }
  const positives = new Set<number>();
  for (const slot of slots) {
    if (positives.size >= chargeTarget) break;
    if (positives.has(slot - 1) || positives.has(slot + 1)) continue;
    positives.add(slot);
  }
  if (positives.size < chargeTarget) return null;

  const out: string[] = [];
  for (let i = 0; i < plan.total; i += 1) {
    if (cys.has(i)) {
      out.push("C");
      continue;
    }
    if (positives.has(i)) {
      // K after proline avoids the PR Kex2 liability.
      out.push(out[i - 1] === "P" || rand() < 0.5 ? "K" : "R");
      continue;
    }
    out.push(pickFiller(rand, out[i - 1] ?? "", out[i - 2] ?? ""));
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

  return out.join("");
}

/**
 * Deterministic algorithmic fallback: samples knottin-topology sequences
 * and keeps only candidates that pass both the grammar parser and the
 * symbolic auditor.
 */
export function sampleFallbackCandidates(
  target: string,
  chargeTarget: number,
  count = 5
): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  const rand = mulberry32(hashSeed(`${target}|${chargeTarget}|knottin-v2`));

  for (let attempt = 0; attempt < 5000 && kept.length < count; attempt += 1) {
    const seq = sampleTopologySequence(rand, chargeTarget);
    if (seq === null || seen.has(seq)) continue;
    seen.add(seq);
    if (
      parseKnottinGrammar(seq).valid &&
      auditPeptideCandidate(seq, chargeTarget).passed
    ) {
      kept.push(seq);
    }
  }
  return kept;
}
