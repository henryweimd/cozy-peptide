import { DEMO_COOLDOWN_SECONDS } from "./demo-config";

/**
 * Shared per-IP cooldown for the public demo endpoints, so the JSON and
 * streaming routes enforce a single allowance. Per-instance in-memory
 * tracking (best-effort on serverless); sufficient to pace a hackathon
 * demo and protect the upstream API budget.
 */
const lastCallByIp = new Map<string, number>();

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded !== null) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  return "unknown";
}

function prune(now: number): void {
  const windowMs = DEMO_COOLDOWN_SECONDS * 1000;
  for (const [ip, at] of lastCallByIp) {
    if (now - at >= windowMs) lastCallByIp.delete(ip);
  }
}

/** Seconds the IP must still wait, or 0 when a call is allowed. */
export function demoCooldownRemaining(ip: string): number {
  const now = Date.now();
  prune(now);
  const last = lastCallByIp.get(ip);
  if (last === undefined) return 0;
  return Math.max(
    0,
    Math.ceil((last + DEMO_COOLDOWN_SECONDS * 1000 - now) / 1000)
  );
}

export function recordDemoCall(ip: string): void {
  lastCallByIp.set(ip, Date.now());
}
