import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { ApiResponse } from "../../../types/peptide";
import {
  ASSAY_TEMPLATE_VERSION,
  MAX_ASSAY_BYTES,
  looksLikeFasta,
  parseAssayCsv,
  parseFasta,
  type AssayType,
  type ParsedMeasurement,
} from "../../../lib/assay-ingest";
import {
  containsProhibitedMotif,
  BIOSECURITY_REFUSAL,
} from "../../../lib/biosecurity";
import { fetchRunById } from "../../../lib/db/recent";
import {
  saveAssayResult,
  uploadAssayRaw,
} from "../../../lib/db/assays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

const SubmissionSchema = z
  .object({
    run_id: z.string().uuid(),
    assay_type: z.enum([
      "mic",
      "cytotoxicity",
      "expression_titer",
      "sequence_verification",
    ]),
    template_version: z.string(),
    file_name: z.string().max(120).optional(),
    content_text: z.string().optional(),
    content_base64: z.string().optional(),
    notes: z.string().max(2000).optional(),
    consent_community: z.boolean(),
  })
  .refine(
    (value) =>
      (value.content_text !== undefined) !==
      (value.content_base64 !== undefined),
    { message: "Provide exactly one of content_text or content_base64." }
  );

function checkAuth(request: NextRequest): NextResponse | null {
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
  if (request.headers.get("authorization") !== `Bearer ${serverToken}`) {
    return json(
      {
        success: false,
        error: "Unauthorized: invalid or missing Bearer [REDACTED]",
      },
      401
    );
  }
  return null;
}

function ledgerConfigured(): boolean {
  return (
    process.env.SUPABASE_URL !== undefined &&
    process.env.SUPABASE_URL.length > 0 &&
    process.env.SUPABASE_SERVICE_ROLE_KEY !== undefined &&
    process.env.SUPABASE_SERVICE_ROLE_KEY.length > 0
  );
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "upload";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
  return cleaned.length > 0 ? cleaned : "upload";
}

interface Rollup {
  organism_or_cells: string | null;
  value_num: number | null;
  value_unit: string | null;
  value_text: string | null;
  passed: boolean | null;
}

function rollupFirst(
  assay: AssayType,
  first: ParsedMeasurement
): Rollup {
  const num = (raw: string): number | null => {
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  };
  const empty: Rollup = {
    organism_or_cells: null,
    value_num: null,
    value_unit: null,
    value_text: null,
    passed: null,
  };
  const fields = first.fields;
  if (assay === "mic") {
    return {
      ...empty,
      organism_or_cells: fields["strain"] ?? null,
      value_num: num(fields["mic_ug_ml"] ?? ""),
      value_unit: "ug/mL",
    };
  }
  if (assay === "cytotoxicity") {
    return {
      ...empty,
      organism_or_cells: fields["cell_line"] ?? null,
      value_num: num(fields["viability_pct"] ?? ""),
      value_unit: "viability_pct",
      value_text: `${fields["concentration_ug_ml"] ?? "?"} ug/mL`,
    };
  }
  if (assay === "expression_titer") {
    return {
      ...empty,
      organism_or_cells: fields["host_strain"] ?? null,
      value_num: num(fields["titer_mg_l"] ?? ""),
      value_unit: "mg/L",
      value_text: fields["construct_id"] ?? null,
    };
  }
  const match = num(fields["reference_match_pct"] ?? "");
  return {
    ...empty,
    value_num: match,
    value_unit: "match_pct",
    value_text: fields["construct_id"] ?? null,
    passed: match === null ? null : match >= 100,
  };
}

/**
 * Programmatic + browser intake for wet-lab results. Credentialed
 * callers (labs, CRO integrations, the Lab Guide) POST parsed-or-raw
 * assay files keyed to a run ID; the server validates, parses, stores
 * the raw bytes, and ledgers normalized measurements for the learning
 * loop and (with consent) the community dataset.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authed = checkAuth(request);
  if (authed !== null) return authed;

  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    return json(
      { success: false, error: "Invalid request: body must be valid JSON." },
      400
    );
  }
  const parsed = SubmissionSchema.safeParse(raw);
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
  const body = parsed.data;
  if (body.template_version !== ASSAY_TEMPLATE_VERSION) {
    return json(
      {
        success: false,
        error: `Unknown template_version. Current: ${ASSAY_TEMPLATE_VERSION}. Fetch fresh templates from /api/assay-templates.`,
      },
      400
    );
  }
  if (
    (body.notes !== undefined && containsProhibitedMotif(body.notes)) ||
    (body.file_name !== undefined && containsProhibitedMotif(body.file_name))
  ) {
    return json({ success: false, error: BIOSECURITY_REFUSAL }, 400);
  }

  let bytes: Uint8Array;
  let text: string | null = null;
  try {
    if (body.content_base64 !== undefined) {
      bytes = Uint8Array.from(Buffer.from(body.content_base64, "base64"));
    } else {
      bytes = new TextEncoder().encode(body.content_text ?? "");
      text = body.content_text ?? "";
    }
  } catch {
    return json(
      { success: false, error: "Invalid request: content is not decodable." },
      400
    );
  }
  if (bytes.length === 0) {
    return json({ success: false, error: "Empty content." }, 400);
  }
  if (bytes.length > MAX_ASSAY_BYTES) {
    return json(
      {
        success: false,
        error: `Content exceeds the ${MAX_ASSAY_BYTES}-byte limit.`,
      },
      413
    );
  }
  if (text === null) {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = null;
    }
  }

  const assay = body.assay_type as AssayType;
  let measurements: ParsedMeasurement[] = [];
  let sniffed = false;
  let rollup: Rollup = {
    organism_or_cells: null,
    value_num: null,
    value_unit: null,
    value_text: null,
    passed: null,
  };
  if (text === null) {
    if (assay !== "sequence_verification") {
      return json(
        {
          success: false,
          error: "Content is not decodable text. Binary uploads are accepted for sequence_verification traces only.",
        },
        400
      );
    }
    rollup = { ...rollup, value_text: "binary trace stored, manual review" };
  } else if (assay === "sequence_verification" && looksLikeFasta(text)) {
    const fasta = parseFasta(text);
    if (!fasta.ok) {
      return json(
        {
          success: false,
          error: "FASTA parse failed.",
          details: { parse_errors: fasta.errors },
        },
        400
      );
    }
    measurements = fasta.sequences.map((entry, index) => ({
      row: index + 1,
      fields: { defline: entry.defline, length_bases: String(entry.sequence.length) },
    }));
    rollup = {
      ...rollup,
      value_text: `${fasta.sequences.length} reads, ${fasta.sequences.reduce((sum, entry) => sum + entry.sequence.length, 0)} bases`,
    };
  } else {
    const csv = parseAssayCsv(assay, text);
    if (!csv.ok) {
      return json(
        {
          success: false,
          error: "CSV parse failed.",
          details: { parse_errors: csv.errors },
        },
        400
      );
    }
    measurements = csv.measurements;
    sniffed = csv.sniffed;
    const first = measurements[0];
    if (first !== undefined) rollup = rollupFirst(assay, first);
  }

  if (!ledgerConfigured()) {
    return json(
      { success: false, error: "Ledger unavailable: Supabase env not configured." },
      503
    );
  }
  const run = await fetchRunById(body.run_id);
  if (run === null) {
    return json(
      { success: false, error: "Unknown run_id: no successful run found." },
      404
    );
  }

  const fileName = sanitizeFileName(
    body.file_name ?? `assay-${assay}.${text === null ? "bin" : assay === "sequence_verification" && text !== null && looksLikeFasta(text) ? "fasta" : "csv"}`
  );
  const storagePath = `${body.run_id}/${assay}/${Date.now()}-${fileName}`;
  const rawBase64 = Buffer.from(bytes).toString("base64");
  const contentType = fileName.endsWith(".fasta") || fileName.endsWith(".fa")
    ? "text/x-fasta"
    : fileName.endsWith(".csv")
      ? "text/csv"
      : "application/octet-stream";
  const stored = await uploadAssayRaw(storagePath, rawBase64, contentType);

  const saved = await saveAssayResult({
    run_id: body.run_id,
    assay_type: assay,
    template_version: ASSAY_TEMPLATE_VERSION,
    organism_or_cells: rollup.organism_or_cells,
    value_num: rollup.value_num,
    value_unit: rollup.value_unit,
    value_text: rollup.value_text,
    passed: rollup.passed,
    measurements,
    raw_file_name: fileName,
    raw_storage_path: stored.ok ? stored.path ?? null : null,
    raw_body_base64: stored.ok ? null : rawBase64,
    notes: body.notes ?? null,
    consent_community: body.consent_community,
    consent_license: "CC0",
  });
  if (!saved.saved) {
    return json(
      { success: false, error: `Ledger write failed: ${saved.error ?? "unknown"}.` },
      503
    );
  }
  return json(
    {
      success: true,
      run_id: body.run_id,
      data: {
        assay_id: saved.id ?? null,
        assay_type: assay,
        measurements: measurements.length,
        sniffed,
        storage: stored.ok ? "bucket" : "inline",
        consent_community: body.consent_community,
      },
    },
    200
  );
}
