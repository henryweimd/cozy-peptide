/**
 * Wet-lab loop ledger: assay results keyed to runs, raw-file storage,
 * and the consented community export. Server-only (service role).
 * Mirrors lib/db/runs.ts conventions: env-gated, timeouts, injectable
 * fetch for tests.
 */

import type { AssayType } from "../assay-ingest";

export interface AssaySaveInput {
  run_id: string;
  assay_type: AssayType;
  template_version: string;
  organism_or_cells?: string | null;
  value_num?: number | null;
  value_unit?: string | null;
  value_text?: string | null;
  passed?: boolean | null;
  measurements: unknown[];
  raw_file_name?: string | null;
  raw_storage_path?: string | null;
  raw_body_base64?: string | null;
  notes?: string | null;
  consent_community: boolean;
  consent_license: string;
}

export interface AssaySaveResult {
  saved: boolean;
  id?: string;
  error?: string;
}

export interface CommunityAssayRow {
  id: string;
  created_at: string;
  run_id: string;
  assay_type: string;
  template_version: string;
  organism_or_cells: string | null;
  value_num: number | null;
  value_unit: string | null;
  value_text: string | null;
  passed: boolean | null;
  measurements: unknown;
  consent_license: string;
}

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json?(): Promise<unknown> }>;

interface DbOptions {
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

export const ASSAY_SAVE_TIMEOUT_MS = 8000;
export const ASSAY_RAW_BUCKET = "assay-raw";
export const COMMUNITY_EXPORT_MAX_LIMIT = 200;

function dbConfig(): { baseUrl: string; key: string } | null {
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
  return { baseUrl: baseUrl.replace(/\/+$/, ""), key: serviceKey };
}

export async function saveAssayResult(
  input: AssaySaveInput,
  options: DbOptions = {}
): Promise<AssaySaveResult> {
  const config = dbConfig();
  if (config === null) {
    return { saved: false, error: "Supabase env not configured" };
  }
  const timeoutMs = options.timeoutMs ?? ASSAY_SAVE_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((url: string | URL | Request, init?: RequestInit) => fetch(url, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}/rest/v1/assay_results`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
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

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Stores raw upload bytes in the private assay-raw bucket. */
export async function uploadAssayRaw(
  path: string,
  bodyBase64: string,
  contentType: string,
  options: DbOptions = {}
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const config = dbConfig();
  if (config === null) {
    return { ok: false, error: "Supabase env not configured" };
  }
  const timeoutMs = options.timeoutMs ?? ASSAY_SAVE_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((url: string | URL | Request, init?: RequestInit) => fetch(url, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/storage/v1/object/${ASSAY_RAW_BUCKET}/${path}`,
      {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": contentType,
        },
        body: base64ToBytes(bodyBase64) as unknown as BodyInit,
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      return { ok: false, error: `Storage HTTP ${response.status}` };
    }
    return { ok: true, path };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    return {
      ok: false,
      error: name === "AbortError" ? "Storage timeout" : `Storage ${name}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Consented rows only, newest first. Notes and raw files excluded. */
export async function fetchCommunityAssays(
  limit: number,
  options: DbOptions = {}
): Promise<CommunityAssayRow[] | null> {
  const config = dbConfig();
  if (config === null) return null;
  const capped = Math.max(
    1,
    Math.min(Math.floor(limit) || 50, COMMUNITY_EXPORT_MAX_LIMIT)
  );
  const timeoutMs = options.timeoutMs ?? ASSAY_SAVE_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((url: string | URL | Request, init?: RequestInit) => fetch(url, init));
  const params = new URLSearchParams({
    select:
      "id,created_at,run_id,assay_type,template_version,organism_or_cells,value_num,value_unit,value_text,passed,measurements,consent_license",
    consent_community: "eq.true",
    order: "created_at.desc",
    limit: String(capped),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/assay_results?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
        signal: controller.signal,
      }
    );
    if (!response.ok || typeof response.json !== "function") return null;
    const body: unknown = await response.json().catch(() => null);
    if (!Array.isArray(body)) return null;
    return body as CommunityAssayRow[];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
