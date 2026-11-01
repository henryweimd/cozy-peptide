import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import type { ApiResponse } from "../../../types/peptide";
import { validateRequestSafety } from "../../../lib/biosecurity";
import {
  DEMO_CHARGE_TARGET,
  DEMO_COOLDOWN_SECONDS,
  DEMO_PRESETS,
  isDemoPresetTarget,
} from "../../../lib/demo-config";
import {
  clientIpFromHeaders,
  demoCooldownRemaining,
  recordDemoCall,
} from "../../../lib/demo-cooldown";
import {
  NeurosymbolicVerificationError,
  generateVerifiedPeptide,
} from "../../../lib/meta-spark";
import { buildLabHandoff } from "../../../lib/lab-handoff";
import { hostLabel } from "../../../lib/hosts";
import { resolveDesignChoices } from "../../../lib/design-choices";
import {
  buildNeurosymbolicPayload,
  refinementCycles,
} from "../../../lib/neurosymbolic-payload";
import {
  buildRunRecord,
  recordRun,
  type RunRecord,
} from "../../../lib/db/runs";
import {
  buildAndCacheNarrative,
  narrativeInputFromRecord,
} from "../../../lib/research/report-cache";
import { guardCustomTarget } from "../../../lib/target-guard";
import {
  runWithRequestId,
  takeSparkFailures,
} from "../../../lib/spark-trace";

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Streaming twin of the demo endpoint for the landing page. Same guards
 * (preset allowlist, shared per-IP cooldown, biosecurity filter), but the
 * pipeline runs with telemetry: `stage` events stream as the run unfolds,
 * followed by a final `result` (or `error`) event. Served as
 * server-sent events over POST so the browser client can also read the
 * JSON error bodies on rejection statuses.
 */

const DemoStreamRequestSchema = z.object({
  target: z.string().min(1).max(500),
  charge_target: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
  modality: z
    .enum([
      "auto",
      "knottin-6c",
      "cyclotide-6c",
      "disulfide-4c",
      "hairpin-2c",
      "disulfide-2c",
      "helical",
      "linear",
    ])
    .optional(),
  host: z
    .enum([
      "auto",
      "sboulardii",
      "ecoli-nissle",
      "lactococcus-lactis",
      "bacillus-subtilis",
    ])
    .optional(),
  research: z.boolean().optional(),
});

function json(body: ApiResponse, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    return json(
      { success: false, error: "Invalid request: body must be valid JSON." },
      400
    );
  }

  const parsed = DemoStreamRequestSchema.safeParse(raw);
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

  const rawTarget = parsed.data.target.trim();
  const chargeTarget = parsed.data.charge_target ?? DEMO_CHARGE_TARGET;
  const researchEnabled = parsed.data.research ?? true;
  let target = rawTarget;
  let requestedTarget: string | undefined;
  if (!isDemoPresetTarget(rawTarget)) {
    const verdict = guardCustomTarget(rawTarget);
    if (!verdict.ok || verdict.target === undefined) {
      return json(
        {
          success: false,
          error: verdict.error ?? "Invalid target.",
          details: { presets: DEMO_PRESETS.map((preset) => preset.id) },
        },
        verdict.code ?? 400
      );
    }
    target = verdict.target;
    if (verdict.revised) requestedTarget = rawTarget;
  }
  const resolved = resolveDesignChoices(
    target,
    undefined,
    parsed.data.modality === "auto" ? undefined : parsed.data.modality,
    parsed.data.host === "auto" ? undefined : parsed.data.host
  );
  const designModality = resolved.modality;
  const designHost = resolved.host;
  const designChoices = resolved.choices;
  const runParams = {
    target,
    ...(requestedTarget !== undefined
      ? { requested_target: requestedTarget }
      : {}),
    charge_target: chargeTarget,
    ...resolved.params,
    research: researchEnabled,
  };

  const safety = validateRequestSafety(target);
  if (!safety.safe) {
    return json(
      {
        success: false,
        error: "Forbidden: request blocked by the biosecurity filter.",
        details: { diagnostic: safety.reason },
      },
      403
    );
  }

  const ip = clientIpFromHeaders(request.headers);
  const retryAfter = demoCooldownRemaining(ip);
  if (retryAfter > 0) {
    return json(
      {
        success: false,
        error: `Demo cooldown: one design per minute per visitor. Try again in ${retryAfter}s.`,
        details: {
          retry_after_seconds: retryAfter,
          cooldown_seconds: DEMO_COOLDOWN_SECONDS,
        },
      },
      429
    );
  }
  recordDemoCall(ip);

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
          research,
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
            modality: designModality,
            host: designHost,
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
          undefined,
          research,
          requestedTarget,
          designChoices
        );
        send("result", payload);
        const record = buildRunRecord({
          source: "demo-stream",
          params: runParams,
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
              refinement_trace: error.refinementHistory,
            },
          };
          send("error", body);
          await recordRun(
            buildRunRecord({
              source: "demo-stream",
              params: runParams,
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
            error:
              "Upstream generation failed: Meta Spark 1.3 Contributor API error.",
            details: { message },
          };
          send("error", body);
          await recordRun(
            buildRunRecord({
              source: "demo-stream",
              params: runParams,
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
