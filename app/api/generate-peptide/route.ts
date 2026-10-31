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
import type { Modality } from "../../../lib/modality";
import { buildRunRecord, recordRun } from "../../../lib/db/runs";
import {
  buildNeurosymbolicPayload,
  refinementCycles,
} from "../../../lib/neurosymbolic-payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

/**
 * Authenticated peptide generation. Pass `?stream=1` (or
 * `Accept: text/event-stream`) for server-sent `stage` events as the run
 * unfolds — research, propose, verify, repair, handoff — followed by a
 * final `result` (or `error`) event, so callers can drive progress UI
 * and pinpoint which stage failed. The plain JSON response carries the
 * same outcome plus `research_provenance` either way.
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

  const { target, mechanism, charge_target, modality, model, research } =
    parsed.data;
  const chargeTarget = charge_target ?? 4;
  const designModality = modality ?? "knottin-6c";
  const designModel = model ?? META_SPARK_MODEL;
  const researchEnabled = research ?? true;
  const screeningText = `${target}\n${mechanism ?? ""}`.trim();

  const safety = validateRequestSafety(
    screeningText,
    extractRequestedLength(screeningText)
  );
  if (!safety.safe) {
    if (safety.category === "off-site") {
      return json(
        {
          success: false,
          error:
            "Unprocessable target: gut-secreted peptides cannot plausibly treat distant organs.",
          details: {
            diagnostic: safety.reason,
            modality: "gut-delivered peptides, 8-36 amino acids",
          },
        },
        422
      );
    }
    if (safety.category === "catalytic-enzyme") {
      return json(
        {
          success: false,
          error:
            "Unprocessable target: catalytic enzymes are outside the short-peptide modalities.",
          details: {
            diagnostic: safety.reason,
            modality: "gut-delivered peptides, 8-36 amino acids",
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

  const query = request.nextUrl?.searchParams;
  const wantsStream =
    query?.get("stream") === "1" ||
    (request.headers.get("accept") ?? "").includes("text/event-stream");
  if (wantsStream) {
    return streamGeneration(
      target,
      chargeTarget,
      designModality,
      designModel,
      mechanism,
      researchEnabled
    );
  }

  const startedAt = Date.now();
  const runParams = {
    target,
    mechanism,
    charge_target: chargeTarget,
    modality: designModality,
    model: designModel,
    research: researchEnabled,
  };
  // Plain responses skip SSE but keep the same ledger trace.
  const stageTrace: unknown[] = [];
  try {
    const {
      candidate,
      audit,
      refinementHistory,
      agentTools,
      targetClass,
      research: researchProvenance,
    } = await generateVerifiedPeptide(
      target,
      chargeTarget,
      3,
      (pipelineEvent) => {
        stageTrace.push({
          ...pipelineEvent,
          elapsedMs: Date.now() - startedAt,
        });
      },
      {
        modality: designModality,
        mechanism,
        model: designModel,
        research: { enabled: researchEnabled },
      }
    );
    stageTrace.push({
      stage: "handoff",
      turn: refinementCycles(refinementHistory),
      message: "Compiling yeast secretion cassette…",
      elapsedMs: Date.now() - startedAt,
    });
    const manifest = buildLabHandoff(candidate, designModality);
    const payload = buildNeurosymbolicPayload(
      target,
      chargeTarget,
      candidate,
      audit,
      refinementHistory,
      manifest,
      designModality,
      agentTools,
      targetClass,
      designModel,
      researchProvenance
    );
    await recordRun(
      buildRunRecord({
        source: "api",
        params: runParams,
        elapsedMs: Date.now() - startedAt,
        ok: true,
        payload,
        stageTrace,
      })
    );
    return json(payload, 200);
  } catch (error) {
    if (error instanceof NeurosymbolicVerificationError) {
      const body = {
        success: false,
        error:
          "Upstream generation failed: no candidate passed neurosymbolic verification.",
        details: {
          message: error.message,
          proposer_model: designModel,
          compiler_refinement_cycles: refinementCycles(
            error.refinementHistory
          ),
          refinement_trace: error.refinementHistory,
        },
      };
      await recordRun(
        buildRunRecord({
          source: "api",
          params: runParams,
          elapsedMs: Date.now() - startedAt,
          ok: false,
          payload: body,
          errorMessage: error.message,
          stageTrace,
        })
      );
      return json(body, 502);
    }
    const message = error instanceof Error ? error.message : String(error);
    const body = {
      success: false,
      error: `Upstream generation failed: ${designModel} API error.`,
      details: { message },
    };
    await recordRun(
      buildRunRecord({
        source: "api",
        params: runParams,
        elapsedMs: Date.now() - startedAt,
        ok: false,
        payload: body,
        errorMessage: message,
        stageTrace,
      })
    );
    return json(body, 502);
  }
}

function streamGeneration(
  target: string,
  chargeTarget: number,
  modality: Modality,
  model: string,
  mechanism: string | undefined,
  researchEnabled: boolean
): NextResponse {
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      // The ledger keeps the same stage timeline the caller watched.
      const stageTrace: unknown[] = [];
      const sendStage = (data: unknown): void => {
        stageTrace.push(data);
        send("stage", data);
      };
      try {
        const {
          candidate,
          audit,
          refinementHistory,
          agentTools,
          targetClass,
          research: researchProvenance,
        } = await generateVerifiedPeptide(
          target,
          chargeTarget,
          3,
          (pipelineEvent) =>
            sendStage({
              ...pipelineEvent,
              elapsedMs: Date.now() - startedAt,
            }),
          {
            modality,
            mechanism,
            model,
            research: { enabled: researchEnabled },
          }
        );
        sendStage({
          stage: "handoff",
          turn: refinementCycles(refinementHistory),
          message: "Compiling yeast secretion cassette…",
          elapsedMs: Date.now() - startedAt,
        });
        const manifest = buildLabHandoff(candidate, modality);
        const payload = buildNeurosymbolicPayload(
          target,
          chargeTarget,
          candidate,
          audit,
          refinementHistory,
          manifest,
          modality,
          agentTools,
          targetClass,
          model,
          researchProvenance
        );
        send("result", payload);
        await recordRun(
          buildRunRecord({
            source: "api-stream",
            params: {
              target,
              mechanism,
              charge_target: chargeTarget,
              modality,
              model,
              research: researchEnabled,
            },
            elapsedMs: Date.now() - startedAt,
            ok: true,
            payload,
            stageTrace,
          })
        );
      } catch (error) {
        if (error instanceof NeurosymbolicVerificationError) {
          const body = {
            success: false,
            error:
              "Upstream generation failed: no candidate passed neurosymbolic verification.",
            details: {
              message: error.message,
              proposer_model: model,
              compiler_refinement_cycles: refinementCycles(
                error.refinementHistory
              ),
              refinement_trace: error.refinementHistory,
            },
          };
          send("error", body);
          await recordRun(
            buildRunRecord({
              source: "api-stream",
              params: {
                target,
                mechanism,
                charge_target: chargeTarget,
                modality,
                model,
                research: researchEnabled,
              },
              elapsedMs: Date.now() - startedAt,
              ok: false,
              payload: body,
              errorMessage: error.message,
              stageTrace,
            })
          );
        } else {
          const message =
            error instanceof Error ? error.message : String(error);
          const body = {
            success: false,
            error: `Upstream generation failed: ${model} API error.`,
            details: { message },
          };
          send("error", body);
          await recordRun(
            buildRunRecord({
              source: "api-stream",
              params: {
                target,
                mechanism,
                charge_target: chargeTarget,
                modality,
                model,
                research: researchEnabled,
              },
              elapsedMs: Date.now() - startedAt,
              ok: false,
              payload: body,
              errorMessage: message,
              stageTrace,
            })
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
