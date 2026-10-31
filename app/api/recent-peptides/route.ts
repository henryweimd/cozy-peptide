import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "../../../types/peptide";
import {
  clampRecentLimit,
  clampRecentOffset,
  fetchRecentRuns,
} from "../../../lib/db/recent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public recent-designs feed for the landing page strip and the
 * designer page. Same-origin use; no auth. Reads server-side with the
 * service-role key and degrades to an empty list when the ledger is
 * unconfigured or unreachable, so callers hide the strip. `limit`
 * (1-10) and `offset` page through successful runs.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl?.searchParams;
  const runs = await fetchRecentRuns(
    clampRecentLimit(query?.get("limit") ?? undefined),
    { offset: clampRecentOffset(query?.get("offset") ?? undefined) }
  );
  const body: ApiResponse = { success: true, data: runs };
  return NextResponse.json(body, { status: 200 });
}
