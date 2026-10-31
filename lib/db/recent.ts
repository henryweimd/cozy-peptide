/**
 * Recent-runs reader: serves the landing page's recent-designs strip and
 * the designer page. Server-side only — reads with the service-role key
 * (the anon key is INSERT-only by policy). Never throws: missing env,
 * HTTP faults, and misshapen rows all degrade to an empty list so the
 * strip hides instead of breaking the page.
 */

export interface RecentRun {
  id: string;
  createdAt: string;
  source: string;
  target: string;
  modality: string | null;
  chargeTarget: number | null;
  researchStatus: string | null;
  candidateId: string | null;
  candidateSequence: string | null;
  therapeuticIndex: number | null;
  safetyIndex: number | null;
  elapsedMs: number | null;
}

export const RECENT_RUNS_DEFAULT_LIMIT = 3;
export const RECENT_RUNS_MAX_LIMIT = 10;
export const RECENT_RUNS_TIMEOUT_MS = 8000;

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseRow(value: unknown): RecentRun | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const id = asString(row["id"]);
  const createdAt = asString(row["created_at"]);
  const source = asString(row["source"]);
  const target = asString(row["target"]);
  if (
    id === null ||
    createdAt === null ||
    source === null ||
    target === null
  ) {
    return null;
  }
  return {
    id,
    createdAt,
    source,
    target,
    modality: asString(row["modality"]),
    chargeTarget: asNumber(row["charge_target"]),
    researchStatus: asString(row["research_status"]),
    candidateId: asString(row["candidate_id"]),
    candidateSequence: asString(row["candidate_sequence"]),
    therapeuticIndex: asNumber(row["therapeutic_index"]),
    safetyIndex: asNumber(row["safety_index"]),
    elapsedMs: asNumber(row["elapsed_ms"]),
  };
}

export interface RunDetail extends RecentRun {
  targetClass: string | null;
  narrative: unknown;
  request: unknown;
  researchProvenance: unknown;
  refinementTrace: unknown;
  candidate: unknown;
  symbolicAudit: unknown;
  labHandoff: unknown;
  agentTools: unknown;
}

function parseDetail(value: unknown): RunDetail | null {
  const row = parseRow(value);
  if (row === null || typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    ...row,
    targetClass: asString(record["target_class"]),
    narrative: record["research_narrative"] ?? null,
    request: record["request"] ?? null,
    researchProvenance: record["research_provenance"] ?? null,
    refinementTrace: record["refinement_trace"] ?? null,
    candidate: record["candidate"] ?? null,
    symbolicAudit: record["symbolic_audit"] ?? null,
    labHandoff: record["lab_handoff"] ?? null,
    agentTools: record["agent_tools"] ?? null,
  };
}

export function clampRecentLimit(value: unknown): number {
  const parsed =
    typeof value === "string"
      ? Number.parseInt(value, 10)
      : typeof value === "number"
        ? Math.floor(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return RECENT_RUNS_DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, 1), RECENT_RUNS_MAX_LIMIT);
}

/**
 * Returns the most recent successful generations, newest first. Success
 * rows only — failed runs have no peptide to show.
 */
/**
 * Fetches one successful run with its full blobs (candidate, audit,
 * handoff) for the focused-peptide panel. Returns null for bad ids,
 * missing rows, missing env, or any fault.
 */
export async function fetchRunById(
  id: string,
  options: { fetchImpl?: FetchImpl; timeoutMs?: number } = {}
): Promise<RunDetail | null> {
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null;
  const baseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    baseUrl === undefined ||
    baseUrl.length === 0 ||
    serviceKey === undefined ||
    serviceKey.length === 0
  ) {
    return null;
  }
  const timeoutMs = options.timeoutMs ?? RECENT_RUNS_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((input: string | URL | Request, init?: RequestInit) =>
      fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({
      select: "*",
      id: `eq.${id}`,
      status: "eq.success",
    });
    const response = await fetchImpl(
      `${baseUrl.replace(/\/+$/, "")}/rest/v1/peptide_runs?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        signal: controller.signal,
      }
    );
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return parseDetail(data[0]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRecentRuns(
  limit: number = RECENT_RUNS_DEFAULT_LIMIT,
  options: { fetchImpl?: FetchImpl; timeoutMs?: number } = {}
): Promise<RecentRun[]> {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    baseUrl === undefined ||
    baseUrl.length === 0 ||
    serviceKey === undefined ||
    serviceKey.length === 0
  ) {
    return [];
  }
  const capped = clampRecentLimit(limit);
  const timeoutMs = options.timeoutMs ?? RECENT_RUNS_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((input: string | URL | Request, init?: RequestInit) =>
      fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({
      select:
        "id,created_at,source,target,modality,charge_target,research_status," +
        "candidate_id,candidate_sequence,therapeutic_index,safety_index,elapsed_ms",
      status: "eq.success",
      order: "created_at.desc",
      limit: String(capped),
    });
    const response = await fetchImpl(
      `${baseUrl.replace(/\/+$/, "")}/rest/v1/peptide_runs?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        signal: controller.signal,
      }
    );
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    const runs: RecentRun[] = [];
    for (const entry of data) {
      const parsed = parseRow(entry);
      if (parsed !== null) runs.push(parsed);
    }
    return runs;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Caches a synthesized report narrative on a run row. Best-effort:
 * service-role key only (anon is INSERT-only), never throws, returns
 * false when the cache write cannot be made.
 */
export async function updateRunNarrative(
  runId: string,
  narrative: unknown,
  options: { timeoutMs?: number; fetchImpl?: FetchImpl } = {}
): Promise<boolean> {
  const baseUrl = process.env["SUPABASE_URL"]?.trim() ?? "";
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() ?? "";
  if (baseUrl.length === 0 || serviceKey.length === 0) return false;
  if (runId.length === 0) return false;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? RECENT_RUNS_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${baseUrl.replace(/\/+$/, "")}/rest/v1/peptide_runs?id=eq.${encodeURIComponent(runId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ research_narrative: narrative }),
        signal: controller.signal,
      }
    );
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
