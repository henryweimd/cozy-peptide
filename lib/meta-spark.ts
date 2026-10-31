import {
  MetaSparkResponseSchema,
  type KnottinGrammarParse,
  type MetaSparkMessage,
  type MetaSparkRequest,
  type RefinementTurn,
  type SymbolicAuditResult,
} from "../types/peptide";
import { auditPeptideCandidate } from "./symbolic-auditor";
import { L4_HELIX_FORMERS, parseKnottinGrammar } from "./protein-grammar";

export const META_SPARK_MODEL = "muse-spark-1.3-contributor";
export const META_SPARK_DEFAULT_URL = "https://api.meta.ai/v1/chat/completions";
export const META_SPARK_TIMEOUT_MS = 30000;
export const META_SPARK_REASONING_EFFORT = "minimal";
export const META_SPARK_PROPOSE_MAX_TOKENS = 4096;
export const META_SPARK_REPAIR_MAX_TOKENS = 2048;
/** Minimum remaining API budget (ms) required to start another request. */
export const META_SPARK_MIN_REQUEST_BUDGET_MS = 10000;
export const KNOTTIN_TOPOLOGY = "C-X(3,7)-C-X(4,6)-C-X(4,7)-C-X(1,3)-C-X(4,8)-C";

export function getMetaSparkApiUrl(): string {
  const override = process.env.META_SPARK_API_URL;
  if (override !== undefined && override.trim().length > 0) return override.trim();
  return META_SPARK_DEFAULT_URL;
}

/**
 * Structured prompt instructing Meta Spark 1.3 to propose 3-5 knottin
 * candidates conforming to the canonical knottin cysteine topology.
 */
export function buildKnottinPrompt(
  target: string,
  chargeTarget: number
): string {
  return [
    "You are Meta Spark 1.3, a protein-design contributor for therapeutic gut-delivered knottins.",
    `Target: ${target}.`,
    "Propose 3-5 candidate knottin peptide sequences (single-letter amino acid code) that could bind or modulate the target in the gut lumen.",
    "Every candidate MUST satisfy all of the following hard constraints:",
    `1. Knottin cysteine topology: ${KNOTTIN_TOPOLOGY} (exactly 6 cysteines, C1-C4 / C2-C5 / C3-C6).`,
    "2. Total length 28-36 amino acids.",
    `3. Formal charge (K+R-D-E) exactly +${chargeTarget} at neutral pH.`,
    "4. No dibasic [KR]{2} motif (trypsin site) and no [FYW]L motif (pepsin/chymotrypsin site).",
    "5. No N[GS] or D[GS] motifs and no methionine (chemical liabilities).",
    "6. Balanced hydropathy: GRAVY (Kyte-Doolittle mean) between -0.40 and +0.10.",
    "7. Gut-stable, non-toxic, non-antimicrobial design; no toxin or translocation-domain content.",
    "Output format: respond with ONLY the candidates, one per line, as bare uppercase sequences with no numbering, no headers, no FASTA headers, and no commentary.",
  ].join("\n");
}

/**
 * Turn-0 semantic prompt: frames generation as evolutionary adaptation of
 * knottin linguistic grammar to a clinical gut target, demanding an
 * explicit <scratchpad> reasoning trace per candidate.
 */
export function buildSemanticProposePrompt(
  target: string,
  chargeTarget: number
): string {
  return [
    "You are Meta Spark 1.3, a semantic evolutionary orator for therapeutic micro-proteins.",
    `Clinical gut target: ${target}. Adapt knottin linguistic grammar to this target as evolution would: propose sequence tokens grounded in semantic context, functional fitness, and mucosal resilience.`,
    "Express exactly 3 candidate knottins in the loop grammar L0-C1-L1-C2-L2-C3-L3-C4-L4-C5-L5-C6-L6 with ICK pairing C1-C4, C2-C5, C3-C6.",
    "Hard syntactic constraints for every candidate:",
    `1. Loop lengths: L1 3-7, L2 4-6, L3 4-7, L4 1-3, L5 4-8; total 28-36 aa; sequence starts and ends with cysteine.`,
    "2. L1 must contain a turn-inducer (P or G) for C1-C2 loop closure.",
    "3. L2 bulky aromatics (W, F) at most 40% of the loop.",
    "4. L4 must contain no helix-forming residues (A, E, K, L, M, Q).",
    `5. Formal charge (K+R-D-E) exactly +${chargeTarget}; allocate charge preferentially to the L3 functional cassette and L5 presentation loop.`,
    "6. No [KR]{2}, no [FYW]L, no N[GS], no D[GS], no methionine.",
    "7. GRAVY between -0.40 and +0.10; gut-stable and non-toxic.",
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
    "You are Meta Spark 1.3 performing deterministic compiler-guided repair of a knottin candidate.",
    `Failed candidate: ${failedSequence}`,
    `Symbolic compiler diagnostic: ${compilerDiagnostic}`,
    "Repair the semantic tokens to eliminate every listed fault while satisfying the full knottin grammar:",
    "L0-C1-L1-C2-L2-C3-L3-C4-L4-C5-L5-C6-L6, ICK pairing C1-C4/C2-C5/C3-C6, L1 3-7 with P/G, L2 4-6 with W/F <= 40%, L3 4-7, L4 1-3 without helix formers (A,E,K,L,M,Q), L5 4-8, total 28-36 aa,",
    `formal charge exactly +${chargeTarget}, no [KR]{2}, no [FYW]L, no N[GS], no D[GS], no M, GRAVY in [-0.40, +0.10].`,
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
  timeoutMs = META_SPARK_TIMEOUT_MS
): Promise<string[]> {
  const apiKey = process.env.META_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return [];

  const payload: MetaSparkRequest = {
    model: META_SPARK_MODEL,
    messages,
    temperature: 0.7,
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
        "You design therapeutic gut-delivered knottin peptides under strict biophysical constraints.",
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
 * detailing exact grammar and audit faults with motif positions.
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
  const dibasic = findMotif(candidate, /[KR]{2}/);
  if (dibasic !== null) {
    faults.push(
      `Trypsin cleavage liability at index ${dibasic.index} ('${dibasic.match}')`
    );
  }
  const aromaticLeu = findMotif(candidate, /[FYW]L/);
  if (aromaticLeu !== null) {
    faults.push(
      `Pepsin/chymotrypsin liability at index ${aromaticLeu.index} ('${aromaticLeu.match}')`
    );
  }
  for (const violation of audit.violations) {
    if (
      violation.startsWith("formal_charge:") ||
      violation.startsWith("protease_")
    ) {
      continue;
    }
    faults.push(`Audit Violation: ${violation}`);
  }
  if (faults.length === 0) {
    return `Sequence ${candidate}: clean, satisfies grammar and audit.`;
  }
  return `Sequence ${candidate}: ${faults.length} fault(s). ${faults.join("; ")}.`;
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
    pass: grammar.valid && audit.passed,
  };
}

/** Total upstream API time budget per generation, reserving room for synthesis and handoff inside maxDuration. */
export const META_SPARK_API_BUDGET_MS = 50000;

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
}

/**
 * Evaluates one candidate pool, recording provenance; returns the first
 * accepted candidate, or null when the pool holds none.
 */
function evaluatePool(
  pool: string[],
  chargeTarget: number,
  turn: number,
  source: RefinementTurn["source"],
  terminal: boolean,
  refinementHistory: RefinementTurn[],
  onEvent?: (event: PipelineEvent) => void
): { candidate: string; audit: SymbolicAuditResult } | null {
  for (const candidate of pool) {
    const verification = verifyCandidate(candidate, chargeTarget);
    const issues =
      verification.grammar.syntaxErrors.length +
      verification.audit.violations.length;
    refinementHistory.push({
      turn,
      candidate,
      grammar_valid: verification.grammar.valid,
      syntax_errors: verification.grammar.syntaxErrors,
      audit_passed: verification.audit.passed,
      violations: verification.audit.violations,
      compiler_diagnostic: verification.diagnostic,
      disposition: verification.pass
        ? "accepted"
        : terminal
          ? "exhausted"
          : "repaired",
      source,
    });
    onEvent?.({
      stage: "verify",
      turn,
      source,
      candidate,
      grammarValid: verification.grammar.valid,
      auditPassed: verification.audit.passed,
      issues,
      message: verification.pass
        ? "Accepted — grammar and audit clean"
        : `${issues} fault(s) found`,
    });
    if (verification.pass) {
      return { candidate, audit: verification.audit };
    }
  }
  return null;
}

/**
 * Neurosymbolic closed-loop reflection engine. Proposes candidates with
 * Meta Spark 1.3, intercepts them with the grammar parser and symbolic
 * auditor, and feeds compiler diagnostics back for deterministic repair
 * instead of discarding failures. Repairs are never cut short for
 * fallback; only when turns or the API time budget are exhausted does
 * the grammar-constrained deterministic synthesizer serve as the final
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

  const synthesize = (
    turn: number,
    reason: string
  ): {
    candidate: string;
    audit: SymbolicAuditResult;
    refinementHistory: RefinementTurn[];
  } => {
    onEvent?.({
      stage: "synthesize",
      turn,
      source: "deterministic-synthesis",
      message: reason,
    });
    const pool = sampleFallbackCandidates(target, chargeTarget, 5);
    const accepted = evaluatePool(
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

  /**
   * One budgeted upstream request: capped by the remaining API budget,
   * or null when too little budget remains to start another request.
   */
  const requestBudgeted = async (
    messages: MetaSparkMessage[],
    maxTokens: number
  ): Promise<string[] | null> => {
    const remaining = META_SPARK_API_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < META_SPARK_MIN_REQUEST_BUDGET_MS) return null;
    return requestSparkCandidates(
      messages,
      maxTokens,
      Math.min(META_SPARK_TIMEOUT_MS, remaining)
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
    extra?: Partial<PipelineEvent>
  ): Promise<string[]> => {
    onEvent?.({ stage, turn, message: requestMessage, ...extra });
    const pool = (await requestBudgeted(messages, maxTokens)) ?? [];
    onEvent?.({
      stage,
      turn,
      message:
        pool.length > 0
          ? `Received ${pool.length} candidate(s)`
          : "Upstream returned no parseable candidates",
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
    "Requesting knottin proposals from Muse Spark 1.3…"
  );
  let cycle = 0;

  for (;;) {
    const accepted = evaluatePool(
      pool,
      chargeTarget,
      cycle,
      "meta-spark-1.3",
      cycle >= maxRefinementTurns,
      refinementHistory,
      onEvent
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
      (entry) => entry.disposition !== "accepted"
    );
    if (failures.length === 0) {
      pool = await fetchPool(
        proposeMessages(),
        META_SPARK_PROPOSE_MAX_TOKENS,
        cycle + 1,
        "propose",
        "Re-requesting knottin proposals from Muse Spark 1.3…"
      );
    } else {
      let best = failures[0];
      for (const entry of failures) {
        const bestIssues =
          (best?.syntax_errors.length ?? 0) + (best?.violations.length ?? 0);
        const entryIssues = entry.syntax_errors.length + entry.violations.length;
        if (entryIssues < bestIssues) best = entry;
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
              "You are Meta Spark 1.3 performing deterministic compiler-guided repair of a knottin candidate.",
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
        `Repairing best candidate (${failedIssues} fault(s))…`,
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

/** Neutral filler alphabet: no C (framework only), no M, no charged residues. */
const NEUTRAL_FILLER = "AFGHILNPQSTVWY";

/** L4 filler alphabet: additionally excludes helix-forming residues. */
const L4_FILLER = NEUTRAL_FILLER.split("")
  .filter((aa) => !L4_HELIX_FORMERS.has(aa))
  .join("");

/** Non-aromatic neutrals for L2 aromatic-cap repair. */
const L2_REPAIR_ALPHABET = "AGHILNPQSTV";

function fitsNeighbors(seq: string[], index: number, aa: string): boolean {
  const prev = index > 0 ? (seq[index - 1] ?? "") : "";
  const next = index + 1 < seq.length ? (seq[index + 1] ?? "") : "";
  if ((prev === "F" || prev === "Y" || prev === "W") && aa === "L") return false;
  if (prev === "N" && (aa === "G" || aa === "S")) return false;
  if ((prev === "K" || prev === "R") && (aa === "K" || aa === "R")) return false;
  if ((aa === "F" || aa === "Y" || aa === "W") && next === "L") return false;
  if (aa === "N" && (next === "G" || next === "S")) return false;
  if ((aa === "K" || aa === "R") && (next === "K" || next === "R")) return false;
  return true;
}

function pickFiller(
  rand: () => number,
  prev: string,
  loopId: number
): string {
  const alphabet = loopId === 4 ? L4_FILLER : NEUTRAL_FILLER;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const aa = alphabet[Math.floor(rand() * alphabet.length)] ?? "A";
    if ((prev === "F" || prev === "Y" || prev === "W") && aa === "L") continue;
    if (prev === "N" && (aa === "G" || aa === "S")) continue;
    return aa;
  }
  return "A";
}

interface LoopPlan {
  lengths: [number, number, number, number, number];
  total: number;
}

function sampleLoopPlan(rand: () => number): LoopPlan | null {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const lengths: [number, number, number, number, number] = [
      randInt(rand, 3, 7),
      randInt(rand, 4, 6),
      randInt(rand, 4, 7),
      randInt(rand, 1, 3),
      randInt(rand, 4, 8),
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

  // Loop id (1-5) for each inter-cysteine position.
  const loopOf = (index: number): number => {
    let count = 0;
    for (const cp of cysPositions) {
      if (cp < index) count += 1;
    }
    return count;
  };

  // Choose chargeTarget positive (K/R) positions outside L4, never
  // adjacent to each other (L4 forbids the helix former K).
  const slots: number[] = [];
  for (let i = 0; i < plan.total; i += 1) {
    if (!cys.has(i) && loopOf(i) !== 4) slots.push(i);
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
      out.push(rand() < 0.5 ? "K" : "R");
      continue;
    }
    out.push(pickFiller(rand, out[i - 1] ?? "", loopOf(i)));
  }

  // Enforce the L1 turn-inducer rule on a filler slot.
  const l1Slots: number[] = [];
  for (let i = 0; i < plan.total; i += 1) {
    if (!cys.has(i) && !positives.has(i) && loopOf(i) === 1) l1Slots.push(i);
  }
  const l1HasTurn = l1Slots.some(
    (i) => out[i] === "P" || out[i] === "G"
  );
  if (!l1HasTurn && l1Slots.length > 0) {
    const slot = l1Slots[Math.floor(rand() * l1Slots.length)] ?? l1Slots[0] ?? 0;
    out[slot] = (out[slot - 1] ?? "") === "N" ? "P" : rand() < 0.5 ? "P" : "G";
  }

  // Enforce the L2 bulky-aromatic cap via neighbor-safe swaps.
  for (let repair = 0; repair < 20; repair += 1) {
    const l2Slots: number[] = [];
    for (let i = 0; i < plan.total; i += 1) {
      if (!cys.has(i) && loopOf(i) === 2) l2Slots.push(i);
    }
    const aromaticSlots = l2Slots.filter(
      (i) => out[i] === "W" || out[i] === "F"
    );
    if (aromaticSlots.length / l2Slots.length <= 0.4) break;
    const slot =
      aromaticSlots[Math.floor(rand() * aromaticSlots.length)] ??
      aromaticSlots[0] ??
      0;
    let swapped = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const aa =
        L2_REPAIR_ALPHABET[
          Math.floor(rand() * L2_REPAIR_ALPHABET.length)
        ] ?? "A";
      if (fitsNeighbors(out, slot, aa)) {
        out[slot] = aa;
        swapped = true;
        break;
      }
    }
    if (!swapped) break;
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
  const rand = mulberry32(hashSeed(`${target}|${chargeTarget}|knottin-v1`));

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
