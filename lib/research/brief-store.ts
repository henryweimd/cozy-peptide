/**
 * Stored literature briefs: one row per disease target in
 * `research_briefs`, filled by the seed script and refreshed by live
 * runs. Reuse keeps runs instant and keeps the brief feeding the
 * prompt even when retrieval or synthesis is having a bad day.
 * Best-effort like the rest of the ledger — missing env, a missing
 * table, or a dead database degrades to null, never a throw.
 */

import type { EvidenceItem } from "./evidence";
import { asResearchBrief } from "./report-request";
import type { ResearchBrief } from "./brief";

export interface StoredResearchBrief {
  key: string;
  status: string;
  brief: ResearchBrief | null;
  evidence: EvidenceItem[];
  model: string;
  /** Epoch ms of retrieved_at; 0 when unparseable. */
  retrievedAt: number;
}

export const BRIEF_STORE_TIMEOUT_MS = 8000;

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface BriefStoreOptions {
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

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

function asEvidenceItem(value: unknown): EvidenceItem | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const source = row["source"];
  const id =
    typeof row["id"] === "string"
      ? row["id"]
      : typeof row["externalId"] === "string"
        ? row["externalId"]
        : "";
  const title = typeof row["title"] === "string" ? row["title"] : "";
  if ((source !== "pubmed" && source !== "europepmc") || id.length === 0) {
    return null;
  }
  return {
    source,
    id: id.slice(0, 200),
    title: title.slice(0, 600),
    snippet:
      typeof row["snippet"] === "string" ? row["snippet"].slice(0, 2000) : "",
    url: typeof row["url"] === "string" ? row["url"].slice(0, 1000) : "",
    ...(typeof row["year"] === "string" && row["year"].length > 0
      ? { year: row["year"].slice(0, 12) }
      : {}),
  };
}

function parseRow(row: unknown): StoredResearchBrief | null {
  if (typeof row !== "object" || row === null) return null;
  const record = row as Record<string, unknown>;
  if (typeof record["target_key"] !== "string") return null;
  const evidence = Array.isArray(record["evidence"])
    ? record["evidence"]
        .map(asEvidenceItem)
        .filter((item): item is EvidenceItem => item !== null)
        .slice(0, 30)
    : [];
  const retrieved = Date.parse(
    typeof record["retrieved_at"] === "string" ? record["retrieved_at"] : ""
  );
  return {
    key: record["target_key"],
    status:
      typeof record["status"] === "string" ? record["status"] : "fallback",
    brief: asResearchBrief(record["brief"] ?? null),
    evidence,
    model: typeof record["model"] === "string" ? record["model"] : "",
    retrievedAt: Number.isNaN(retrieved) ? 0 : retrieved,
  };
}

/** Reads one target's stored brief. Null on any fault or miss. */
export async function loadStoredBrief(
  targetKey: string,
  options: BriefStoreOptions = {}
): Promise<StoredResearchBrief | null> {
  if (targetKey.length === 0 || targetKey.length > 512) return null;
  const config = env();
  if (config === null) return null;
  const timeoutMs = options.timeoutMs ?? BRIEF_STORE_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((input: string | URL | Request, init?: RequestInit) =>
      fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({
      select: "target_key,target_display,status,brief,evidence,model,retrieved_at",
      target_key: `eq.${targetKey}`,
      limit: "1",
    });
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/research_briefs?${params.toString()}`,
      {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
        signal: controller.signal,
      }
    );
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body) || body.length === 0) return null;
    return parseRow(body[0]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Upserts one target's brief. Idempotent on target_key; never throws.
 * Evidence-only rows (brief null) are valid: they skip retrieval on
 * the next run while synthesis is still attempted live.
 */
export async function saveStoredBrief(
  targetKey: string,
  input: {
    targetDisplay: string;
    status: string;
    brief: ResearchBrief | null;
    evidence: EvidenceItem[];
    model: string;
  },
  options: BriefStoreOptions = {}
): Promise<{ saved: boolean; error?: string }> {
  if (targetKey.length === 0 || targetKey.length > 512) {
    return { saved: false, error: "bad target key" };
  }
  const config = env();
  if (config === null) {
    return { saved: false, error: "Supabase env not configured" };
  }
  const timeoutMs = options.timeoutMs ?? BRIEF_STORE_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((input: string | URL | Request, init?: RequestInit) =>
      fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `${config.baseUrl}/rest/v1/research_briefs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          target_key: targetKey,
          target_display: input.targetDisplay.slice(0, 300),
          status: input.status.slice(0, 24),
          brief: input.brief,
          evidence: input.evidence.slice(0, 30),
          model: input.model.slice(0, 120),
          retrieved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
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
