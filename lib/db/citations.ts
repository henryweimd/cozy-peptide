/**
 * First-class citation storage: every literature evidence item behind
 * a run's brief lands in `research_citations`, keyed by run, so the
 * full reference list (titles, URLs, years) survives independently of
 * the brief prose. Best-effort like the rest of the ledger — a missing
 * table or dead database degrades to warnings, never request faults.
 */

export interface StoredCitation {
  source: string;
  externalId: string;
  title: string;
  snippet: string;
  url: string;
  year: string | null;
}

export const CITATIONS_TIMEOUT_MS = 8000;

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

function env(): { baseUrl: string; key: string } | null {
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
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), key };
}

/**
 * Inserts citation rows for a run. Idempotent per (run, source,
 * external id): conflicts resolve to the existing row, so retries and
 * double-writes are safe. Returns the count stored; never throws.
 */
export async function saveCitations(
  runId: string,
  citations: StoredCitation[],
  options: { fetchImpl?: FetchImpl; timeoutMs?: number } = {}
): Promise<{ saved: number; error?: string }> {
  if (citations.length === 0) return { saved: 0 };
  const config = env();
  if (config === null) {
    return { saved: 0, error: "Supabase env not configured" };
  }
  const timeoutMs = options.timeoutMs ?? CITATIONS_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((input: string | URL | Request, init?: RequestInit) =>
      fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/research_citations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(
          citations.map((cite) => ({
            run_id: runId,
            source: cite.source,
            external_id: cite.externalId,
            title: cite.title,
            snippet: cite.snippet,
            url: cite.url,
            year: cite.year,
          }))
        ),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      return { saved: 0, error: `Supabase HTTP ${response.status}` };
    }
    return { saved: citations.length };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    return {
      saved: 0,
      error: name === "AbortError" ? "Supabase timeout" : `Supabase ${name}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads a run's citations in insertion order. Empty array on any fault.
 */
export async function fetchCitations(
  runId: string,
  options: { fetchImpl?: FetchImpl; timeoutMs?: number } = {}
): Promise<StoredCitation[]> {
  if (!/^[0-9a-fA-F-]{36}$/.test(runId)) return [];
  const config = env();
  if (config === null) return [];
  const timeoutMs = options.timeoutMs ?? CITATIONS_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((input: string | URL | Request, init?: RequestInit) =>
      fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({
      select: "source,external_id,title,snippet,url,year",
      run_id: `eq.${runId}`,
      order: "created_at.asc",
    });
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/research_citations?${params.toString()}`,
      {
        headers: {
          Accept: "application/json",
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
        signal: controller.signal,
      }
    );
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    const citations: StoredCitation[] = [];
    for (const entry of data) {
      if (typeof entry !== "object" || entry === null) continue;
      const row = entry as Record<string, unknown>;
      const source = asString(row["source"]);
      const externalId = asString(row["external_id"]);
      if (source.length === 0 || externalId.length === 0) continue;
      citations.push({
        source,
        externalId,
        title: asString(row["title"]),
        snippet: asString(row["snippet"]),
        url: asString(row["url"]),
        year:
          typeof row["year"] === "string" && row["year"].length > 0
            ? row["year"]
            : null,
      });
    }
    return citations;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
