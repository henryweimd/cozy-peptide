import { NextResponse, type NextRequest } from "next/server";
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
import {
  buildNeurosymbolicPayload,
  refinementCycles,
} from "../../../lib/neurosymbolic-payload";
import { buildRunRecord, recordRun } from "../../../lib/db/runs";
import { guardCustomTarget } from "../../../lib/target-guard";

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
    .enum(["knottin-6c", "disulfide-4c", "disulfide-2c", "linear"])
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
  const designModality = parsed.data.modality ?? "knottin-6c";
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
  const runParams = {
    target,
    ...(requestedTarget !== undefined
      ? { requested_target: requestedTarget }
      : {}),
    charge_target: chargeTarget,
    modality: designModality,
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
      const send = (event: string, data: unknown): void => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
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
            send("stage", {
              ...pipelineEvent,
              elapsedMs: Date.now() - startedAt,
            }),
          {
            modality: designModality,
            research: { enabled: researchEnabled },
          }
        );
        send("stage", {
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
          undefined,
          research,
          requestedTarget
        );
        send("result", payload);
        await recordRun(
          buildRunRecord({
            source: "demo-stream",
            params: runParams,
            elapsedMs: Date.now() - startedAt,
            ok: true,
            payload,
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
