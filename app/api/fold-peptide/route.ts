import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "../../../types/peptide";
import {
  FoldError,
  FoldRequestSchema,
  foldSequence,
} from "../../../lib/esmfold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Public ESMFold proxy for the 3D viewer. Accepts a short canonical
 * peptide sequence, folds it via the keyless ESM Atlas API, and returns
 * the PDB plus mean C-alpha pLDDT. Clean error JSON on validation
 * faults (400), upstream rate limits (429), timeouts (504), and other
 * upstream failures (502) — the viewer renders each as a fallback.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request: body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsed = FoldRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const body: ApiResponse = {
      success: false,
      error:
        "Invalid request: sequence must be 1-59 single-letter canonical amino acids.",
      details: parsed.error.flatten(),
    };
    return NextResponse.json(body, { status: 400 });
  }

  try {
    const { pdb, plddt } = await foldSequence(parsed.data.sequence);
    return NextResponse.json(
      { success: true, pdb, plddt },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof FoldError) {
      const body: ApiResponse = {
        success: false,
        error: error.message,
        details: { kind: error.kind },
      };
      return NextResponse.json(body, { status: error.httpStatus });
    }
    const body: ApiResponse = {
      success: false,
      error: "Folding failed unexpectedly.",
    };
    return NextResponse.json(body, { status: 502 });
  }
}
