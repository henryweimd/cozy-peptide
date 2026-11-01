import { requestSparkCompletion } from "../spark-client";
import { DEFAULT_MODEL } from "../spark-config";
import type { ResearchBrief } from "./brief";
import type { StoredCitation } from "../db/citations";

/**
 * Literature report builder: turns a run's brief plus its stored
 * citations into a referenced document model (narrative + numbered
 * references with URLs). The narrative is synthesized once per run by
 * Muse Spark and cached on the run row; the references are always
 * rebuilt deterministically from citation records, never model-made.
 */

export interface ReportReference {
  n: number;
  title: string;
  source: string;
  year: string | null;
  url: string;
}

export interface ReportTargetNote {
  name: string;
  note: string;
  cites: number[];
}

export interface ReportNarrative {
  background: string;
  rationale: string;
  targets: ReportTargetNote[];
  safety: string;
  limitations: string;
}

export interface ReportEnvelope {
  model: string;
  at: string;
  narrative: ReportNarrative;
}

export interface ResearchReport {
  target: string;
  generatedAt: string;
  model: string;
  cached: boolean;
  fallback: boolean;
  evidenceCount: number;
  narrative: ReportNarrative;
  references: ReportReference[];
}

export interface InlineBrief {
  target: string;
  brief: ResearchBrief | null;
  evidence: StoredCitation[];
}

/**
 * Rebuilds a canonical URL from a legacy cite ref ("pubmed:123",
 * "europepmc:MED:123") for runs stored before first-class citations.
 */
export function urlForCiteRef(ref: string): string {
  const pubmed = ref.match(/^pubmed:(\d+)$/i);
  if (pubmed !== null) {
    return `https://pubmed.ncbi.nlm.nih.gov/${pubmed[1]}/`;
  }
  const europepmc = ref.match(/^europepmc:([^:/\s]+):([^:/\s]+)$/i);
  if (europepmc !== null) {
    return `https://europepmc.org/article/${encodeURIComponent(europepmc[1])}/${encodeURIComponent(europepmc[2])}`;
  }
  return "";
}

export function referencesFromCitations(
  citations: StoredCitation[]
): ReportReference[] {
  return citations.map((cite, index) => ({
    n: index + 1,
    title: cite.title.length > 0 ? cite.title : `${cite.source}:${cite.externalId}`,
    source: cite.source,
    year: cite.year,
    url:
      cite.url.length > 0
        ? cite.url
        : urlForCiteRef(`${cite.source}:${cite.externalId}`),
  }));
}

/**
 * Legacy fallback: numbered references from bare brief cite refs.
 * Titles are unavailable for pre-citation rows, but URLs rebuild
 * deterministically.
 */
export function referencesFromBrief(
  brief: ResearchBrief | null
): ReportReference[] {
  if (brief === null) return [];
  const seen = new Set<string>();
  const references: ReportReference[] = [];
  for (const cite of brief.citations) {
    if (seen.has(cite.ref)) continue;
    seen.add(cite.ref);
    const source = cite.ref.split(":")[0] ?? "";
    references.push({
      n: references.length + 1,
      title: cite.note.length > 0 ? cite.note : cite.ref,
      source,
      year: null,
      url: urlForCiteRef(cite.ref),
    });
  }
  return references;
}

function buildNarrativePrompt(
  target: string,
  brief: ResearchBrief | null,
  references: ReportReference[],
  snippets: string[]
): string {
  const lines = [
    "You are a biomedical literature analyst writing a concise, compelling design brief.",
    `Disease objective: ${target}.`,
    "Below are the numbered evidence records and the converged brief (targets, mechanisms, avoid list).",
    "Write a JSON object with exactly these string fields: background (2-3 sentences on the disease and why a gut-delivered peptide fits), rationale (the biological reasoning for this design approach), safety (why the avoid list matters), limitations (what this brief does not establish).",
    'Plus "targets": an array of {name, note, cites} where note is one grounded sentence and cites lists the evidence numbers supporting it.',
    "Rules: only cite evidence numbers from the list; never invent papers, authors, or findings; keep each field under 90 words.",
    "Evidence:",
  ];
  references.forEach((ref, index) => {
    lines.push(
      `[${ref.n}] ${ref.title} — ${(snippets[index] ?? "").slice(0, 300)}`.slice(0, 420)
    );
  });
  if (brief !== null) {
    lines.push(
      `Converged targets: ${brief.targets.map((entry) => entry.name).join("; ") || "none"}.`
    );
    lines.push(
      `Converged mechanisms: ${brief.mechanisms.map((entry) => entry.name).join("; ") || "none"}.`
    );
    lines.push(
      `Avoid: ${brief.avoid.map((entry) => `${entry.name} (${entry.rationale})`).join("; ") || "none"}.`
    );
  }
  lines.push("Respond with ONLY the JSON object, no commentary.");
  return lines.join("\n");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseNarrative(completion: string): ReportNarrative | null {
  const start = completion.indexOf("{");
  const end = completion.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(completion.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const background = asString(record["background"]).trim();
  const rationale = asString(record["rationale"]).trim();
  if (background.length === 0 || rationale.length === 0) return null;
  const targets: ReportTargetNote[] = [];
  if (Array.isArray(record["targets"])) {
    for (const entry of record["targets"].slice(0, 8)) {
      if (typeof entry !== "object" || entry === null) continue;
      const note = entry as Record<string, unknown>;
      const name = asString(note["name"]).trim();
      if (name.length === 0) continue;
      const cites = Array.isArray(note["cites"])
        ? note["cites"].filter(
            (cite): cite is number =>
              typeof cite === "number" && Number.isInteger(cite) && cite > 0
          )
        : [];
      targets.push({
        name: name.slice(0, 200),
        note: asString(note["note"]).trim().slice(0, 500),
        cites: [...new Set(cites)].slice(0, 6),
      });
    }
  }
  return {
    background: background.slice(0, 900),
    rationale: rationale.slice(0, 900),
    targets,
    safety: asString(record["safety"]).trim().slice(0, 900),
    limitations: asString(record["limitations"]).trim().slice(0, 900),
  };
}

/**
 * Deterministic brief when synthesis is down. Converged lines come
 * first, but the retrieved evidence always grounds the rationale —
 * titles plus reported findings — so a synthesis outage degrades to
 * a readable evidence digest, never an empty document.
 */
function fallbackNarrative(
  target: string,
  brief: ResearchBrief | null,
  references: ReportReference[],
  snippets: string[]
): ReportNarrative {
  const join = (entries: Array<{ name: string; rationale: string }>): string =>
    entries
      .map((entry) =>
        entry.rationale.length > 0
          ? `${entry.name} — ${entry.rationale}`
          : entry.name
      )
      .join("; ");
  const digest = references
    .slice(0, 6)
    .map((ref) => {
      const snippet = (snippets[ref.n - 1] ?? "").trim().slice(0, 220);
      const what =
        snippet.length > 0 ? `${ref.title} — ${snippet}` : ref.title;
      return `[${ref.n}] ${what}`.slice(0, 320);
    })
    .join(" ");
  const rationale =
    brief !== null && brief.mechanisms.length > 0
      ? `Supported mechanisms: ${join(brief.mechanisms)}.`
      : digest.length > 0
        ? `No mechanism converged; retrieved evidence reports: ${digest}`
        : "No mechanism converged and no evidence was retrieved.";
  return {
    background:
      references.length > 0
        ? `Literature-derived design brief for ${target}, grounded in ${references.length} retrieved paper(s) below. Model synthesis was unavailable, so no targets converged — the evidence records stand on their own.`
        : `Literature-derived design brief for ${target}. Model synthesis was unavailable and no evidence was retrieved.`,
    rationale: rationale.slice(0, 1500),
    targets: (brief?.targets ?? []).map((entry) => ({
      name: entry.name,
      note: entry.rationale,
      cites: [],
    })),
    safety:
      brief !== null && brief.avoid.length > 0
        ? `Explicitly avoided: ${join(brief.avoid)}.`
        : "No avoid list converged — reviewer screening did not run.",
    limitations:
      "Fallback mode carries no per-claim citation mapping; evidence titles and snippets are reproduced verbatim from PubMed and Europe PMC — consult the numbered references.",
  };
}

export interface ReportOptions {
  model?: string;
  timeoutMs?: number;
  synthesizeImpl?: (prompt: string) => Promise<string | null>;
}

export async function synthesizeNarrative(
  target: string,
  brief: ResearchBrief | null,
  references: ReportReference[],
  snippets: string[],
  options: ReportOptions = {}
): Promise<{ narrative: ReportNarrative; model: string; fallback: boolean }> {
  const model = options.model ?? DEFAULT_MODEL;
  const prompt = buildNarrativePrompt(target, brief, references, snippets);
  try {
    const text =
      options.synthesizeImpl !== undefined
        ? await options.synthesizeImpl(prompt)
        : (
            await requestSparkCompletion(
              [
                {
                  role: "system",
                  content:
                    "You are a biomedical literature analyst writing concise, strictly grounded design briefs as JSON.",
                },
                { role: "user", content: prompt },
              ],
              {
                maxTokens: 1500,
                timeoutMs: options.timeoutMs ?? 30000,
                temperature: 0.3,
                model,
              }
            )
          )?.text ?? null;
    if (text !== null) {
      const narrative = parseNarrative(text);
      if (narrative !== null) return { narrative, model, fallback: false };
    }
  } catch {
    // Fall through to the deterministic brief.
  }
  return {
    narrative: fallbackNarrative(target, brief, references, snippets),
    model,
    fallback: true,
  };
}

/** Validates a cached narrative envelope from the run row. */
export function parseCachedEnvelope(value: unknown): ReportEnvelope | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const model = asString(record["model"]);
  const at = asString(record["at"]);
  const narrative = record["narrative"];
  if (
    model.length === 0 ||
    at.length === 0 ||
    typeof narrative !== "object" ||
    narrative === null
  ) {
    return null;
  }
  const candidate = narrative as Record<string, unknown>;
  if (
    asString(candidate["background"]).length === 0 ||
    asString(candidate["rationale"]).length === 0
  ) {
    return null;
  }
  return { model, at, narrative: candidate as unknown as ReportNarrative };
}

function clampCites(
  narrative: ReportNarrative,
  refCount: number
): ReportNarrative {
  return {
    ...narrative,
    targets: narrative.targets.map((entry) => ({
      ...entry,
      cites: entry.cites.filter((cite) => cite >= 1 && cite <= refCount),
    })),
  };
}

export interface ReportBuildInput {
  target: string;
  brief: ResearchBrief | null;
  citations: StoredCitation[];
  snippets: string[];
  envelope?: unknown;
  options?: ReportOptions;
}

export interface ReportBuildResult {
  report: ResearchReport;
  /** Non-null when a fresh synthesis should be cached on the run row. */
  fresh: ReportEnvelope | null;
}

/** Assembles the full document model from citations + brief + cache. */
export async function buildReport(
  input: ReportBuildInput
): Promise<ReportBuildResult> {
  const references =
    input.citations.length > 0
      ? referencesFromCitations(input.citations)
      : referencesFromBrief(input.brief);
  const envelope =
    input.envelope === undefined ? null : parseCachedEnvelope(input.envelope);
  if (envelope !== null) {
    return {
      report: {
        target: input.target,
        generatedAt: envelope.at,
        model: envelope.model,
        cached: true,
        fallback: false,
        evidenceCount: references.length,
        narrative: clampCites(envelope.narrative, references.length),
        references,
      },
      fresh: null,
    };
  }
  const synthesized = await synthesizeNarrative(
    input.target,
    input.brief,
    references,
    input.snippets,
    input.options
  );
  const at = new Date().toISOString();
  return {
    report: {
      target: input.target,
      generatedAt: at,
      model: synthesized.model,
      cached: false,
      fallback: synthesized.fallback,
      evidenceCount: references.length,
      narrative: clampCites(synthesized.narrative, references.length),
      references,
    },
    fresh: synthesized.fallback
      ? null
      : { model: synthesized.model, at, narrative: synthesized.narrative },
  };
}
