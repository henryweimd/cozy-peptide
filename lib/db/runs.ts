/**
 * Run ledger: persists every generation (web demo and API, success and
 * failure) to the Supabase `peptide_runs` table. Dependency-free —
 * plain PostgREST over fetch. Never throws and never fails the request:
 * a dead database degrades to a console warning, exactly like the
 * research fallback.
 */

import { saveCitations, type StoredCitation } from "./citations";
import type { SparkFailure } from "../spark-trace";

export type RunSource = "api" | "api-stream" | "demo" | "demo-stream";

export interface RunRequestParams {
  target: string;
  requested_target?: string;
  mechanism?: string;
  charge_target?: number;
  modality?: string;
  model?: string;
  research?: boolean;
}

export interface RunRecord {
  source: RunSource;
  status: "success" | "error";
  target: string;
  mechanism?: string | null;
  charge_target?: number | null;
  modality?: string | null;
  model?: string | null;
  research_enabled?: boolean | null;
  research_status?: string | null;
  target_class?: string | null;
  candidate_sequence?: string | null;
  candidate_id?: string | null;
  therapeutic_index?: number | null;
  safety_index?: number | null;
  error?: string | null;
  elapsed_ms: number;
  request: RunRequestParams;
  research_provenance?: unknown | null;
  refinement_trace?: unknown | null;
  candidate?: unknown | null;
  symbolic_audit?: unknown | null;
  lab_handoff?: unknown | null;
  agent_tools?: unknown | null;
  stage_trace?: unknown | null;
  specificity?: unknown | null;
  spark_failures?: SparkFailure[] | null;
}

export interface SaveResult {
  saved: boolean;
  /** New row id when the insert returned a representation. */
  id?: string;
  error?: string;
}

export const SUPABASE_SAVE_TIMEOUT_MS = 8000;

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  json?(): Promise<unknown>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Builds the database row from the exact payload sent to the caller, so
 * the ledger always matches what the client saw. Pure and total —
 * missing or misshapen fields become nulls, never throws.
 */
export function buildRunRecord(input: {
  source: RunSource;
  params: RunRequestParams;
  elapsedMs: number;
  ok: boolean;
  payload: unknown;
  errorMessage?: string;
  /** Collected SSE-equivalent stage events; null when untraced. */
  stageTrace?: unknown[] | null;
  /** Failed outbound Spark calls with full payloads, if any. */
  sparkFailures?: SparkFailure[] | null;
}): RunRecord {
  const body = isRecord(input.payload) ? input.payload : {};
  const candidate = isRecord(body["candidate"]) ? body["candidate"] : null;
  const audit = isRecord(body["symbolic_audit"]) ? body["symbolic_audit"] : null;
  const provenance = isRecord(body["neurosymbolic_provenance"])
    ? body["neurosymbolic_provenance"]
    : null;
  const research = isRecord(body["research_provenance"])
    ? body["research_provenance"]
    : null;
  return {
    source: input.source,
    status: input.ok ? "success" : "error",
    target: input.params.target,
    mechanism: input.params.mechanism ?? null,
    charge_target: input.params.charge_target ?? null,
    modality: input.params.modality ?? null,
    model: input.params.model ?? null,
    research_enabled: input.params.research ?? null,
    research_status: research !== null ? asString(research["status"]) : null,
    target_class:
      provenance !== null ? asString(provenance["target_class"]) : null,
    candidate_sequence: candidate !== null ? asString(candidate["sequence"]) : null,
    candidate_id: candidate !== null ? asString(candidate["id"]) : null,
    therapeutic_index: audit !== null ? asNumber(audit["therapeutic_index"]) : null,
    safety_index: audit !== null ? asNumber(audit["safety_index"]) : null,
    error: input.ok ? null : (input.errorMessage ?? asString(body["error"])),
    elapsed_ms: input.elapsedMs,
    request: input.params,
    research_provenance: research,
    refinement_trace:
      provenance !== null ? (provenance["refinement_trace"] ?? null) : null,
    candidate,
    symbolic_audit: audit,
    lab_handoff: isRecord(body["lab_handoff"]) ? body["lab_handoff"] : null,
    agent_tools: Array.isArray(body["agent_tools"]) ? body["agent_tools"] : null,
    stage_trace:
      input.stageTrace !== undefined && input.stageTrace !== null
        ? input.stageTrace.slice(0, 100)
        : null,
    specificity: isRecord(body["specificity"]) ? body["specificity"] : null,
    spark_failures:
      input.sparkFailures !== undefined && input.sparkFailures !== null
        ? input.sparkFailures
        : null,
  };
}

/**
 * Whether the newest ledger columns (stage_trace, specificity,
 * spark_failures) exist.
 * Probed lazily: a 400 on the full insert retries stripped, and the
 * outcome sticks for the process lifetime so pre-migration ledgers
 * don't pay for a doomed first attempt on every save.
 */
let traceColumnsSupported: boolean | null = null;

/** Resets the column probe; tests only. */
export function resetTraceColumnProbe(): void {
  traceColumnsSupported = null;
}

const NEWEST_COLUMNS = new Set([
  "stage_trace",
  "specificity",
  "spark_failures",
]);

function stripTraceColumns(record: RunRecord): Record<string, unknown> {
  const asMap = record as unknown as Record<string, unknown>;
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(asMap)) {
    if (NEWEST_COLUMNS.has(key)) continue;
    rest[key] = value;
  }
  return rest;
}

/**
 * Inserts one run row. No-ops (unsaved, no error) when Supabase env is
 * missing; records the failure reason otherwise. Prefers the
 * service-role key and falls back to the anon key (INSERT-only policy).
 * When the trace columns predate the migration, the insert retries
 * without them so the ledger keeps working.
 */
export async function saveRun(
  record: RunRecord,
  options: { fetchImpl?: FetchImpl; timeoutMs?: number } = {}
): Promise<SaveResult> {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const key =
    serviceKey !== undefined && serviceKey.length > 0
      ? serviceKey
      : anonKey !== undefined && anonKey.length > 0
        ? anonKey
        : undefined;
  if (baseUrl === undefined || baseUrl.length === 0 || key === undefined) {
    return { saved: false, error: "Supabase env not configured" };
  }

  const timeoutMs = options.timeoutMs ?? SUPABASE_SAVE_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((input: string | URL | Request, init?: RequestInit) =>
      fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const post = (body: unknown): Promise<{ ok: boolean; status: number; json?(): Promise<unknown> }> =>
    fetchImpl(`${baseUrl.replace(/\/+$/, "")}/rest/v1/peptide_runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  try {
    let response = await post(
      traceColumnsSupported === false ? stripTraceColumns(record) : record
    );
    if (!response.ok && response.status === 400 && traceColumnsSupported !== false) {
      response = await post(stripTraceColumns(record));
      traceColumnsSupported = response.ok ? false : null;
    } else if (response.ok && traceColumnsSupported === null) {
      traceColumnsSupported = true;
    }
    if (!response.ok) {
      return { saved: false, error: `Supabase HTTP ${response.status}` };
    }
    if (typeof response.json !== "function") return { saved: true };
    const body: unknown = await response.json().catch(() => null);
    const id =
      Array.isArray(body) &&
      typeof body[0] === "object" &&
      body[0] !== null &&
      typeof (body[0] as Record<string, unknown>)["id"] === "string"
        ? ((body[0] as Record<string, unknown>)["id"] as string)
        : undefined;
    return id === undefined ? { saved: true } : { saved: true, id };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    return {
      saved: false,
      error: name === "AbortError" ? "Supabase timeout" : `Supabase ${name}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Extracts storable citations from a record's research provenance. */
export function citationsFromRecord(record: RunRecord): StoredCitation[] {
  const provenance = record.research_provenance;
  if (typeof provenance !== "object" || provenance === null) return [];
  const evidence = (provenance as Record<string, unknown>)["evidence"];
  if (!Array.isArray(evidence)) return [];
  const citations: StoredCitation[] = [];
  for (const entry of evidence) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const source = typeof item["source"] === "string" ? item["source"] : "";
    const externalId = typeof item["id"] === "string" ? item["id"] : "";
    if (source.length === 0 || externalId.length === 0) continue;
    citations.push({
      source,
      externalId,
      title: typeof item["title"] === "string" ? item["title"] : "",
      snippet: typeof item["snippet"] === "string" ? item["snippet"] : "",
      url: typeof item["url"] === "string" ? item["url"] : "",
      year: typeof item["year"] === "string" ? item["year"] : null,
    });
  }
  return citations;
}

/**
 * Best-effort ledger write for routes: awaits the run insert plus its
 * citation rows but never throws, warning once when the database is
 * unreachable or unconfigured (silent when unconfigured — local dev
 * without Supabase is normal). Resolves to the new row id so callers
 * can link follow-up artifacts (folded structures) back to the run.
 */
export async function recordRun(
  record: RunRecord,
  options: { fetchImpl?: FetchImpl; timeoutMs?: number } = {}
): Promise<string | null> {
  try {
    const result = await saveRun(record, options);
    if (!result.saved) {
      if (result.error !== "Supabase env not configured") {
        console.warn(`[peptide-runs] ledger write failed: ${result.error}`);
      }
      return null;
    }
    if (result.id === undefined) return null;
    const citations = citationsFromRecord(record);
    if (citations.length > 0) {
      const stored = await saveCitations(result.id, citations, {
        timeoutMs: options.timeoutMs,
      });
      if (stored.error !== undefined) {
        console.warn(`[peptide-runs] citations write failed: ${stored.error}`);
      }
    }
    return result.id;
  } catch (error) {
    console.warn(
      `[peptide-runs] ledger write threw: ${error instanceof Error ? error.message : "unknown"}`
    );
    return null;
  }
}
