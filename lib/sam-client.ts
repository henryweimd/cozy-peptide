import OpenAI from "openai";
import {
  decodeMaskToRLE,
  decodeMaskToRaster,
  decodeMaskToSVGPath,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
  type SegmentationMaskRecord,
} from "@meta-sam/parser";

/**
 * SAM 3.1 concept segmentation over the Meta Model API's OpenAI-compatible
 * Responses surface. One model request per concept; the @meta-sam/parser
 * package owns all output-grammar parsing — this module never hand-parses
 * the wire format, it only normalizes parser records into app shapes.
 */

export const SAM_MODEL = "sam-3.1";
export const SAM_MAX_CONCEPTS = 4;
export const SAM_TIMEOUT_MS = 55000;
export const SAM_DEFAULT_BASE_URL = "https://api.meta.ai/v1";

export function getSamApiKey(): string | null {
  const key = process.env.MODEL_API_KEY ?? process.env.META_API_KEY;
  return key !== undefined && key.length > 0 ? key : null;
}

export function getSamBaseUrl(): string {
  const override = process.env.SAM_API_BASE_URL;
  if (override !== undefined && override.trim().length > 0) {
    return override.trim().replace(/\/+$/, "");
  }
  return SAM_DEFAULT_BASE_URL;
}

export interface SamBox {
  objectId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  confidence?: number;
}

export interface SamMask {
  objectId: string;
  rle: { size: [number, number]; counts: string };
  bounds: { left: number; top: number; right: number; bottom: number };
  foregroundPixels: number;
  confidence?: number;
}

export interface ConceptSegmentation {
  concept: string;
  boxes: SamBox[];
  masks: SamMask[];
  /** Sum of foreground pixels across decoded masks. */
  foreground_pixels: number;
  /** Number of segmented instances (masks). Zero is valid, not an error. */
  count: number;
  /** Overlay-ready SVG in frame coordinates, "" when nothing to draw. */
  maskSvg: string;
  width: number | null;
  height: number | null;
  droppedMasks: number;
  /** True when dims fell back to the content extent (client sent none). */
  dimsFromContent: boolean;
}

export class SamUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SamUpstreamError";
  }
}

export type SamEventSource = (
  imageDataUrl: string,
  concept: string
) => Promise<AsyncIterable<ResponsesEvent>>;

/**
 * One SAM request for one concept. Concept must be a short noun phrase
 * ("cell nuclei"), never a command — that constraint comes from the model.
 */
export async function requestSamEvents(
  imageDataUrl: string,
  concept: string
): Promise<AsyncIterable<ResponsesEvent>> {
  const apiKey = getSamApiKey();
  if (apiKey === null) {
    throw new SamUpstreamError("MODEL_API_KEY is not set.");
  }
  const client = new OpenAI({ apiKey, baseURL: getSamBaseUrl() });
  const stream = await client.responses.create(
    {
      model: SAM_MODEL,
      stream: true,
      metadata: { include_confidence: "true" },
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: concept },
            { type: "input_image", image_url: imageDataUrl, detail: "high" },
          ],
        },
      ],
    },
    { timeout: SAM_TIMEOUT_MS }
  );
  return stream as unknown as AsyncIterable<ResponsesEvent>;
}

function countOnes(raster: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < raster.length; i += 1) {
    count += raster[i] ?? 0;
  }
  return count;
}

function buildMaskSvg(
  paths: Array<{ d: string; x: number; y: number }>,
  width: number | null,
  height: number | null
): string {
  if (paths.length === 0 || width === null || height === null) return "";
  const inner = paths
    .map(
      (p) =>
        `<path d="${p.d}" transform="translate(${p.x} ${p.y})" fill="rgba(37,99,235,0.35)" stroke="#2563eb" stroke-width="2"/>`
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${inner}</svg>`
  );
}

export async function segmentConcept(
  imageDataUrl: string,
  concept: string,
  options: {
    width?: number | null;
    height?: number | null;
    requestEvents?: SamEventSource;
  } = {}
): Promise<ConceptSegmentation> {
  const requestEvents = options.requestEvents ?? requestSamEvents;
  const events = await requestEvents(imageDataUrl, concept);
  const result = await parseImageStream(events).finalResult;
  if (result.outcome.status !== "completed") {
    throw new SamUpstreamError(
      `SAM response did not complete: ${JSON.stringify(result.outcome)}`
    );
  }
  const boxes: SamBox[] = recordsOfKind(result.records, "box").map((b) => ({
    objectId: b.objectId,
    left: b.left,
    top: b.top,
    right: b.right,
    bottom: b.bottom,
    ...(b.confidence !== undefined ? { confidence: b.confidence } : {}),
  }));
  const masks: SamMask[] = [];
  const paths: Array<{ d: string; x: number; y: number }> = [];
  let droppedMasks = 0;
  const maskRecords: readonly SegmentationMaskRecord[] = recordsOfKind(
    result.records,
    "mask"
  );
  for (const record of maskRecords) {
    try {
      const raster = decodeMaskToRaster(record.mask);
      const rle = decodeMaskToRLE(record.mask);
      const path = decodeMaskToSVGPath(record.mask);
      masks.push({
        objectId: record.objectId,
        rle: { size: [rle.size[0], rle.size[1]], counts: rle.counts },
        bounds: {
          left: record.bounds.left,
          top: record.bounds.top,
          right: record.bounds.right,
          bottom: record.bounds.bottom,
        },
        foregroundPixels: countOnes(raster),
        ...(record.confidence !== undefined
          ? { confidence: record.confidence }
          : {}),
      });
      if (path !== "") {
        paths.push({ d: path, x: record.bounds.left, y: record.bounds.top });
      }
    } catch {
      droppedMasks += 1;
    }
  }
  // Frame size comes from the client-measured image; fall back to the
  // content extent only when the caller didn't supply dimensions.
  let width = options.width ?? null;
  let height = options.height ?? null;
  let dimsFromContent = false;
  if ((width === null || height === null) && boxes.length > 0) {
    width = boxes.reduce((m, b) => Math.max(m, b.right), 0);
    height = boxes.reduce((m, b) => Math.max(m, b.bottom), 0);
    dimsFromContent = true;
  }
  const foreground_pixels = masks.reduce(
    (sum, m) => sum + m.foregroundPixels,
    0
  );
  return {
    concept,
    boxes,
    masks,
    foreground_pixels,
    count: masks.length,
    maskSvg: buildMaskSvg(paths, width, height),
    width,
    height,
    droppedMasks,
    dimsFromContent,
  };
}
