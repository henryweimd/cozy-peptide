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
