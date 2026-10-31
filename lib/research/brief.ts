import type { PipelineEvent } from "../meta-spark";
import { flagsHighRisk } from "../specificity";
import { flagsDistantSite } from "../gut-targets";
import { requestSparkCompletion } from "../spark-client";
import { DEFAULT_MODEL } from "../spark-config";
import {
  RETRIEVAL_MAX_RESULTS,
  RETRIEVAL_TIMEOUT_MS,
  searchEuropePmc,
  searchPubMed,
  type EvidenceItem,
  type EvidenceResult,
  type FetchImpl,
} from "./evidence";

/**
 * Literature research agents. All agents converge on the single objective
 * carried by the disease/condition `target` parameter: their only output
 * is a compact brief that sharpens the peptide-generation prompt. The
 * orchestrator is fail-open — any retrieval or synthesis fault returns a
 * null brief with provenance, and generation proceeds on the static
 * steering brief exactly as before.
 */

export interface ResearchEntry {
  name: string;
  rationale: string;
}

export interface ResearchCitation {
  ref: string;
  note: string;
}

export interface ResearchBrief {
  targets: ResearchEntry[];
  mechanisms: ResearchEntry[];
  avoid: ResearchEntry[];
  citations: ResearchCitation[];
  evidenceCount: number;
}

export type ResearchStatus = "ok" | "fallback" | "disabled" | "skipped";

export interface ResearchSourceReport {
  name: string;
  count: number;
  latencyMs: number;
  error?: string;
}

export interface ResearchProvenance {
  status: ResearchStatus;
  reason?: string;
  latencyMs: number;
  evidenceCount: number;
  cached: boolean;
  sources: ResearchSourceReport[];
  brief?: ResearchBrief;
  /** Full citation records behind the brief (present on fresh ok runs). */
  evidence?: EvidenceItem[];
}

export interface ResearchRunOptions {
  budgetMs?: number;
  model?: string;
  fetchImpl?: FetchImpl;
  /** Injected synthesis call for tests; defaults to the Spark API. */
  synthesizeImpl?: (prompt: string, timeoutMs: number) => Promise<string | null>;
  onEvent?: (event: PipelineEvent) => void;
}

/** Hard wall-clock cap for the whole research stage. */
export const RESEARCH_DEFAULT_BUDGET_MS = 15000;
/** Per-source retrieval cap; the two sources run in parallel. */
export const RESEARCH_SOURCE_TIMEOUT_MS = RETRIEVAL_TIMEOUT_MS;
export const RESEARCH_MAX_TARGETS = 3;
export const RESEARCH_MAX_MECHANISMS = 2;
export const RESEARCH_MAX_AVOID = 4;
export const RESEARCH_MAX_CITATIONS = 6;
export const RESEARCH_SYNTHESIS_MAX_TOKENS = 1024;
export const RESEARCH_SYNTHESIS_TEMPERATURE = 0.2;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<
  string,
  { brief: ResearchBrief; evidence: EvidenceItem[]; expiresAt: number }
>();

export function researchCacheKey(target: string, mechanism?: string): string {
  return `${target.trim().toLowerCase()}\n${(mechanism ?? "").trim().toLowerCase()}`;
}

/** Test seam: clears the in-memory brief cache. */
export function clearResearchCache(): void {
  cache.clear();
}

function readCache(
  key: string
): { brief: ResearchBrief; evidence: EvidenceItem[] } | null {
  const hit = cache.get(key);
  if (hit === undefined) return null;
  if (Date.now() >= hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { brief: hit.brief, evidence: hit.evidence };
}

function writeCache(
  key: string,
  brief: ResearchBrief,
  evidence: EvidenceItem[]
): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { brief, evidence, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Agent 1 — target miner. Queries PubMed for molecular targets tied to
 * the disease. Never throws.
 */
async function mineTargets(
  target: string,
  fetchImpl: FetchImpl | undefined,
  timeoutMs: number
): Promise<EvidenceResult> {
  try {
    return await searchPubMed(`${target} molecular target`, {
      timeoutMs,
      maxResults: RETRIEVAL_MAX_RESULTS,
      fetchImpl,
    });
  } catch (error) {
    return {
      items: [],
      latencyMs: 0,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}

/**
 * Agent 2 — mechanism ranker. Queries Europe PMC for peptide-therapeutic
 * mechanisms tied to the disease. Never throws.
 */
async function rankMechanisms(
  target: string,
  fetchImpl: FetchImpl | undefined,
  timeoutMs: number
): Promise<EvidenceResult> {
  try {
    return await searchEuropePmc(`${target} peptide therapeutic mechanism`, {
      timeoutMs,
      maxResults: RETRIEVAL_MAX_RESULTS,
      fetchImpl,
    });
  } catch (error) {
    return {
      items: [],
      latencyMs: 0,
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}

/**
 * Agent 3 — safety screener. Rule-based and instant: scans the retrieved
 * evidence for high-risk pharmacology and distant-organ activity using
 * the same matchers as the specificity gate. Candidates feed the
 * synthesis prompt as avoid-list seeds.
 */
export function screenEvidenceSafety(evidence: EvidenceItem[]): string[] {
  const texts = evidence.map((item) => `${item.title}\n${item.snippet}`);
  const flagged = new Set<string>([
    ...flagsHighRisk(texts),
    ...flagsDistantSite(texts),
  ]);
  return [...flagged].slice(0, RESEARCH_MAX_AVOID);
}

/**
 * Convergence prompt. Keeps the same upstream content-policy discipline
 * as the specificity review: asks for avoid-list entries without naming
 * human-harm example terms.
 */
export function buildResearchSynthesisPrompt(
  target: string,
  mechanism: string | undefined,
  evidence: EvidenceItem[],
  safetySeeds: string[]
): string {
  const lines = [
    "You are a biomedical literature analyst grounding peptide drug design.",
    `Disease objective: ${target}.`,
  ];
  if (mechanism !== undefined && mechanism.trim().length > 0) {
    lines.push(`Caller mechanism note: ${mechanism.trim().slice(0, 300)}.`);
  }
  lines.push(
    "From the evidence below, converge on the most plausible gut-reachable molecular targets and peptide-tractable mechanisms for this disease, plus targets and mechanisms to avoid on safety grounds.",
    "Rules: every TARGET and MECHANISM must be supported by the evidence; prefer gut-lumen or mucosal action; peptide-tractable means a short surface-binding or barrier-supporting interaction, never a large catalytic fold.",
    "Evidence:"
  );
  for (const item of evidence.slice(0, 10)) {
    lines.push(
      `- [${item.source}:${item.id}] ${item.title} — ${item.snippet}`.slice(0, 500)
    );
  }
  if (safetySeeds.length > 0) {
    lines.push(
      `Reviewer-flagged passages to consider for the avoid list: ${safetySeeds.join(" | ").slice(0, 600)}`
    );
  }
  lines.push(
    `Emit at most ${RESEARCH_MAX_TARGETS} TARGET lines, ${RESEARCH_MAX_MECHANISMS} MECHANISM lines, ${RESEARCH_MAX_AVOID} AVOID lines, and ${RESEARCH_MAX_CITATIONS} CITE lines.`,
    "Format each on its own line exactly as:",
    "TARGET: <name> — <one-line rationale>",
    "MECHANISM: <name> — <one-line rationale>",
    "AVOID: <name> — <reason>",
    "CITE: <source:id> — <short supporting quote>",
    "Respond with ONLY these lines, no commentary."
  );
  return lines.join("\n");
}

function splitEntry(text: string): ResearchEntry {
  // ASCII separators require surrounding whitespace so intra-word
  // hyphens (receptor-binding) and compact refs (pubmed:111) survive.
  const separator = /\s+[—-]\s+|\s+--\s+|\s+:\s+|—/;
  const at = text.search(separator);
  if (at < 0) {
    return { name: text.trim().slice(0, 160), rationale: "" };
  }
  const width = text.match(separator)?.[0].length ?? 1;
  return {
    name: text.slice(0, at).trim().slice(0, 160),
    rationale: text.slice(at + width).trim().slice(0, 300),
  };
}

/**
 * Parses a synthesis completion into a brief. Returns null when nothing
 * usable converged — the caller then falls back to static steering.
 * Enforcement requires evidence, so unparseable output skips, never
 * fabricates.
 */
export function parseResearchSynthesis(
  completion: string,
  evidenceCount: number
): ResearchBrief | null {
  const targets: ResearchEntry[] = [];
  const mechanisms: ResearchEntry[] = [];
  const avoid: ResearchEntry[] = [];
  const citations: ResearchCitation[] = [];
  const lineRe = /^\s*(?:\d+[.)]\s*)?(TARGET|MECHANISM|AVOID|CITE):\s*(.+)$/gim;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(completion)) !== null) {
    const kind = (match[1] ?? "").toUpperCase();
    const body = (match[2] ?? "").trim();
    if (body.length === 0) continue;
    if (kind === "TARGET" && targets.length < RESEARCH_MAX_TARGETS) {
      const entry = splitEntry(body);
      if (entry.name.length > 0) targets.push(entry);
    } else if (
      kind === "MECHANISM" &&
      mechanisms.length < RESEARCH_MAX_MECHANISMS
    ) {
      const entry = splitEntry(body);
      if (entry.name.length > 0) mechanisms.push(entry);
    } else if (kind === "AVOID" && avoid.length < RESEARCH_MAX_AVOID) {
      const entry = splitEntry(body);
      if (entry.name.length > 0) avoid.push(entry);
    } else if (kind === "CITE" && citations.length < RESEARCH_MAX_CITATIONS) {
      const entry = splitEntry(body);
      if (entry.name.length > 0) {
        citations.push({ ref: entry.name, note: entry.rationale });
      }
    }
  }
  if (targets.length === 0 && mechanisms.length === 0) return null;
  return { targets, mechanisms, avoid, citations, evidenceCount };
}

async function defaultSynthesize(
  prompt: string,
  timeoutMs: number,
  model: string
): Promise<string | null> {
  const completion = await requestSparkCompletion(
    [
      {
        role: "system",
        content:
          "You are a biomedical literature analyst grounding peptide drug design, with strict output formatting.",
      },
      { role: "user", content: prompt },
    ],
    {
      maxTokens: RESEARCH_SYNTHESIS_MAX_TOKENS,
      timeoutMs,
      temperature: RESEARCH_SYNTHESIS_TEMPERATURE,
      model,
    }
  );
  return completion?.text ?? null;
}

/**
 * Runs the research stage: parallel retrieval, rule-based safety screen,
 * one synthesis call to converge. Never throws and never exceeds
 * `budgetMs` by more than a synthesis round-trip — every fault returns
 * `{ status: "fallback" }` with the reason recorded for troubleshooting.
 */
export async function runResearchBrief(
  target: string,
  mechanism: string | undefined,
  options: ResearchRunOptions = {}
): Promise<ResearchProvenance> {
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? RESEARCH_DEFAULT_BUDGET_MS;
  const model = options.model ?? DEFAULT_MODEL;
  const onEvent = options.onEvent;
  let settled = false;
  const emit = (message: string): void => {
    if (settled) return;
    onEvent?.({ stage: "research", turn: 0, message });
  };
  const fallback = (reason: string): ResearchProvenance => {
    settled = true;
    return {
      status: "fallback",
      reason,
      latencyMs: Date.now() - startedAt,
      evidenceCount: 0,
      cached: false,
      sources: [],
    };
  };

  try {
    if (budgetMs <= 0) return fallback("Research budget disabled");
    const key = researchCacheKey(target, mechanism);
    const cached = readCache(key);
    if (cached !== null) {
      emit("Literature brief reused from cache");
      settled = true;
      return {
        status: "ok",
        latencyMs: Date.now() - startedAt,
        evidenceCount: cached.brief.evidenceCount,
        cached: true,
        sources: [],
        brief: cached.brief,
        evidence: cached.evidence,
      };
    }

    emit(`Researching "${target.trim().slice(0, 80)}" in the literature…`);
    const remaining = (): number => budgetMs - (Date.now() - startedAt);
    const sourceTimeout = Math.min(
      RESEARCH_SOURCE_TIMEOUT_MS,
      Math.max(1000, remaining())
    );

    const [pubmed, europepmc] = await Promise.all([
      mineTargets(target, options.fetchImpl, sourceTimeout),
      rankMechanisms(target, options.fetchImpl, sourceTimeout),
    ]);
    const sources: ResearchSourceReport[] = [
      {
        name: "pubmed",
        count: pubmed.items.length,
        latencyMs: pubmed.latencyMs,
        ...(pubmed.error !== undefined ? { error: pubmed.error } : {}),
      },
      {
        name: "europepmc",
        count: europepmc.items.length,
        latencyMs: europepmc.latencyMs,
        ...(europepmc.error !== undefined ? { error: europepmc.error } : {}),
      },
    ];
    const evidence = [...pubmed.items, ...europepmc.items];
    emit(
      `Literature retrieval: PubMed ${pubmed.items.length} paper(s)` +
        (pubmed.error !== undefined ? ` (${pubmed.error})` : "") +
        `, Europe PMC ${europepmc.items.length} paper(s)` +
        (europepmc.error !== undefined ? ` (${europepmc.error})` : "")
    );
    if (evidence.length === 0) {
      settled = true;
      return {
        status: "fallback",
        reason: "No literature evidence retrieved",
        latencyMs: Date.now() - startedAt,
        evidenceCount: 0,
        cached: false,
        sources,
      };
    }

    const safetySeeds = screenEvidenceSafety(evidence);
    const synthesisBudget = remaining();
    if (synthesisBudget < 3000) {
      settled = true;
      return {
        status: "fallback",
        reason: "Research budget exhausted before synthesis",
        latencyMs: Date.now() - startedAt,
        evidenceCount: evidence.length,
        cached: false,
        sources,
      };
    }
    const prompt = buildResearchSynthesisPrompt(
      target,
      mechanism,
      evidence,
      safetySeeds
    );
    const synthesize = options.synthesizeImpl;
    const text =
      synthesize !== undefined
        ? await synthesize(prompt, synthesisBudget)
        : await defaultSynthesize(prompt, synthesisBudget, model);
    if (text === null || text.trim().length === 0) {
      settled = true;
      return {
        status: "fallback",
        reason: "Synthesis returned no completion",
        latencyMs: Date.now() - startedAt,
        evidenceCount: evidence.length,
        cached: false,
        sources,
      };
    }
    const brief = parseResearchSynthesis(text, evidence.length);
    if (brief === null) {
      settled = true;
      return {
        status: "fallback",
        reason: "Synthesis converged on no usable target",
        latencyMs: Date.now() - startedAt,
        evidenceCount: evidence.length,
        cached: false,
        sources,
      };
    }
    writeCache(key, brief, evidence);
    emit(
      `Literature brief converged: ${brief.targets.length} target(s), ` +
        `${brief.mechanisms.length} mechanism(s), ${brief.avoid.length} avoid(s)`
    );
    settled = true;
    return {
      status: "ok",
      latencyMs: Date.now() - startedAt,
      evidenceCount: evidence.length,
      cached: false,
      sources,
      brief,
      evidence,
    };
  } catch (error) {
    return fallback(error instanceof Error ? error.message : "unknown error");
  }
}
