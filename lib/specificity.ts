import {
  MetaSparkResponseSchema,
  type MetaSparkRequest,
  type SpecificityReport,
} from "../types/peptide";
import {
  META_SPARK_MODEL,
  META_SPARK_TIMEOUT_MS,
  getMetaSparkApiUrl,
} from "./spark-config";

/**
 * Review token budget. 512 is too small: the model's reasoning trace
 * consumes the budget and the API returns content:null with
 * finish_reason=length. 2048 leaves room for reasoning plus the review.
 */
export const SPECIFICITY_MAX_TOKENS = 2048;
export const SPECIFICITY_TEMPERATURE = 0.3;

/** Abbreviations expanded before target-name matching. */
const TARGET_ALIASES: Record<string, string> = {
  etec: "enterotoxigenic",
  ehec: "enterohemorrhagic",
  ibd: "inflammatory",
  ibs: "irritable",
  tcda: "difficile",
  tcdb: "difficile",
  hpylori: "pylori",
};

/** Generic words that must not single-handedly confirm a match. */
const MATCH_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "in",
  "of",
  "and",
  "for",
  "to",
  "with",
  "gut",
  "intestinal",
  "bowel",
  "colon",
  "colonic",
  "stomach",
  "gastric",
  "disease",
  "disorder",
  "syndrome",
  "syndromes",
  "target",
  "targets",
  "human",
  "chronic",
  "acute",
  "colonization",
  "infection",
  "infections",
]);

/** Off-target classes that hard-fail a candidate. */
const HIGH_RISK_PATTERNS: RegExp[] = [
  /herg/i,
  /sodium channel/i,
  /potassium channel/i,
  /calcium channel/i,
  /\bnav\s?1/i,
  /\bkv\s?1/i,
  /\bcav\d/i,
  /hemol/i,
  /cytotox/i,
  /coagulat/i,
  /platelet/i,
  /complement[\s-]?mediated/i,
  /anaphyl/i,
];

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => TARGET_ALIASES[token] ?? token)
    .filter((token) => token.length >= 4 && !MATCH_STOPWORDS.has(token));
}

/**
 * Fuzzy intended-target match: the blinded top prediction must share at
 * least one distinctive token with the intended target.
 */
export function matchIntendedTarget(
  predicted: string,
  intended: string
): boolean {
  const predictedTokens = new Set(contentTokens(predicted));
  if (predictedTokens.size === 0) return false;
  return contentTokens(intended).some((token) => predictedTokens.has(token));
}

export function flagsHighRisk(offTargets: string[]): string[] {
  return offTargets.filter((entry) =>
    HIGH_RISK_PATTERNS.some((pattern) => pattern.test(entry))
  );
}

/**
 * Blinded review prompt. The intended target is deliberately withheld so
 * the model judges the sequence on its own merits. Keep line 2 free of
 * human-harm example terms: the upstream API rejects such prompts with
 * 400 content_policy_violation (verified live per-term), so the review
 * asks for off-target activity without naming examples.
 */
export function buildSpecificityPrompt(
  candidate: string,
  chargeTarget: number
): string {
  return [
    "You are a peptide pharmacologist reviewing a candidate knottin.",
    `Candidate: ${candidate} (${candidate.length} amino acids, 6-cysteine ICK knot, formal charge +${chargeTarget}).`,
    "1. List its 3 most likely molecular targets in the human gut, most likely first.",
    "Format each on its own line exactly as: TARGET: <name> — <one-line rationale>",
    "2. List any concerning off-target activity.",
    "Format each on its own line exactly as: OFFTARGET: <name> — <reason>",
    "If none, emit exactly: OFFTARGET: none",
    "Respond with ONLY these lines, no commentary.",
  ].join("\n");
}

export function uncheckedSpecificity(
  intendedTarget: string,
  reason: string
): SpecificityReport {
  return {
    checked: false,
    pass: true,
    intended_target: intendedTarget,
    predicted_targets: [],
    off_targets: [],
    high_risk_flags: [],
    warnings: [],
    reason,
  };
}

/**
 * Parses a blinded review completion into a verdict. Unparseable
 * completions skip (never fail): enforcement requires evidence.
 */
export function parseSpecificityResponse(
  completion: string,
  intendedTarget: string
): SpecificityReport {
  const targets: string[] = [];
  const targetRe = /^\s*(?:\d+[.)]\s*)?TARGET:\s*(.+)$/gim;
  let targetMatch: RegExpExecArray | null;
  while (
    (targetMatch = targetRe.exec(completion)) !== null &&
    targets.length < 3
  ) {
    const name = (targetMatch[1] ?? "").trim();
    if (name.length > 0) targets.push(name);
  }

  if (targets.length === 0) {
    return uncheckedSpecificity(
      intendedTarget,
      "Unparseable specificity response — review skipped"
    );
  }

  const offTargets: string[] = [];
  const offRe = /^\s*(?:\d+[.)]\s*)?OFFTARGET:\s*(.+)$/gim;
  let offMatch: RegExpExecArray | null;
  while ((offMatch = offRe.exec(completion)) !== null) {
    const entry = (offMatch[1] ?? "").trim();
    if (entry.length > 0 && !/^none\b/i.test(entry)) {
      offTargets.push(entry);
    }
  }

  const top = targets[0] ?? "";
  const matched = matchIntendedTarget(top, intendedTarget);
  const highRisk = flagsHighRisk(offTargets);
  const warnings = offTargets.filter((entry) => !highRisk.includes(entry));
  if (!matched) {
    warnings.unshift(`Top prediction '${top}' does not match intended target`);
  }

  return {
    checked: true,
    pass: matched && highRisk.length === 0,
    intended_target: intendedTarget,
    predicted_targets: targets,
    off_targets: offTargets,
    high_risk_flags: highRisk,
    warnings,
    reason: !matched
      ? `Top prediction '${top}' does not match intended target`
      : highRisk.length > 0
        ? `High-risk off-target flags: ${highRisk.join("; ")}`
        : `Top prediction '${top}' matches intended target`,
  };
}

/** One-line verdict for compiler diagnostics and telemetry. */
export function summarizeSpecificity(report: SpecificityReport): string {
  if (!report.checked) return `review skipped (${report.reason})`;
  const top = report.predicted_targets[0] ?? "none";
  if (report.pass) return `top prediction '${top}' matches`;
  return report.reason;
}

/**
 * Runs the blinded round-trip specificity review. Returns an unchecked
 * report (never throws, never fails closed) when the key is missing, the
 * request fails, or the completion is unparseable.
 */
export async function checkSpecificity(
  candidate: string,
  intendedTarget: string,
  chargeTarget: number,
  timeoutMs = META_SPARK_TIMEOUT_MS
): Promise<SpecificityReport> {
  const apiKey = process.env.META_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return uncheckedSpecificity(intendedTarget, "Meta API key not configured");
  }

  const payload: MetaSparkRequest = {
    model: META_SPARK_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a peptide pharmacologist reviewing candidate knottins with strict output formatting.",
      },
      {
        role: "user",
        content: buildSpecificityPrompt(candidate, chargeTarget),
      },
    ],
    temperature: SPECIFICITY_TEMPERATURE,
    max_tokens: SPECIFICITY_MAX_TOKENS,
    reasoning_effort: "minimal",
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
      console.warn(`[meta-spark] specificity upstream HTTP ${response.status}`);
      return uncheckedSpecificity(
        intendedTarget,
        `Upstream HTTP ${response.status}`
      );
    }
    const parsed = MetaSparkResponseSchema.safeParse(
      (await response.json()) as unknown
    );
    if (!parsed.success) {
      return uncheckedSpecificity(
        intendedTarget,
        "Unparseable response envelope"
      );
    }
    const content =
      parsed.data.choices
        ?.map((choice) => choice.message?.content ?? choice.text ?? "")
        .filter((text) => text.length > 0)
        .join("\n") ?? "";
    const completion = `${content}\n${parsed.data.output_text ?? ""}`.trim();
    if (completion.length === 0) {
      return uncheckedSpecificity(intendedTarget, "Empty completion");
    }
    return parseSpecificityResponse(completion, intendedTarget);
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    console.warn(`[meta-spark] specificity request error: ${name}`);
    return uncheckedSpecificity(intendedTarget, `Request error: ${name}`);
  } finally {
    clearTimeout(timeout);
  }
}
