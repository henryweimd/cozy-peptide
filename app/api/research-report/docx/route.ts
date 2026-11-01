import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateRunNarrative } from "@/lib/db/recent";
import { runWithRequestId } from "@/lib/spark-trace";
import { reportToDocx } from "@/lib/research/report-docx";
import {
  parseReportRequest,
  resolveReport,
} from "@/lib/research/report-request";

export const maxDuration = 60;

function slugify(target: string): string {
  const slug = target
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "report";
}

/**
 * POST /api/research-report/docx
 * Same request shape as /api/research-report, but returns the
 * literature brief as a downloadable .docx lab-handoff file.
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
  const buffer = await reportToDocx(resolved.report);
  const bytes = new Uint8Array(buffer);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="literature-brief-${slugify(resolved.report.target)}.docx"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
