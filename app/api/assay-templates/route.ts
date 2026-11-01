import { NextResponse, type NextRequest } from "next/server";
import {
  ASSAY_TYPES,
  templateCsv,
  type AssayType,
} from "../../../lib/assay-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public template downloads for wet-lab submissions. Labs unfamiliar
 * with the format fetch these first; filled files go to
 * POST /api/assay-results unchanged.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const type = request.nextUrl.searchParams.get("type");
  if (type === null || !(ASSAY_TYPES as string[]).includes(type)) {
    return NextResponse.json(
      {
        success: false,
        error: `Unknown template. Use ?type=${ASSAY_TYPES.join("|")}.`,
      },
      { status: 400 }
    );
  }
  const assay = type as AssayType;
  return new NextResponse(templateCsv(assay), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cozy-peptide-${assay}-template.csv"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
