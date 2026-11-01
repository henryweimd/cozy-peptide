import { NextResponse } from "next/server";
import { getSparkStatus } from "../../../lib/spark-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Public provider verdict: the cached Meta Spark completions status
 * (no key material, no prompt content). The design UI polls this to
 * show whether research and proposals run on the model or on
 * deterministic fallbacks.
 */
export async function GET(): Promise<NextResponse> {
  const { status, cached } = await getSparkStatus();
  return NextResponse.json({
    state: status.state,
    detail: status.detail,
    model: status.model,
    latency_ms: status.latencyMs,
    checked_at: status.checkedAt,
    cached,
  });
}
