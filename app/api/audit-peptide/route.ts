import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { ApiResponse } from "../../../types/peptide";
import {
  DEFAULT_MODALITY,
  type Modality,
} from "../../../lib/modality";
import { parseModalityGrammar } from "../../../lib/modality";
import {
  auditFailureModes,
  auditPeptideCandidate,
  buildVerificationReport,
  grammarFailureModes,
} from "../../../lib/symbolic-auditor";
import { assessCandidate } from "../../../lib/therapeutic-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const AuditRequestSchema = z.object({
  sequence: z.string().min(1).max(200),
  charge_target: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
  modality: z
    .enum(["knottin-6c", "disulfide-4c", "disulfide-2c", "linear"])
    .optional(),
});

function json(body: ApiResponse, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * Deterministic audit for a caller-supplied sequence: runs the same
 * grammar, symbolic audit, and therapeutic/safety scoring as generation,
 * with no model calls. Powers CRO pre-screening of candidate peptides.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${serverToken}`) {
    return json(
      {
        success: false,
        error: "Unauthorized: invalid or missing Bearer [REDACTED]",
      },
      401
    );
  }

  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    return json(
      { success: false, error: "Invalid request: body must be valid JSON." },
      400
    );
  }

  const parsed = AuditRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      {
        success: false,
        error: "Invalid request: payload failed validation.",
        details: parsed.error.flatten(),
      },
      400
    );
  }

  const sequence = parsed.data.sequence.trim().toUpperCase();
  const chargeTarget = parsed.data.charge_target ?? 4;
  const modality: Modality = parsed.data.modality ?? DEFAULT_MODALITY;
  const grammar = parseModalityGrammar(sequence, modality);
  const audit = auditPeptideCandidate(sequence, chargeTarget, modality);
  const assessment = assessCandidate(sequence, modality, chargeTarget);
  const report = buildVerificationReport(grammar, audit);
  return json(
    {
      success: true,
      data: {
        sequence,
        modality,
        charge_target: chargeTarget,
        grammar_valid: grammar.valid,
        syntax_errors: grammar.syntaxErrors,
        loops: grammar.loops,
        audit_passed: audit.passed,
        violations: audit.violations,
        therapeutic_index: assessment.therapeutic_index,
        safety_index: assessment.safety_index,
        verification_report: report,
        failure_modes: [
          ...grammarFailureModes(grammar),
          ...auditFailureModes(audit),
        ],
      },
    },
    200
  );
}
