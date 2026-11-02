/**
 * Server-side store for CRO image-check segmentations. Mirrors the
 * assay_results access pattern: service-role REST, injectable fetch for
 * tests, timeouts on every call.
 */

export const CRO_IMAGES_BUCKET = "cro-images";
export const CRO_SAVE_TIMEOUT_MS = 8000;
export const CRO_LIST_MAX_LIMIT = 10;

export interface DbOptions {
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

/**
 * Fixed id of the demo run ledger. Demo-image checks resolve here so the
 * demo loop persists without touching real runs. Created on first use.
 */
export const DEMO_RUN_ID = "dec0de00-0000-4000-8000-000000000000";
const DEMO_RUN_TARGET = "Demo run — CRO image checks";

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json?(): Promise<unknown> }>;

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

export function isCroStoreConfigured(): boolean {
  return dbConfig() !== null;
}

export function croPublicUrl(imagePath: string): string | null {
  const config = dbConfig();
  if (config === null) return null;
  return `${config.baseUrl}/storage/v1/object/public/${CRO_IMAGES_BUCKET}/${imagePath}`;
}

function defaultFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; json?(): Promise<unknown> }> {
  return fetch(input, init);
}

export interface CroAnalysisSaveInput {
  run_id: string | null;
  image_path: string;
  image_sha256: string;
  concepts: string[];
  sam_model: string;
  boxes: unknown[];
  masks: unknown[];
  foreground_pixels: number;
  count: number;
  mask_svg: string;
  summary: Record<string, unknown>;
}

export async function saveCroAnalysis(
  input: CroAnalysisSaveInput,
  options: DbOptions = {}
): Promise<{ saved: boolean; id?: string; error?: string }> {
  const config = dbConfig();
  if (config === null) {
    return { saved: false, error: "Supabase env not configured" };
  }
  const timeoutMs = options.timeoutMs ?? CRO_SAVE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/cro_image_analyses`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      }
    );
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

/** Stores the analyzed image bytes in the public cro-images bucket. */
export async function uploadCroImage(
  path: string,
  bodyBase64: string,
  contentType: string,
  options: DbOptions = {}
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const config = dbConfig();
  if (config === null) {
    return { ok: false, error: "Supabase env not configured" };
  }
  const timeoutMs = options.timeoutMs ?? CRO_SAVE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/storage/v1/object/${CRO_IMAGES_BUCKET}/${path}`,
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

export interface CroAnalysisRow {
  id: string;
  created_at: string;
  run_id: string | null;
  image_path: string;
  concepts: string[];
  sam_model: string;
  boxes: unknown[];
  masks: unknown[];
  foreground_pixels: number;
  count: number;
  mask_svg: string;
  summary: Record<string, unknown>;
}

async function getDemoRun(
  config: { baseUrl: string; key: string },
  fetchImpl: FetchImpl,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/peptide_runs?id=eq.${DEMO_RUN_ID}&select=id`,
      {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
        signal: controller.signal,
      }
    );
    if (!response.ok || typeof response.json !== "function") return null;
    const body: unknown = await response.json().catch(() => null);
    return Array.isArray(body) &&
      typeof body[0] === "object" &&
      body[0] !== null &&
      typeof (body[0] as Record<string, unknown>)["id"] === "string"
      ? ((body[0] as Record<string, unknown>)["id"] as string)
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Demo run id when it already exists, without creating it. */
export async function findDemoRunId(
  options: DbOptions = {}
): Promise<string | null> {
  const config = dbConfig();
  if (config === null) return null;
  return getDemoRun(
    config,
    options.fetchImpl ?? defaultFetch,
    options.timeoutMs ?? CRO_SAVE_TIMEOUT_MS
  );
}

/**
 * Demo run id, creating the ledger row on first use. Returns null when
 * the store is unconfigured or unreachable.
 */
export async function resolveDemoRunId(
  options: DbOptions = {}
): Promise<string | null> {
  const config = dbConfig();
  if (config === null) return null;
  const timeoutMs = options.timeoutMs ?? CRO_SAVE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/peptide_runs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          id: DEMO_RUN_ID,
          source: "demo",
          status: "success",
          target: DEMO_RUN_TARGET,
          request: { target: DEMO_RUN_TARGET, demo: true },
        }),
        signal: controller.signal,
      }
    );
    if (response.ok) return DEMO_RUN_ID;
    if (response.status !== 409) return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  // Already exists: confirm and return the id.
  return getDemoRun(config, fetchImpl, timeoutMs);
}

export interface CachedAnalysis {
  id: string;
  run_id: string | null;
  boxes: unknown[];
  masks: unknown[];
  foreground_pixels: number;
  count: number;
  mask_svg: string;
  width: number | null;
  height: number | null;
}

/**
 * Newest stored segmentation for identical pixels + concept + model, any
 * run. Null on miss or outage (callers re-segment on null).
 */
export async function findCachedAnalysis(
  imageSha256: string,
  concept: string,
  model: string,
  options: DbOptions = {}
): Promise<CachedAnalysis | null> {
  const config = dbConfig();
  if (config === null) return null;
  const timeoutMs = options.timeoutMs ?? CRO_SAVE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const params = new URLSearchParams({
    select:
      "id,run_id,boxes,masks,foreground_pixels,count,mask_svg,summary",
    image_sha256: `eq.${imageSha256}`,
    concepts: `cs.{${concept}}`,
    sam_model: `eq.${model}`,
    order: "created_at.desc",
    limit: "1",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/cro_image_analyses?${params.toString()}`,
      {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
        signal: controller.signal,
      }
    );
    if (!response.ok || typeof response.json !== "function") return null;
    const body: unknown = await response.json().catch(() => null);
    if (!Array.isArray(body) || body.length === 0) return null;
    const row = body[0] as Record<string, unknown>;
    if (typeof row["id"] !== "string") return null;
    const summary =
      typeof row["summary"] === "object" && row["summary"] !== null
        ? (row["summary"] as Record<string, unknown>)
        : {};
    return {
      id: row["id"],
      run_id: typeof row["run_id"] === "string" ? row["run_id"] : null,
      boxes: Array.isArray(row["boxes"]) ? row["boxes"] : [],
      masks: Array.isArray(row["masks"]) ? row["masks"] : [],
      foreground_pixels:
        typeof row["foreground_pixels"] === "number" ? row["foreground_pixels"] : 0,
      count: typeof row["count"] === "number" ? row["count"] : 0,
      mask_svg: typeof row["mask_svg"] === "string" ? row["mask_svg"] : "",
      width: typeof summary["width"] === "number" ? summary["width"] : null,
      height: typeof summary["height"] === "number" ? summary["height"] : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Newest analyses for one run, newest first. */
export async function fetchCroAnalysesForRun(
  runId: string,
  limit: number,
  options: DbOptions = {}
): Promise<CroAnalysisRow[] | null> {
  const config = dbConfig();
  if (config === null) return null;
  const capped = Math.max(
    1,
    Math.min(Math.floor(limit) || CRO_LIST_MAX_LIMIT, CRO_LIST_MAX_LIMIT)
  );
  const timeoutMs = options.timeoutMs ?? CRO_SAVE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const params = new URLSearchParams({
    select:
      "id,created_at,run_id,image_path,concepts,sam_model,boxes,masks,foreground_pixels,count,mask_svg,summary",
    run_id: `eq.${runId}`,
    order: "created_at.desc",
    limit: String(capped),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/cro_image_analyses?${params.toString()}`,
      {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
        signal: controller.signal,
      }
    );
    if (!response.ok || typeof response.json !== "function") return null;
    const body: unknown = await response.json().catch(() => null);
    if (!Array.isArray(body)) return null;
    return body.filter(
      (row): row is CroAnalysisRow =>
        typeof row === "object" && row !== null && typeof (row as { id?: unknown }).id === "string"
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
