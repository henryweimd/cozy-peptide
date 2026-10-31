import { NextResponse, type NextRequest } from "next/server";
import {
  PeptideRequestSchema,
  type ApiResponse,
  type LabHandoffManifest,
  type RefinementTurn,
  type SymbolicAuditResult,
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
import { parseKnottinGrammar } from "../../../lib/protein-grammar";
import { buildLabHandoff } from "../../../lib/lab-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODALITY = "engineered_knottin_microprotein";
const LINGUISTIC_PARADIGM = "context_sensitive_loop_grammar";
const TOPOLOGY_LABEL = "C1-C4, C2-C5, C3-C6 ICK";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(body: ApiResponse, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

/** Human-readable liability names cleared by the strict audit motifs. */
function liabilitiesCleared(sequence: string): string[] {
  const cleared: string[] = [];
  if (!/[KR]{2}/.test(sequence)) cleared.push("Trypsin");
  if (!/[FYW]L/.test(sequence)) {
    cleared.push("Pepsin");
    cleared.push("Chymotrypsin");
  }
  if (!/D[GS]/.test(sequence)) cleared.push("Asp-Gly");
  if (!/N[GS]/.test(sequence)) cleared.push("Asn-Gly");
  if (!sequence.includes("M")) cleared.push("Met-oxidation");
  return cleared;
}

function refinementCycles(history: RefinementTurn[]): number {
  let maxTurn = 0;
  for (const entry of history) {
    if (entry.turn > maxTurn) maxTurn = entry.turn;
  }
  return maxTurn;
}

function neurosymbolicPayload(
  target: string,
  chargeTarget: number,
  candidate: string,
  audit: SymbolicAuditResult,
  history: RefinementTurn[],
  manifest: LabHandoffManifest
): ApiResponse {
  const grammar = parseKnottinGrammar(candidate);
  return {
    success: true,
    target,
    modality: MODALITY,
    neurosymbolic_provenance: {
      proposer_model: "Meta-Spark-1.3-Contributor",
      linguistic_paradigm: LINGUISTIC_PARADIGM,
      compiler_refinement_cycles: refinementCycles(history),
      refinement_trace: history,
    },
    candidate: {
      mature_sequence: candidate,
      topology: TOPOLOGY_LABEL,
      grammar_breakdown: grammar.loops,
    },
    symbolic_audit: {
      passed: audit.passed,
      length: audit.length,
      cys_count: audit.cys_count,
      charge: audit.formal_charge,
      charge_target: chargeTarget,
      gravy: audit.gravy_score,
      boman_index: audit.boman_index,
      aliphatic_index: audit.aliphatic_index,
      isoelectric_point: audit.isoelectric_point,
      mucosal_adhesion_ratio: audit.mucosal_adhesion_ratio,
      cleavage_susceptibility_index: audit.cleavage_susceptibility_index,
      liabilities_cleared: liabilitiesCleared(candidate),
      violations: audit.violations,
    },
    lab_handoff: {
      yeast_chassis: manifest.yeast_chassis,
      secretion_leader: manifest.secretion_leader,
      cDNA_sequence: manifest.cdna_sequence,
      gblock_manifest: manifest.dna_gblock,
      gibson_5p_arm: manifest.gibson_5p_arm,
      gibson_3p_arm: manifest.gibson_3p_arm,
      mature_fasta: manifest.mature_fasta,
      precursor_fasta: manifest.precursor_fasta,
      gc_content: manifest.gc_content,
      mw_da: manifest.mw_da,
      pi: manifest.pi,
      cai: manifest.cai,
      restriction_scrub: manifest.restriction_scrub,
      synthesis_order: manifest.synthesis_order,
    },
  } as unknown as ApiResponse;
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
      neurosymbolicPayload(
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
