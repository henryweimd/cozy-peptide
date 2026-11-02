import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import type { ApiResponse } from "../../../types/peptide";
import {
  SAM_MAX_CONCEPTS,
  SAM_MODEL,
  SamUpstreamError,
  getSamApiKey,
  segmentConcept,
} from "../../../lib/sam-client";
import {
  croPublicUrl,
  fetchCroAnalysesForRun,
  findCachedAnalysis,
  findDemoRunId,
  isCroStoreConfigured,
  resolveDemoRunId,
  saveCroAnalysis,
  uploadCroImage,
} from "../../../lib/db/cro-analyses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Rejects data URLs decoding to more than 20 MiB. */
export const ANALYZE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const MAX_CONCEPT_LENGTH = 120;
const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function json(body: ApiResponse, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

function checkRouteAuth(request: NextRequest): NextResponse | null {
  const serverToken = process.env.API_BEARER_TOKEN;
  if (serverToken === undefined || serverToken.length === 0) {
    return json(
      { success: false, error: "Server misconfiguration: API_BEARER_TOKEN is not set." },
      500
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${serverToken}`) {
    return json(
      { success: false, error: "Unauthorized: invalid or missing Bearer [REDACTED]" },
      401
    );
  }
  return null;
}

function parseDataUrl(value: unknown): { mime: string; base64: string } | null {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(
    value.trim()
  );
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  return { mime: match[1], base64: match[2] };
}

function decodedBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

function extensionFor(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "png";
}

let cachedDemoBytes: Buffer | null | undefined;

/**
 * True only when the upload is byte-identical to the shipped demo asset.
 * The demo bypass is gated on pixels, never on a client-sent flag, and
 * fails closed when the asset is missing.
 */
export function isDemoImage(base64: string, mime: string): boolean {
  if (mime !== "image/png") return false;
  if (cachedDemoBytes === undefined) {
    try {
      cachedDemoBytes = readFileSync(
        path.join(process.cwd(), "public", "demo", "cro-demo-nuclei.png")
      );
    } catch {
      cachedDemoBytes = null;
    }
  }
  if (cachedDemoBytes === null) return false;
  return Buffer.from(base64, "base64").equals(cachedDemoBytes);
}

/** Cache identity for a concept: case-insensitive, whitespace-insensitive. */
export function normalizeConcept(concept: string): string {
  return concept.trim().toLowerCase();
}

function asConcepts(value: unknown): string[] | null {
  const list =
    typeof value === "string"
      ? [value]
      : Array.isArray(value)
        ? value
        : null;
  if (list === null) return null;
  const cleaned = list
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => normalizeConcept(entry))
    .filter((entry) => entry.length > 0);
  if (cleaned.length === 0 || cleaned.length > SAM_MAX_CONCEPTS) return null;
  if (cleaned.some((entry) => entry.length > MAX_CONCEPT_LENGTH)) return null;
  return [...new Set(cleaned)];
}

function sha256Hex(base64: string): string {
  return createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");
}

/**
 * Public status plus per-run history.
 * GET /api/analyze-image -> { configured, model }
 * GET /api/analyze-image?run=demo -> { analyses } (public demo ledger)
 * GET /api/analyze-image?run=<uuid> (Bearer [REDACTED] -> { analyses }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const runParam = request.nextUrl?.searchParams.get("run") ?? "";
  if (runParam === "") {
    return json(
      {
        success: true,
        data: { configured: getSamApiKey() !== null, model: SAM_MODEL },
      },
      200
    );
  }
  if (runParam === "demo") {
    // Public demo ledger, read-only: never creates the demo run.
    if (!isCroStoreConfigured()) {
      return json({ success: false, error: "Ledger unavailable." }, 503);
    }
    const demoId = await findDemoRunId();
    if (demoId === null) {
      return json({ success: true, data: { analyses: [] } }, 200);
    }
    return historyResponse(demoId);
  }
  const auth = checkRouteAuth(request);
  if (auth !== null) return auth;
  if (!UUID_RE.test(runParam)) {
    return json(
      { success: false, error: "Invalid request: run must be a UUID." },
      400
    );
  }
  return historyResponse(runParam);
}

async function historyResponse(runId: string): Promise<NextResponse> {
  const rows = await fetchCroAnalysesForRun(runId, 10);
  if (rows === null) {
    return json({ success: false, error: "Ledger unavailable." }, 503);
  }
  return json(
    {
      success: true,
      data: {
        analyses: rows.map((row) => ({
          id: row.id,
          createdAt: row.created_at,
          runId: row.run_id,
          imageUrl: croPublicUrl(row.image_path),
          concepts: row.concepts,
          samModel: row.sam_model,
          boxes: row.boxes,
          masks: row.masks,
          foregroundPixels: row.foreground_pixels,
          count: row.count,
          maskSvg: row.mask_svg,
          summary: row.summary,
        })),
      },
    },
    200
  );
}

/**
 * Segment one image per concept: { imageDataUrl, concepts|concept, runId?, width?, height? }.
 * One SAM request per concept; multi-concept callers combine results client-side.
 * Single-concept posts return the flat per-concept shape; multi-concept posts
 * return { results }. runId persists to the ledger; omitted runId is ephemeral.
 * The byte-identical demo image analyzes without a Bearer [REDACTED] may only
 * land in the demo ledger (or stay ephemeral); everything else needs auth.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid request: malformed JSON." }, 400);
  }
  const record =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  const image = parseDataUrl(record?.["imageDataUrl"]);
  if (image === null) {
    return json(
      { success: false, error: "Invalid request: imageDataUrl must be a base64 image data URL." },
      400
    );
  }
  if (decodedBytes(image.base64) > ANALYZE_IMAGE_MAX_BYTES) {
    return json(
      { success: false, error: "Image exceeds the 20 MiB limit." },
      413
    );
  }
  const concepts = asConcepts(
    record?.["concepts"] ?? record?.["concept"]
  );
  if (concepts === null) {
    return json(
      {
        success: false,
        error: `Invalid request: provide 1-${SAM_MAX_CONCEPTS} short noun-phrase concepts.`,
      },
      400
    );
  }
  const runIdRaw = record?.["runId"];
  const runIdParam =
    runIdRaw === undefined || runIdRaw === null || runIdRaw === ""
      ? null
      : typeof runIdRaw === "string" && (runIdRaw === "demo" || UUID_RE.test(runIdRaw))
        ? runIdRaw
        : "invalid";
  if (runIdParam === "invalid") {
    return json(
      { success: false, error: "Invalid request: runId must be a UUID or \"demo\"." },
      400
    );
  }
  const widthRaw = record?.["width"];
  const heightRaw = record?.["height"];
  const width =
    typeof widthRaw === "number" && Number.isInteger(widthRaw) && widthRaw > 0
      ? widthRaw
      : null;
  const height =
    typeof heightRaw === "number" && Number.isInteger(heightRaw) && heightRaw > 0
      ? heightRaw
      : null;
  const demoPixels = isDemoImage(image.base64, image.mime);
  const authed = checkRouteAuth(request) === null;
  if (!demoPixels && !authed) {
    const auth = checkRouteAuth(request);
    if (auth !== null) return auth;
  }
  if (demoPixels && !authed && runIdParam !== null && runIdParam !== "demo") {
    return json(
      {
        success: false,
        error: "Unauthorized: demo checks without a token stay ephemeral or use the demo ledger.",
      },
      401
    );
  }
  if (getSamApiKey() === null) {
    return json(
      {
        success: false,
        error: "SAM unavailable: set MODEL_API_KEY or META_API_KEY on the server.",
      },
      503
    );
  }
  // Resolve the demo sentinel before spending model calls.
  let runId: string | null = runIdParam;
  if (runIdParam === "demo") {
    runId = await resolveDemoRunId();
    if (runId === null) {
      return json(
        { success: false, error: "Demo ledger unavailable." },
        503
      );
    }
  }
  const imageSha256 = sha256Hex(image.base64);
  const dataUrl = `data:${image.mime};base64,${image.base64}`;
  const results: PerConceptResult[] = [];
  let imagePath: string | null = null;
  for (const concept of concepts) {
    const hit = await findCachedAnalysis(imageSha256, concept, SAM_MODEL);
    if (hit !== null && runId !== null && hit.run_id === runId) {
      // This run already holds this exact segmentation: pure reload.
      results.push({
        concept,
        boxes: hit.boxes,
        masks: hit.masks,
        foreground_pixels: hit.foreground_pixels,
        count: hit.count,
        maskSvg: hit.mask_svg,
        width: hit.width ?? width,
        height: hit.height ?? height,
        cached: true,
        savedId: hit.id,
      });
      continue;
    }
    let boxes: unknown[];
    let masks: unknown[];
    let foreground_pixels: number;
    let count: number;
    let maskSvg: string;
    let resultWidth: number | null;
    let resultHeight: number | null;
    let droppedMasks = 0;
    const cached = hit !== null;
    if (hit !== null) {
      boxes = hit.boxes;
      masks = hit.masks;
      foreground_pixels = hit.foreground_pixels;
      count = hit.count;
      maskSvg = hit.mask_svg;
      resultWidth = hit.width ?? width;
      resultHeight = hit.height ?? height;
    } else {
      let fresh;
      try {
        fresh = await segmentConcept(dataUrl, concept, { width, height });
      } catch (error) {
        const detail =
          error instanceof SamUpstreamError
            ? error.message
            : error instanceof Error
              ? error.name
              : "unknown";
        return json(
          {
            success: false,
            error: `Segmentation upstream failed: ${detail}`,
            data: { results },
          },
          502
        );
      }
      boxes = fresh.boxes.map((b) => ({ concept, ...b }));
      masks = fresh.masks.map((m) => ({ concept, ...m }));
      foreground_pixels = fresh.foreground_pixels;
      count = fresh.count;
      maskSvg = fresh.maskSvg;
      resultWidth = fresh.width;
      resultHeight = fresh.height;
      droppedMasks = fresh.droppedMasks;
    }
    let savedId: string | null = null;
    if (runId !== null) {
      if (imagePath === null) {
        imagePath = `${runId}/${randomUUID()}.${extensionFor(image.mime)}`;
        const uploaded = await uploadCroImage(imagePath, image.base64, image.mime);
        if (!uploaded.ok) {
          return json(
            {
              success: false,
              error: `Segmentation succeeded but the image store failed: ${uploaded.error ?? "unknown"}`,
              data: { results },
            },
            503
          );
        }
      }
      const saved = await saveCroAnalysis({
        run_id: runId,
        image_path: imagePath,
        image_sha256: imageSha256,
        concepts: [concept],
        sam_model: SAM_MODEL,
        boxes,
        masks,
        foreground_pixels,
        count,
        mask_svg: maskSvg,
        summary: {
          perConcept: [{ concept, count, foreground_pixels, droppedMasks }],
          width: resultWidth,
          height: resultHeight,
        },
      });
      if (!saved.saved) {
        return json(
          {
            success: false,
            error: `Segmentation succeeded but the ledger write failed: ${saved.error ?? "unknown"}`,
            data: { results },
          },
          503
        );
      }
      savedId = saved.id ?? null;
    }
    results.push({
      concept,
      boxes,
      masks,
      foreground_pixels,
      count,
      maskSvg,
      width: resultWidth,
      height: resultHeight,
      cached,
      savedId,
    });
  }
  return singleOrBatch(concepts, results, runId);
}

interface PerConceptResult {
  concept: string;
  boxes: unknown[];
  masks: unknown[];
  foreground_pixels: number;
  count: number;
  maskSvg: string;
  width: number | null;
  height: number | null;
  cached: boolean;
  savedId: string | null;
}

function singleOrBatch(
  concepts: string[],
  results: PerConceptResult[],
  runId: string | null
): NextResponse {
  if (concepts.length === 1 && results[0] !== undefined) {
    const only = results[0];
    return json(
      {
        success: true,
        data: {
          concept: only.concept,
          boxes: only.boxes,
          masks: only.masks,
          foreground_pixels: only.foreground_pixels,
          count: only.count,
          maskSvg: only.maskSvg,
          width: only.width,
          height: only.height,
          cached: only.cached,
          saved: only.savedId !== null ? { id: only.savedId } : null,
          runId,
        },
      },
      200
    );
  }
  return json({ success: true, data: { results, runId } }, 200);
}
