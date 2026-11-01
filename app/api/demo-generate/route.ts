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
import { guardCustomTarget } from "../../../lib/target-guard";
import {
  runWithRequestId,
  takeSparkFailures,
} from "../../../lib/spark-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Public, unauthenticated demo endpoint for the landing page. Abuse is
 * contained three ways: requests must match the preset allowlist, each
 * client IP is held to one generation per cooldown window, and the
 * biosecurity filter still screens every target. The bearer token never
 * leaves the server: this route calls the pipeline directly.
 */

const DemoRequestSchema = z.object({
  target: z.string().min(1).max(500),
});

function json(body: ApiResponse, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { result } = runWithRequestId(() => handlePost(request));
  return result;
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    return json(
      { success: false, error: "Invalid request: body must be valid JSON." },
      400
    );
  }

  const parsed = DemoRequestSchema.safeParse(raw);
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

  const startedAt = Date.now();
  const runParams = {
    target,
    ...(requestedTarget !== undefined
      ? { requested_target: requestedTarget }
      : {}),
    charge_target: DEMO_CHARGE_TARGET,
    modality: "knottin-6c",
    research: true,
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
      research,
    } = await generateVerifiedPeptide(
      target,
      DEMO_CHARGE_TARGET,
      3,
      (pipelineEvent) => {
        stageTrace.push({
          ...pipelineEvent,
          elapsedMs: Date.now() - startedAt,
        });
      },
      {
        research: { enabled: true },
      }
    );
    stageTrace.push({
      stage: "handoff",
      turn: refinementCycles(refinementHistory),
      message: "Compiling yeast secretion cassette…",
      elapsedMs: Date.now() - startedAt,
    });
    const manifest = buildLabHandoff(candidate);
    const payload = buildNeurosymbolicPayload(
      target,
      DEMO_CHARGE_TARGET,
      candidate,
      audit,
      refinementHistory,
      manifest,
      "knottin-6c",
      agentTools,
      targetClass,
      undefined,
      research,
      requestedTarget
    );
    const record = buildRunRecord({
      source: "demo",
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
          compiler_refinement_cycles: refinementCycles(
            error.refinementHistory
          ),
          refinement_trace: error.refinementHistory,
        },
      };
      await recordRun(
        buildRunRecord({
          source: "demo",
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
      error:
        "Upstream generation failed: Meta Spark 1.3 Contributor API error.",
      details: { message },
    };
    await recordRun(
      buildRunRecord({
        source: "demo",
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
