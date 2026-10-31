import {
  MetaSparkResponseSchema,
  type MetaSparkRequest,
} from "../types/peptide";
import { auditPeptideCandidate } from "./symbolic-auditor";

export const META_SPARK_MODEL = "meta-spark-1.3-contributor";
export const META_SPARK_DEFAULT_URL =
  "https://api.meta.ai/v1/spark/chat/completions";
export const META_SPARK_TIMEOUT_MS = 45000;
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

const CANONICAL_AA_PATTERN = /^[ACDEFGHIKLMNPQRSTVWY]+$/;

/**
 * Extracts pure candidate sequences from a model completion via regex.
 * Handles bare sequences, numbered lists, and FASTA blocks.
 */
export function extractCandidateSequences(completion: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string): void => {
    const seq = raw.trim().toUpperCase();
    if (seq.length < 28 || seq.length > 36) return;
    if (!CANONICAL_AA_PATTERN.test(seq)) return;
    if (seen.has(seq)) return;
    seen.add(seq);
    found.push(seq);
  };

  // FASTA blocks: ">header\nSEQUENCE..."
  const fastaRe = />[^\n]*\n([A-Za-z\s]+)/g;
  let fastaMatch: RegExpExecArray | null;
  while ((fastaMatch = fastaRe.exec(completion)) !== null) {
    const body = (fastaMatch[1] ?? "").replace(/\s+/g, "");
    push(body);
  }

  // Bare sequences: contiguous 28-36 canonical-AA runs. Strip list
  // markers ("1.", "-", "*") so numbered outputs still parse.
  const sanitized = completion
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\d+[.)\-:]|[-*>])\s*/, ""))
    .join("\n");
  const bareRe = /\b[ACDEFGHIKLMNPQRSTVWYacdefghiklmnpqrstvwy]{28,36}\b/g;
  let bareMatch: RegExpExecArray | null;
  while ((bareMatch = bareRe.exec(sanitized)) !== null) {
    push(bareMatch[0] ?? "");
  }

  return found.slice(0, 8);
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

function pickFiller(rand: () => number, prev: string): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const aa = NEUTRAL_FILLER[Math.floor(rand() * NEUTRAL_FILLER.length)] ?? "A";
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
  const cys = new Set<number>();
  let pos = 0;
  cys.add(pos);
  pos += 1 + (a ?? 0);
  cys.add(pos);
  pos += 1 + (b ?? 0);
  cys.add(pos);
  pos += 1 + (c ?? 0);
  cys.add(pos);
  pos += 1 + (d ?? 0);
  cys.add(pos);
  cys.add(plan.total - 1);

  // Choose chargeTarget positive (K/R) positions, never adjacent to each other.
  const slots: number[] = [];
  for (let i = 0; i < plan.total; i += 1) {
    if (!cys.has(i)) slots.push(i);
  }
  // Shuffle slots deterministically.
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
    out.push(pickFiller(rand, out[i - 1] ?? ""));
  }
  return out.join("");
}

/**
 * Deterministic algorithmic fallback: samples knottin-topology sequences
 * and keeps only candidates that pass the symbolic auditor.
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
    if (auditPeptideCandidate(seq, chargeTarget).passed) {
      kept.push(seq);
    }
  }
  return kept;
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
  const apiKey = process.env.META_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return sampleFallbackCandidates(target, chargeTarget);
  }

  const payload: MetaSparkRequest = {
    model: META_SPARK_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You design therapeutic gut-delivered knottin peptides under strict biophysical constraints.",
      },
      { role: "user", content: buildKnottinPrompt(target, chargeTarget) },
    ],
    temperature: 0.7,
    max_tokens: 1024,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_SPARK_TIMEOUT_MS);
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
      return sampleFallbackCandidates(target, chargeTarget);
    }

    const parsed = MetaSparkResponseSchema.safeParse(
      (await response.json()) as unknown
    );
    if (!parsed.success) {
      return sampleFallbackCandidates(target, chargeTarget);
    }

    const data = parsed.data;
    const content =
      data.choices
        ?.map((choice) => choice.message?.content ?? choice.text ?? "")
        .filter((text) => text.length > 0)
        .join("\n") ?? "";
    const completion = `${content}\n${data.output_text ?? ""}`.trim();
    if (completion.length === 0) {
      return sampleFallbackCandidates(target, chargeTarget);
    }

    const candidates = extractCandidateSequences(completion);
    if (candidates.length === 0) {
      return sampleFallbackCandidates(target, chargeTarget);
    }
    return candidates;
  } catch {
    return sampleFallbackCandidates(target, chargeTarget);
  } finally {
    clearTimeout(timeout);
  }
}
