import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "../../../types/peptide";
import { fetchRunById } from "../../../lib/db/recent";
import {
  LAB_DISPATCH_SCHEMA,
  buildLabDispatch,
} from "../../../lib/lab-dispatch";

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

/**
 * Outbound lab dispatch (`cozy-peptide.lab-dispatch/1`): machine-readable
 * work order for contracted labs — design specifications plus a
 * suggested experiment panel and the result-ingest contract. Lets CRO
 * integrations pull specs procedurally instead of by email.
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
  const runId = request.nextUrl.searchParams.get("run");
  if (runId === null || !/^[0-9a-fA-F-]{36}$/.test(runId)) {
    return json(
      { success: false, error: "Invalid request: ?run=<uuid> required." },
      400
    );
  }
  const run = await fetchRunById(runId);
  if (run === null) {
    return json(
      { success: false, error: "Unknown run: no successful run found." },
      404
    );
  }
  const dispatch = buildLabDispatch(run);
  if (dispatch === null) {
    return json(
      {
        success: false,
        error: "Run has no lab handoff manifest to dispatch.",
        details: { schema: LAB_DISPATCH_SCHEMA },
      },
      422
    );
  }
  return json({ success: true, run_id: runId, data: dispatch }, 200);
}
