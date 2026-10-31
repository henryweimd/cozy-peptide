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

/**
 * Per-instance last-call timestamps by client IP. Best-effort on
 * serverless (each instance tracks its own map); sufficient to pace a
 * hackathon demo and protect the upstream API budget.
 */
const lastCallByIp = new Map<string, number>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  return "unknown";
}

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

  const target = parsed.data.target.trim();
  if (!isDemoPresetTarget(target)) {
    return json(
      {
        success: false,
        error: "Demo accepts preset conditions only.",
        details: { presets: DEMO_PRESETS.map((preset) => preset.id) },
      },
      400
    );
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

  const now = Date.now();
  const windowMs = DEMO_COOLDOWN_SECONDS * 1000;
  for (const [ip, at] of lastCallByIp) {
    if (now - at >= windowMs) lastCallByIp.delete(ip);
  }
  const ip = clientIp(request);
  const last = lastCallByIp.get(ip);
  if (last !== undefined) {
    const retryAfter = Math.ceil((last + windowMs - now) / 1000);
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
  }
  lastCallByIp.set(ip, now);

  try {
    const { candidate, audit, refinementHistory } =
      await generateVerifiedPeptide(target, DEMO_CHARGE_TARGET);
    const manifest = buildLabHandoff(candidate);
    return json(
      buildNeurosymbolicPayload(
        target,
        DEMO_CHARGE_TARGET,
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
