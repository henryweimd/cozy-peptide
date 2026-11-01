/**
 * Literature retrieval tools for the research agents. Both sources are
 * keyless and free: NCBI PubMed E-utilities and the Europe PMC REST API.
 * Every function is fail-open — network faults, bad payloads, and
 * timeouts return an error note, never a throw — so a dead literature
 * backend degrades to the static steering brief instead of failing the
 * generation request.
 */

export interface EvidenceItem {
  source: "pubmed" | "europepmc";
  id: string;
  title: string;
  snippet: string;
  url: string;
  year?: string;
}

export interface EvidenceResult {
  items: EvidenceItem[];
  latencyMs: number;
  error?: string;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<FetchResponseLike>;

export interface RetrievalOptions {
  timeoutMs?: number;
  maxResults?: number;
  fetchImpl?: FetchImpl;
}

export const RETRIEVAL_TIMEOUT_MS = 6000;
export const RETRIEVAL_MAX_RESULTS = 5;

function defaultFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<FetchResponseLike> {
  return fetch(input, init);
}

/**
 * Strips query DSL metacharacters so caller disease text cannot break the
 * backend query syntax. Keeps plain words, capped for URL safety.
 */
export function sanitizeQuery(query: string, maxLength = 200): string {
  return query
    .replace(/[^A-Za-z0-9 .,_+/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * AND-joins sanitized query words for backends that silently degrade
 * loose multi-word queries to subset matching (Europe PMC returns
 * off-topic papers instead of few results when the bag of words is
 * unsatisfiable). Caller-supplied boolean operators are stripped
 * first so disease text cannot inject query syntax.
 */
export function andQuery(terms: string, maxLength = 200): string {
  const words = sanitizeQuery(terms, maxLength)
    .split(" ")
    .filter(
      (word) =>
        word.length > 0 &&
        word.toUpperCase() !== "AND" &&
        word.toUpperCase() !== "OR" &&
        word.toUpperCase() !== "NOT"
    );
  return words.join(" AND ").slice(0, maxLength);
}

async function fetchJson(
  url: string,
  timeoutMs: number,
  fetchImpl: FetchImpl
): Promise<{ data: unknown } | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    return { data: await response.json() };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    return { error: name === "AbortError" ? "timeout" : `fetch ${name}` };
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * PubMed retrieval: one esearch for PMIDs, one esummary for titles.
 * Esummaries carry no abstracts, so the title plus journal is the
 * grounding snippet — enough for the synthesis agent to rank targets.
 */
export async function searchPubMed(
  query: string,
  options: RetrievalOptions = {}
): Promise<EvidenceResult> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? RETRIEVAL_TIMEOUT_MS;
  const maxResults = options.maxResults ?? RETRIEVAL_MAX_RESULTS;
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const fail = (error: string): EvidenceResult => ({
    items: [],
    latencyMs: Date.now() - startedAt,
    error,
  });

  const terms = sanitizeQuery(query);
  if (terms.length === 0) return fail("empty query");
  const apiKey = process.env.NCBI_API_KEY;
  const keyParam =
    apiKey !== undefined && apiKey.length > 0
      ? `&api_key=${encodeURIComponent(apiKey)}`
      : "";
  const searchUrl =
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi" +
    `?db=pubmed&term=${encodeURIComponent(terms)}&retmode=json` +
    `&retmax=${maxResults}&sort=relevance&tool=cozy-peptide${keyParam}`;

  const searched = await fetchJson(searchUrl, timeoutMs, fetchImpl);
  if ("error" in searched) return fail(`esearch: ${searched.error}`);
  const idList = isRecord(searched.data)
    ? (searched.data["esearchresult"] as Record<string, unknown> | undefined)?.[
        "idlist"
      ]
    : undefined;
  const ids = Array.isArray(idList)
    ? idList.filter((id): id is string => typeof id === "string").slice(0, maxResults)
    : [];
  if (ids.length === 0) {
    return { items: [], latencyMs: Date.now() - startedAt };
  }

  const summaryUrl =
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi" +
    `?db=pubmed&id=${ids.map(encodeURIComponent).join(",")}` +
    `&retmode=json&tool=cozy-peptide${keyParam}`;
  const summarized = await fetchJson(summaryUrl, timeoutMs, fetchImpl);
  if ("error" in summarized) return fail(`esummary: ${summarized.error}`);
  const result = isRecord(summarized.data)
    ? summarized.data["result"]
    : undefined;
  if (!isRecord(result)) return fail("esummary: unexpected shape");

  const items: EvidenceItem[] = [];
  for (const id of ids) {
    const doc = result[id];
    if (!isRecord(doc)) continue;
    const title = asString(doc["title"]).trim();
    if (title.length === 0) continue;
    const journal = asString(doc["source"]).trim();
    const pubdate = asString(doc["pubdate"]).trim();
    items.push({
      source: "pubmed",
      id,
      title: title.slice(0, 300),
      snippet:
        journal.length > 0 ? `${title} (${journal})`.slice(0, 400) : title.slice(0, 400),
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      year: pubdate.length >= 4 ? pubdate.slice(0, 4) : undefined,
    });
  }
  return { items, latencyMs: Date.now() - startedAt };
}

/**
 * Europe PMC retrieval: a single search call returning titles plus
 * abstract excerpts. Complements PubMed with full-text coverage and
 * citation counts.
 */
export async function searchEuropePmc(
  query: string,
  options: RetrievalOptions = {}
): Promise<EvidenceResult> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? RETRIEVAL_TIMEOUT_MS;
  const maxResults = options.maxResults ?? RETRIEVAL_MAX_RESULTS;
  const fetchImpl = options.fetchImpl ?? defaultFetch;

  const terms = sanitizeQuery(query);
  if (terms.length === 0) {
    return { items: [], latencyMs: Date.now() - startedAt, error: "empty query" };
  }
  const url =
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search" +
    `?query=${encodeURIComponent(terms)}&format=json` +
    `&pageSize=${maxResults}&resultType=core`;

  const fetched = await fetchJson(url, timeoutMs, fetchImpl);
  if ("error" in fetched) {
    return {
      items: [],
      latencyMs: Date.now() - startedAt,
      error: fetched.error,
    };
  }
  const list = isRecord(fetched.data)
    ? (fetched.data["resultList"] as Record<string, unknown> | undefined)?.[
        "result"
      ]
    : undefined;
  if (!Array.isArray(list)) {
    return {
      items: [],
      latencyMs: Date.now() - startedAt,
      error: "unexpected shape",
    };
  }

  const items: EvidenceItem[] = [];
  for (const entry of list.slice(0, maxResults)) {
    if (!isRecord(entry)) continue;
    const title = asString(entry["title"]).trim();
    const id = asString(entry["id"]).trim();
    const src = asString(entry["source"]).trim() || "MED";
    if (title.length === 0 || id.length === 0) continue;
    const abstract = asString(entry["abstractText"]).trim();
    items.push({
      source: "europepmc",
      id: `${src}:${id}`,
      title: title.slice(0, 300),
      snippet: (abstract.length > 0 ? abstract : title).slice(0, 400),
      url: `https://europepmc.org/article/${encodeURIComponent(src)}/${encodeURIComponent(id)}`,
      year: asString(entry["pubYear"]).trim() || undefined,
    });
  }
  return { items, latencyMs: Date.now() - startedAt };
}
