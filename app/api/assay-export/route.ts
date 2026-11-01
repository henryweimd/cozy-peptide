import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "../../../types/peptide";
import {
  COMMUNITY_EXPORT_MAX_LIMIT,
  fetchCommunityAssays,
} from "../../../lib/db/assays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(body: ApiResponse, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function toCsvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Community dataset: consented assay measurements for model
 * developers, newest first. JSON by default, `?format=csv` for
 * spreadsheets. Notes and raw files are never exported.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const serverToken = process.env.API_BEARER_TOKEN;
  if (serverToken === undefined || serverToken.length === 0) {
    return json(
      {
        success: false,
        error: "Server misconfiguration: API_BEARER_TOKEN is not set.",
      },
      500
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${serverToken}`) {
    return json(
      {
        success: false,
        error: "Unauthorized: invalid or missing Bearer [REDACTED]",
      },
      401
    );
  }
  const params = request.nextUrl.searchParams;
  const limit = Number.parseInt(params.get("limit") ?? "50", 10);
  const format = params.get("format") ?? "json";
  if (format !== "json" && format !== "csv") {
    return json(
      { success: false, error: "Invalid request: ?format=json|csv." },
      400
    );
  }
  const rows = await fetchCommunityAssays(
    Number.isFinite(limit) ? limit : 50
  );
  if (rows === null) {
    return json(
      { success: false, error: "Ledger unavailable." },
      503
    );
  }
  if (format === "csv") {
    const header = [
      "id",
      "created_at",
      "run_id",
      "assay_type",
      "template_version",
      "organism_or_cells",
      "value_num",
      "value_unit",
      "value_text",
      "passed",
      "measurements_json",
      "consent_license",
    ];
    const lines = [header.join(",")];
    for (const row of rows) {
      lines.push(
        [
          row.id,
          row.created_at,
          row.run_id,
          row.assay_type,
          row.template_version,
          row.organism_or_cells,
          row.value_num,
          row.value_unit,
          row.value_text,
          row.passed,
          row.measurements,
          row.consent_license,
        ]
          .map(toCsvCell)
          .join(",")
      );
    }
    return new NextResponse(lines.join("\n") + "\n", {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="cozy-peptide-community-assays.csv"',
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
  return json(
    {
      success: true,
      data: {
        count: rows.length,
        max_limit: COMMUNITY_EXPORT_MAX_LIMIT,
        rows,
      },
    },
    200
  );
}
