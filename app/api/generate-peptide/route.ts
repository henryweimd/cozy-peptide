import { NextResponse, after, type NextRequest } from "next/server";
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
import { hostLabel, type HostId } from "../../../lib/hosts";
import { resolveDesignChoices } from "../../../lib/design-choices";
import type { DesignChoiceContext } from "../../../lib/neurosymbolic-payload";
import {
  buildRunRecord,
  recordRun,
  type RunRecord,
} from "../../../lib/db/runs";
import {
  buildAndCacheNarrative,
  narrativeInputFromRecord,
} from "../../../lib/research/report-cache";
import {
  runWithRequestId,
  takeSparkFailures,
} from "../../../lib/spark-trace";
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

/**
 * Pre-generates the brief narrative after the response, so opening
 * the literature brief later serves instantly. No-op when the run
 * was not recorded or has nothing to synthesize from.
 */
function scheduleNarrative(runId: string | null, record: RunRecord): void {
  if (runId === null) return;
  const input = narrativeInputFromRecord(record);
  if (input === null) return;
  after(() => {
    void buildAndCacheNarrative(runId, input);
  });
}

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
  const { result } = runWithRequestId(() => handlePost(request));
  return result;
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
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

  const { target, mechanism, charge_target, modality, host, model, research } =
    parsed.data;
  const chargeTarget = charge_target ?? 4;
  const resolved = resolveDesignChoices(
    target,
    mechanism,
    modality === "auto" ? undefined : modality,
    host === "auto" ? undefined : host
  );
  const designModality = resolved.modality;
  const designHost = resolved.host;
  const designChoices = resolved.choices;
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
            modality: "gut-delivered peptides, 8-37 amino acids",
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
            modality: "gut-delivered peptides, 8-37 amino acids",
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
      designHost,
      designChoices,
      designModel,
      mechanism,
      researchEnabled,
      resolved.params
    );
  }

  const startedAt = Date.now();
  const runParams = {
    target,
    mechanism,
    charge_target: chargeTarget,
    ...resolved.params,
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
        host: designHost,
        mechanism,
        model: designModel,
        research: { enabled: researchEnabled },
      }
    );
    stageTrace.push({
      stage: "containment",
      turn: refinementCycles(refinementHistory),
      message: "Screening biocontainment and plasmid stability…",
      elapsedMs: Date.now() - startedAt,
    });
    stageTrace.push({
      stage: "handoff",
      turn: refinementCycles(refinementHistory),
      message:
        designHost === "sboulardii"
          ? "Compiling yeast secretion cassette…"
          : `Compiling ${hostLabel(designHost)} expression fragment…`,
      elapsedMs: Date.now() - startedAt,
    });
    const manifest = buildLabHandoff(candidate, designModality, designHost);
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
      researchProvenance,
      undefined,
      designChoices
    );
    const record = buildRunRecord({
      source: "api",
      params: runParams,
      elapsedMs: Date.now() - startedAt,
      ok: true,
      payload,
      stageTrace,
      sparkFailures: takeSparkFailures(),
    });
    const runId = await recordRun(record);
    scheduleNarrative(runId, record);
    return json(runId === null ? payload : { ...payload, run_id: runId }, 200);
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
          sparkFailures: takeSparkFailures(),
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
        sparkFailures: takeSparkFailures(),
      })
    );
    return json(body, 502);
  }
}

function streamGeneration(
  target: string,
  chargeTarget: number,
  modality: Modality,
  host: HostId,
  choices: DesignChoiceContext,
  model: string,
  mechanism: string | undefined,
  researchEnabled: boolean,
  choiceParams: {
    modality: Modality;
    modality_requested: Modality | "auto";
    modality_reason?: string;
    host: HostId;
    host_requested: HostId | "auto";
    host_reason?: string;
  }
): NextResponse {
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await runWithRequestId(async () => {
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
            host,
            mechanism,
            model,
            research: { enabled: researchEnabled },
          }
        );
        sendStage({
          stage: "containment",
          turn: refinementCycles(refinementHistory),
          message: "Screening biocontainment and plasmid stability…",
          elapsedMs: Date.now() - startedAt,
        });
        sendStage({
          stage: "handoff",
          turn: refinementCycles(refinementHistory),
          message:
            host === "sboulardii"
              ? "Compiling yeast secretion cassette…"
              : `Compiling ${hostLabel(host)} expression fragment…`,
          elapsedMs: Date.now() - startedAt,
        });
        const manifest = buildLabHandoff(candidate, modality, host);
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
          researchProvenance,
          undefined,
          choices
        );
        send("result", payload);
        const record = buildRunRecord({
          source: "api-stream",
          params: {
            target,
            mechanism,
            charge_target: chargeTarget,
            ...choiceParams,
            model,
            research: researchEnabled,
          },
          elapsedMs: Date.now() - startedAt,
          ok: true,
          payload,
          stageTrace,
          sparkFailures: takeSparkFailures(),
        });
        const runId = await recordRun(record);
        if (runId !== null) send("run", { runId });
        scheduleNarrative(runId, record);
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
                ...choiceParams,
                model,
                research: researchEnabled,
              },
              elapsedMs: Date.now() - startedAt,
              ok: false,
              payload: body,
              errorMessage: error.message,
              stageTrace,
              sparkFailures: takeSparkFailures(),
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
                ...choiceParams,
                model,
                research: researchEnabled,
              },
              elapsedMs: Date.now() - startedAt,
              ok: false,
              payload: body,
              errorMessage: message,
              stageTrace,
              sparkFailures: takeSparkFailures(),
            })
          );
        }
      } finally {
        controller.close();
      }
      }).result;
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
