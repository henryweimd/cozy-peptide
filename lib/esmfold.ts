import { z } from "zod";

/**
 * ESMFold single-sequence structure prediction via Meta's public ESM
 * Metagenomic Atlas API. Zero-GPU, zero-API-key: the server POSTs the
 * raw sequence as text/plain and receives PDB coordinates with per-
 * residue pLDDT confidence in the B-factor column.
 */

export const ESMFOLD_PDB_URL = "https://api.esmatlas.com/foldSequence/v1/pdb/";
/** Per-attempt budget: under the upstream gateway's own ~29s timeout so
 * a slow attempt aborts into a client-side retry instead of hanging. */
export const ESMFOLD_TIMEOUT_MS = 25000;
export const ESMFOLD_MAX_LENGTH = 59;

export const FoldRequestSchema = z.object({
  sequence: z
    .string()
    .min(1)
    .max(ESMFOLD_MAX_LENGTH)
    .regex(
      /^[ACDEFGHIKLMNPQRSTVWY]+$/,
      "sequence must be single-letter canonical amino acids"
    ),
  runId: z.string().uuid().optional(),
});
export type FoldRequest = z.infer<typeof FoldRequestSchema>;

export type FoldErrorKind =
  | "rate-limited"
  | "timeout"
  | "upstream"
  | "unparseable";

export class FoldError extends Error {
  readonly kind: FoldErrorKind;
  readonly httpStatus: number;

  constructor(kind: FoldErrorKind, httpStatus: number, message: string) {
    super(message);
    this.name = "FoldError";
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

export interface FoldResult {
  pdb: string;
  plddt: number;
}

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/**
 * Mean pLDDT across C-alpha records: ESMFold stores per-residue
 * confidence in the B-factor column (cols 61-66, 1-indexed) of each CA
 * atom. Returns null when no CA record parses.
 */
export function meanPlddtFromPdb(pdb: string): number | null {
  let sum = 0;
  let count = 0;
  for (const line of pdb.split("\n")) {
    if (!line.startsWith("ATOM")) continue;
    if (line.slice(12, 16).trim() !== "CA") continue;
    const value = Number.parseFloat(line.slice(60, 66));
    if (!Number.isFinite(value)) continue;
    sum += value;
    count += 1;
  }
  if (count === 0) return null;
  return sum / count;
}

/**
 * Normalizes fractional pLDDT to the standard 0-100 scale. The Atlas
 * fold endpoint stores confidence as 0-1 fractions in the B-factor
 * column; when every C-alpha B-factor is at most 1, all ATOM B-factors
 * are scaled by 100 (reformatted in place) so the viewer gradient and
 * the reported mean use the conventional scale. Otherwise the PDB is
 * returned untouched.
 */
export function normalizePdbPlddt(pdb: string): string {
  let max = Number.NEGATIVE_INFINITY;
  for (const line of pdb.split("\n")) {
    if (!line.startsWith("ATOM")) continue;
    if (line.slice(12, 16).trim() !== "CA") continue;
    const value = Number.parseFloat(line.slice(60, 66));
    if (Number.isFinite(value) && value > max) max = value;
  }
  if (!(max <= 1.0)) return pdb;
  return pdb
    .split("\n")
    .map((line) => {
      if (!line.startsWith("ATOM") || line.length < 66) return line;
      const value = Number.parseFloat(line.slice(60, 66));
      if (!Number.isFinite(value)) return line;
      return `${line.slice(0, 60)}${(value * 100).toFixed(2).padStart(6, " ")}${line.slice(66)}`;
    })
    .join("\n");
}

/**
 * Folds one short sequence. Throws FoldError (never returns partial
 * data): rate-limited on upstream 429, timeout past the budget,
 * upstream on other HTTP faults, unparseable when no CA record yields
 * a confidence score.
 */
export async function foldSequence(
  sequence: string,
  options: { fetchImpl?: FetchImpl; timeoutMs?: number } = {}
): Promise<FoldResult> {
  const timeoutMs = options.timeoutMs ?? ESMFOLD_TIMEOUT_MS;
  const fetchImpl =
    options.fetchImpl ??
    ((input: string | URL | Request, init?: RequestInit) =>
      fetch(input, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(ESMFOLD_PDB_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: sequence,
      signal: controller.signal,
    });
    if (response.status === 429) {
      throw new FoldError(
        "rate-limited",
        429,
        "ESM Atlas rate limit reached — retry shortly."
      );
    }
    if (!response.ok) {
      throw new FoldError(
        "upstream",
        502,
        `ESM Atlas folding failed (HTTP ${response.status}).`
      );
    }
    const raw = await response.text();
    if (raw.trim().length === 0 || !raw.includes("ATOM")) {
      throw new FoldError(
        "unparseable",
        502,
        "ESM Atlas returned no coordinate records."
      );
    }
    const pdb = normalizePdbPlddt(raw);
    const plddt = meanPlddtFromPdb(pdb);
    if (plddt === null) {
      throw new FoldError(
        "unparseable",
        502,
        "No C-alpha confidence scores parsed from the PDB."
      );
    }
    return { pdb, plddt };
  } catch (error) {
    if (error instanceof FoldError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new FoldError(
        "timeout",
        504,
        `ESM Atlas folding timed out after ${timeoutMs}ms.`
      );
    }
    throw new FoldError(
      "upstream",
      502,
      `ESM Atlas request failed (${error instanceof Error ? error.name : "unknown"}).`
    );
  } finally {
    clearTimeout(timer);
  }
}
