/**
 * Meta provider status: a cheap, cached health probe for the Spark
 * chat-completions path that research and proposals actually use.
 * (The models list can 200 while chat is account-blocked, so the
 * probe sends a minimal completion instead.) Never throws, never
 * records into the run ledger — status checks are telemetry, not
 * pipeline calls.
 */

import { META_SPARK_MODEL, getMetaSparkApiUrl } from "./spark-config";

export type SparkProviderState =
  | "ok"
  | "blocked"
  | "rate_limited"
  | "unreachable"
  | "unconfigured";

export interface SparkStatus {
  state: SparkProviderState;
  /** Short troubleshooting detail, e.g. "HTTP 403 user_blocked". */
  detail: string;
  model: string;
  latencyMs: number;
  checkedAt: string;
}

export const SPARK_STATUS_TIMEOUT_MS = 8000;
/** Cached verdict lifetime; the probe itself stays off the hot path. */
export const SPARK_STATUS_TTL_MS = 90000;

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface SparkStatusOptions {
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

function errorCode(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const record = body as Record<string, unknown>;
  const error = record["error"];
  if (typeof error !== "object" || error === null) return "";
  const code = (error as Record<string, unknown>)["code"];
  return typeof code === "string" ? code : "";
}

/** One live probe of the completions path. Never throws. */
export async function checkSparkStatus(
  options: SparkStatusOptions = {}
): Promise<SparkStatus> {
  const startedAt = Date.now();
  const base = {
    model: META_SPARK_MODEL,
    latencyMs: 0,
    checkedAt: new Date(startedAt).toISOString(),
  };
  const apiKey = process.env.META_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return { ...base, state: "unconfigured", detail: "META_API_KEY not set" };
  }
  const timeoutMs = options.timeoutMs ?? SPARK_STATUS_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((input: string | URL | Request, init?: RequestInit) =>
      fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(getMetaSparkApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: META_SPARK_MODEL,
        messages: [{ role: "user", content: "Reply with the word ok." }],
        max_tokens: 3,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (response.ok) {
      return { ...base, state: "ok", latencyMs, detail: `HTTP ${response.status}` };
    }
    let code = "";
    try {
      code = errorCode(await response.json());
    } catch {
      code = "";
    }
    const detail =
      code.length > 0 ? `HTTP ${response.status} ${code}` : `HTTP ${response.status}`;
    if (response.status === 403) {
      return { ...base, state: "blocked", latencyMs, detail };
    }
    if (response.status === 429) {
      return { ...base, state: "rate_limited", latencyMs, detail };
    }
    return { ...base, state: "unreachable", latencyMs, detail };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    return {
      ...base,
      state: "unreachable",
      latencyMs: Date.now() - startedAt,
      detail:
        name === "AbortError"
          ? `timeout after ${timeoutMs}ms`
          : `network error (${name})`,
    };
  } finally {
    clearTimeout(timer);
  }
}

let cached: { status: SparkStatus; expiresAt: number } | null = null;

/** Cached verdict: at most one live probe per TTL window. */
export async function getSparkStatus(
  options: SparkStatusOptions = {}
): Promise<{ status: SparkStatus; cached: boolean }> {
  if (cached !== null && Date.now() < cached.expiresAt) {
    return { status: cached.status, cached: true };
  }
  const status = await checkSparkStatus(options);
  cached = { status, expiresAt: Date.now() + SPARK_STATUS_TTL_MS };
  return { status, cached: false };
}

/** Test seam: drops the cached verdict. */
export function clearSparkStatusCache(): void {
  cached = null;
}
