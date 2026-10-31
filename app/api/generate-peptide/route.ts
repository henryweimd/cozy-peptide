import { NextResponse, type NextRequest } from "next/server";
import {
  PeptideRequestSchema,
  type ApiResponse,
} from "../../../types/peptide";
import {
  CATALYTIC_ENZYME_GUIDANCE,
  extractRequestedLength,
  validateRequestSafety,
} from "../../../lib/biosecurity";
import {
  META_SPARK_MODEL,
  NeurosymbolicVerificationError,
  generateVerifiedPeptide,
} from "../../../lib/meta-spark";
import { buildLabHandoff } from "../../../lib/lab-handoff";
import {
  buildNeurosymbolicPayload,
  refinementCycles,
} from "../../../lib/neurosymbolic-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(body: ApiResponse, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

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
        error: "Unauthorized: invalid or missing bearer token.",
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

  const parsed = PeptideRequestSchema.safeParse(raw);
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

  const { target, mechanism, charge_target } = parsed.data;
  const chargeTarget = charge_target ?? 4;
  const screeningText = `${target}\n${mechanism ?? ""}`.trim();

  const safety = validateRequestSafety(
    screeningText,
    extractRequestedLength(screeningText)
  );
  if (!safety.safe) {
    if (safety.category === "catalytic-enzyme") {
      return json(
        {
          success: false,
          error:
            "Unprocessable target: catalytic enzymes are outside the knottin modality.",
          details: {
            diagnostic: safety.reason,
            modality: "gut-delivered knottins, 28-36 amino acids",
            guidance: CATALYTIC_ENZYME_GUIDANCE,
            suggested_alternative:
              "Source the enzyme fold from a natural homolog (UniProt/BLAST) and express it directly.",
          },
        },
        422
      );
    }
    return json(
      {
        success: false,
        error: "Forbidden: request blocked by the biosecurity filter.",
        details: { diagnostic: safety.reason },
      },
      403
    );
  }

  try {
    const { candidate, audit, refinementHistory } =
      await generateVerifiedPeptide(target, chargeTarget);
    const manifest = buildLabHandoff(candidate);
    return json(
      buildNeurosymbolicPayload(
        target,
        chargeTarget,
        candidate,
        audit,
        refinementHistory,
        manifest
      ),
      200
    );
  } catch (error) {
    if (error instanceof NeurosymbolicVerificationError) {
      return json(
        {
          success: false,
          error:
            "Upstream generation failed: no candidate passed neurosymbolic verification.",
          details: {
            message: error.message,
            proposer_model: META_SPARK_MODEL,
            compiler_refinement_cycles: refinementCycles(
              error.refinementHistory
            ),
            refinement_trace: error.refinementHistory,
          },
        },
        502
      );
    }
    return json(
      {
        success: false,
        error:
          "Upstream generation failed: Meta Spark 1.3 Contributor API error.",
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      },
      502
    );
  }
}
