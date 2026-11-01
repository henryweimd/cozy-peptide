import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateRunNarrative } from "@/lib/db/recent";
import { runWithRequestId } from "@/lib/spark-trace";
import {
  parseReportRequest,
  resolveReport,
} from "@/lib/research/report-request";

export const maxDuration = 60;

/**
 * POST /api/research-report
 * Builds the literature brief document for a stored run
 * ({runId}) or the current in-memory design
 * ({target, brief, evidence}). Synthesizes the narrative once
 * per run via Muse Spark and caches it on the run row.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }
  const parsed = parseReportRequest(body);
  if ("error" in parsed) {
    return NextResponse.json(
      { success: false, error: parsed.error },
      { status: 400 }
    );
  }
  const { result: resolvedPromise } = runWithRequestId(() =>
    resolveReport(parsed)
  );
  const resolved = await resolvedPromise;
  if ("error" in resolved) {
    return NextResponse.json(
      { success: false, error: resolved.error },
      { status: resolved.status }
    );
  }
  if (resolved.runId !== null && resolved.fresh !== null) {
    await updateRunNarrative(resolved.runId, resolved.fresh);
  }
  return NextResponse.json({ success: true, report: resolved.report });
}
