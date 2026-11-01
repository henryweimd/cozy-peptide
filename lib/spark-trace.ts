import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Outbound Spark call tracing: correlates every Meta API request with
 * the application request that caused it, and retains full failed
 * payloads for the ledger. AsyncLocalStorage keeps concurrent
 * serverless requests isolated without threading a tracer object
 * through every layer between routes and the HTTP client.
 */

export interface SparkFailure {
  at: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  latencyMs: number;
  /** Full outbound messages; each content capped (see MAX_CHARS). */
  messages: Array<{ role: string; content: string; chars: number }>;
  promptChars: number;
  httpStatus: number | null;
  finishReason: string | null;
  error: string;
  responseSnippet: string | null;
}

export const SPARK_MESSAGE_MAX_CHARS = 8000;
export const SPARK_RESPONSE_MAX_CHARS = 2000;
export const SPARK_FAILURES_PER_REQUEST = 10;

const storage = new AsyncLocalStorage<string>();

interface FailureBucket {
  createdAt: number;
  failures: SparkFailure[];
}

const buckets = new Map<string, FailureBucket>();
const MAX_BUCKETS = 50;

/** Runs fn under a fresh outbound-trace id, returned to the caller. */
export function runWithRequestId<T>(fn: () => T): { id: string; result: T } {
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const result = storage.run(id, fn);
  return { id, result };
}

/** Ambient trace id, or null outside a traced request. */
export function currentRequestId(): string | null {
  return storage.getStore() ?? null;
}

function pruneBuckets(): void {
  if (buckets.size <= MAX_BUCKETS) return;
  const entries = [...buckets.entries()].sort(
    (a, b) => a[1].createdAt - b[1].createdAt
  );
  for (const [key] of entries.slice(0, buckets.size - MAX_BUCKETS)) {
    buckets.delete(key);
  }
}

/** Records a failure under the ambient trace id (no-op untraced). */
export function recordSparkFailure(failure: SparkFailure): void {
  const id = storage.getStore();
  if (id === undefined) return;
  let bucket = buckets.get(id);
  if (bucket === undefined) {
    bucket = { createdAt: Date.now(), failures: [] };
    buckets.set(id, bucket);
    pruneBuckets();
  }
  if (bucket.failures.length >= SPARK_FAILURES_PER_REQUEST) return;
  bucket.failures.push(failure);
}

/**
 * Takes (and clears) the failures for a trace id — or the ambient
 * one when omitted. Rows built from these carry the exact outbound
 * payloads behind a run's upstream faults.
 */
export function takeSparkFailures(id?: string): SparkFailure[] {
  const key = id ?? storage.getStore();
  if (key === undefined) return [];
  const bucket = buckets.get(key);
  buckets.delete(key);
  return bucket?.failures ?? [];
}

export function capText(text: string, max: number): {
  text: string;
  chars: number;
} {
  if (text.length <= max) return { text, chars: text.length };
  return {
    text: `${text.slice(0, max)}\n…[truncated ${text.length - max} of ${text.length} chars]`,
    chars: text.length,
  };
}
