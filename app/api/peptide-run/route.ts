import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "../../../types/peptide";
import { fetchRunById } from "../../../lib/db/recent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public single-run reader for the focused-peptide panel: `GET
 * /api/peptide-run?id=<uuid>` returns the successful run with its
 * full blobs. Same-origin use; no auth. Reads server-side with the
 * service-role key; missing rows and ledger faults are 404s.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl?.searchParams.get("id") ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    const body: ApiResponse = {
      success: false,
      error: "Invalid request: id must be a run UUID.",
    };
    return NextResponse.json(body, { status: 400 });
  }
  const run = await fetchRunById(id);
  if (run === null) {
    const body: ApiResponse = {
      success: false,
      error: "Run not found.",
    };
    return NextResponse.json(body, { status: 404 });
  }
  const body: ApiResponse = { success: true, data: run };
  return NextResponse.json(body, { status: 200 });
}
