import { updateRunNarrative } from "../db/recent";
import { citationsFromRecord, type RunRecord } from "../db/runs";
import { runWithRequestId } from "../spark-trace";
import { asResearchBrief } from "./report-request";
import type { ResearchBrief } from "./brief";
import { buildReport, type ReportOptions } from "./report";
import type { StoredCitation } from "../db/citations";

/**
 * Background narrative pre-generation: synthesizes the literature
 * brief's narrative right after a run is recorded, so opening the
 * brief later serves the cached document instantly instead of paying
 * for a Spark call on first read. Best-effort like all ledger
 * writes — a failed pre-generation just falls back to on-demand
 * synthesis at read time.
 */

export interface NarrativeCacheInput {
  target: string;
  brief: ResearchBrief | null;
  citations: StoredCitation[];
  snippets: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Builds the synthesis input from a recorded run. Returns null when
 * there is nothing to synthesize from (no brief, no citations).
 */
export function narrativeInputFromRecord(
  record: RunRecord
): NarrativeCacheInput | null {
  const target = record.target.trim();
  if (target.length === 0) return null;
  const provenance = isRecord(record.research_provenance)
    ? record.research_provenance
    : null;
  const brief =
    provenance !== null ? asResearchBrief(provenance["brief"]) : null;
  const citations = citationsFromRecord(record);
  if (brief === null && citations.length === 0) return null;
  return {
    target,
    brief,
    citations,
    snippets: citations.map((cite) => cite.snippet),
  };
}

export interface CacheNarrativeOptions extends ReportOptions {
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  timeoutMs?: number;
}

/**
 * Synthesizes the narrative and caches it on the run row. Never
 * throws; resolves false when synthesis failed or the cache write
 * could not be made (read-time synthesis covers those runs).
 */
export async function buildAndCacheNarrative(
  runId: string,
  input: NarrativeCacheInput,
  options: CacheNarrativeOptions = {}
): Promise<boolean> {
  try {
    const { result } = runWithRequestId(() =>
      buildReport({
        target: input.target,
        brief: input.brief,
        citations: input.citations,
        snippets: input.snippets,
        options,
      })
    );
    const { fresh } = await result;
    if (fresh === null) return false;
    return await updateRunNarrative(runId, fresh, {
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
    });
  } catch (error) {
    console.warn(
      `[research-report] narrative pre-generation failed: ${error instanceof Error ? error.message : "unknown"}`
    );
    return false;
  }
}
