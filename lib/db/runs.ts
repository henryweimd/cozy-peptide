/**
 * Run ledger: persists every generation (web demo and API, success and
 * failure) to the Supabase `peptide_runs` table. Dependency-free —
 * plain PostgREST over fetch. Never throws and never fails the request:
 * a dead database degrades to a console warning, exactly like the
 * research fallback.
 */

export type RunSource = "api" | "api-stream" | "demo" | "demo-stream";

export interface RunRequestParams {
  target: string;
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
}

export interface SaveResult {
  saved: boolean;
  error?: string;
}

export const SUPABASE_SAVE_TIMEOUT_MS = 8000;

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number }>;

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
  };
}

/**
 * Inserts one run row. No-ops (unsaved, no error) when Supabase env is
 * missing; records the failure reason otherwise. Prefers the
 * service-role key and falls back to the anon key (INSERT-only policy).
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
  try {
    const response = await fetchImpl(
      `${baseUrl.replace(/\/+$/, "")}/rest/v1/peptide_runs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(record),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      return { saved: false, error: `Supabase HTTP ${response.status}` };
    }
    return { saved: true };
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

/**
 * Best-effort ledger write for routes: awaits the insert but never
 * throws, warning once when the database is unreachable or unconfigured
 * (silent when unconfigured — local dev without Supabase is normal).
 */
export async function recordRun(
  record: RunRecord,
  options: { fetchImpl?: FetchImpl; timeoutMs?: number } = {}
): Promise<void> {
  try {
    const result = await saveRun(record, options);
    if (!result.saved && result.error !== "Supabase env not configured") {
      console.warn(`[peptide-runs] ledger write failed: ${result.error}`);
    }
  } catch (error) {
    console.warn(
      `[peptide-runs] ledger write threw: ${error instanceof Error ? error.message : "unknown"}`
    );
  }
}
