import { fetchCitations, type StoredCitation } from "../db/citations";
import { fetchRunById } from "../db/recent";
import type { ResearchBrief } from "./brief";
import {
  buildReport,
  type ReportBuildResult,
  type ReportOptions,
} from "./report";

/**
 * Shared request handling for the literature-report routes: accepts
 * either a stored run id ("run" mode, Supabase-backed with narrative
 * caching) or an inline target + brief + evidence payload (current
 * in-memory design), resolving both to a referenced report.
 */

export type ReportRequest =
  | { mode: "run"; runId: string }
  | {
      mode: "inline";
      target: string;
      brief: ResearchBrief | null;
      citations: StoredCitation[];
      snippets: string[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBriefEntry(
  value: unknown
): { name: string; rationale: string } | null {
  if (!isRecord(value)) return null;
  const name = typeof value["name"] === "string" ? value["name"] : "";
  if (name.length === 0) return null;
  return {
    name: name.slice(0, 300),
    rationale:
      typeof value["rationale"] === "string"
        ? value["rationale"].slice(0, 1000)
        : "",
  };
}

export function asResearchBrief(value: unknown): ResearchBrief | null {
  if (!isRecord(value)) return null;
  const targets = Array.isArray(value["targets"]) ? value["targets"] : null;
  const mechanisms = Array.isArray(value["mechanisms"])
    ? value["mechanisms"]
    : null;
  const avoid = Array.isArray(value["avoid"]) ? value["avoid"] : null;
  const citations = Array.isArray(value["citations"]) ? value["citations"] : null;
  if (
    targets === null ||
    mechanisms === null ||
    avoid === null ||
    citations === null
  ) {
    return null;
  }
  return {
    targets: targets
      .map(asBriefEntry)
      .filter((entry): entry is { name: string; rationale: string } => entry !== null)
      .slice(0, 20),
    mechanisms: mechanisms
      .map(asBriefEntry)
      .filter((entry): entry is { name: string; rationale: string } => entry !== null)
      .slice(0, 20),
    avoid: avoid
      .map(asBriefEntry)
      .filter((entry): entry is { name: string; rationale: string } => entry !== null)
      .slice(0, 20),
    citations: citations
      .map((cite) => {
        if (!isRecord(cite)) return null;
        const ref = typeof cite["ref"] === "string" ? cite["ref"] : "";
        if (ref.length === 0) return null;
        return {
          ref: ref.slice(0, 200),
          note:
            typeof cite["note"] === "string" ? cite["note"].slice(0, 500) : "",
        };
      })
      .filter(
        (cite): cite is { ref: string; note: string } => cite !== null
      )
      .slice(0, 30),
    evidenceCount:
      typeof value["evidenceCount"] === "number" &&
      Number.isFinite(value["evidenceCount"])
        ? Math.max(0, Math.floor(value["evidenceCount"]))
        : citations.length,
  };
}

function asCitation(value: unknown): StoredCitation | null {
  if (!isRecord(value)) return null;
  const source = typeof value["source"] === "string" ? value["source"] : "";
  const externalId =
    typeof value["externalId"] === "string"
      ? value["externalId"]
      : typeof value["id"] === "string"
        ? value["id"]
        : "";
  if (source.length === 0 || externalId.length === 0) return null;
  return {
    source: source.slice(0, 60),
    externalId: externalId.slice(0, 200),
    title: typeof value["title"] === "string" ? value["title"].slice(0, 600) : "",
    snippet:
      typeof value["snippet"] === "string" ? value["snippet"].slice(0, 2000) : "",
    url: typeof value["url"] === "string" ? value["url"].slice(0, 1000) : "",
    year: typeof value["year"] === "string" ? value["year"].slice(0, 12) : null,
  };
}

export function parseReportRequest(
  body: unknown
): ReportRequest | { error: string } {
  if (!isRecord(body)) return { error: "Request body must be a JSON object." };
  const runId = body["runId"];
  if (typeof runId === "string" && runId.length > 0) {
    if (runId.length > 128) return { error: "runId too long." };
    return { mode: "run", runId };
  }
  const target = typeof body["target"] === "string" ? body["target"].trim() : "";
  if (target.length === 0) return { error: "Provide runId or an inline target." };
  if (target.length > 300) return { error: "target too long." };
  const brief =
    body["brief"] === null || body["brief"] === undefined
      ? null
      : asResearchBrief(body["brief"]);
  if (body["brief"] !== null && body["brief"] !== undefined && brief === null) {
    return { error: "brief is malformed." };
  }
  const rawEvidence = Array.isArray(body["evidence"]) ? body["evidence"] : [];
  const citations = rawEvidence
    .map(asCitation)
    .filter((cite): cite is StoredCitation => cite !== null)
    .slice(0, 30);
  if (citations.length === 0 && brief === null) {
    return { error: "Inline reports need evidence or a brief." };
  }
  return {
    mode: "inline",
    target,
    brief,
    citations,
    snippets: citations.map((cite) => cite.snippet),
  };
}

export interface ResolvedReport extends ReportBuildResult {
  runId: string | null;
}

/** Fetches run context (when stored) and builds the report model. */
export async function resolveReport(
  request: ReportRequest,
  options: ReportOptions = {}
): Promise<ResolvedReport | { error: string; status: number }> {
  if (request.mode === "inline") {
    const built = await buildReport({
      target: request.target,
      brief: request.brief,
      citations: request.citations,
      snippets: request.snippets,
      options,
    });
    return { ...built, runId: null };
  }
  const run = await fetchRunById(request.runId);
  if (run === null) return { error: "Run not found.", status: 404 };
  const target = (run.target ?? "").trim();
  if (target.length === 0) {
    return { error: "Run has no target to report on.", status: 422 };
  }
  const provenance = isRecord(run.researchProvenance)
    ? run.researchProvenance
    : null;
  const brief =
    provenance !== null ? asResearchBrief(provenance["brief"]) : null;
  const citations = await fetchCitations(request.runId);
  if (citations.length === 0 && brief === null) {
    return {
      error: "No stored literature found for this run.",
      status: 404,
    };
  }
  const built = await buildReport({
    target,
    brief,
    citations,
    snippets: citations.map((cite) => cite.snippet),
    envelope: run.narrative,
    options,
  });
  return { ...built, runId: request.runId };
}
