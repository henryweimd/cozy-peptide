/**
 * Wet-lab loop ingest: versioned CSV templates, a strict parser with
 * best-effort column sniffing for raw instrument exports, and FASTA
 * parsing for sequence verification. Pure: no network, no filesystem.
 * Client-safe (shared by the Lab Guide and the ingest API).
 */

export type AssayType =
  | "mic"
  | "cytotoxicity"
  | "expression_titer"
  | "sequence_verification";

export const ASSAY_TYPES: AssayType[] = [
  "mic",
  "cytotoxicity",
  "expression_titer",
  "sequence_verification",
];

/** Current template generation. Bumped when columns change. */
export const ASSAY_TEMPLATE_VERSION = "labguide-1";

/** Largest accepted upload: CSV/FASTA/Sanger traces fit easily. */
export const MAX_ASSAY_BYTES = 2_000_000;

export interface AssayTemplate {
  assay: AssayType;
  version: string;
  columns: string[];
  example: string[];
  hint: string;
}

export const ASSAY_TEMPLATES: Record<AssayType, AssayTemplate> = {
  mic: {
    assay: "mic",
    version: ASSAY_TEMPLATE_VERSION,
    columns: ["strain", "mic_ug_ml", "method", "replicate"],
    example: [
      "Clostridioides difficile ATCC 43255",
      "8",
      "broth microdilution",
      "1",
    ],
    hint: "One row per strain × replicate. MIC in µg/mL.",
  },
  cytotoxicity: {
    assay: "cytotoxicity",
    version: ASSAY_TEMPLATE_VERSION,
    columns: ["cell_line", "concentration_ug_ml", "viability_pct", "method"],
    example: ["Caco-2", "64", "92", "CellTiter-Glo"],
    hint: "One row per cell line × concentration. Viability in percent.",
  },
  expression_titer: {
    assay: "expression_titer",
    version: ASSAY_TEMPLATE_VERSION,
    columns: ["host_strain", "construct_id", "titer_mg_l", "method"],
    example: ["S. boulardii MYA-796", "pCP-001", "12.5", "ELISA"],
    hint: "One row per construct. Secreted titer in mg/L.",
  },
  sequence_verification: {
    assay: "sequence_verification",
    version: ASSAY_TEMPLATE_VERSION,
    columns: ["construct_id", "reference_match_pct", "method"],
    example: ["pCP-001", "100.0", "sanger"],
    hint: "One row per construct. Attach the read as FASTA when asked.",
  },
};

/** Renders the downloadable template: header plus one example row. */
export function templateCsv(assay: AssayType): string {
  const template = ASSAY_TEMPLATES[assay];
  return `${template.columns.join(",")}\n${template.example.map(escapeCsvCell).join(",")}\n`;
}

function escapeCsvCell(cell: string): string {
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Minimal RFC-4180 reader: commas, quotes, CRLF. Returns rows of cells. */
export function readCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const pushCell = (): void => {
    row.push(cell);
    cell = "";
  };
  const pushRow = (): void => {
    pushCell();
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const char = text[i] ?? "";
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else {
          quoted = false;
          i += 1;
        }
      } else {
        cell += char;
        i += 1;
      }
    } else if (char === '"') {
      quoted = true;
      i += 1;
    } else if (char === ",") {
      pushCell();
      i += 1;
    } else if (char === "\r" && text[i + 1] === "\n") {
      pushRow();
      i += 2;
    } else if (char === "\n" || char === "\r") {
      pushRow();
      i += 1;
    } else {
      cell += char;
      i += 1;
    }
  }
  pushRow();
  return rows;
}

export interface ParsedMeasurement {
  row: number;
  fields: Record<string, string>;
}

export interface AssayParseResult {
  ok: boolean;
  sniffed: boolean;
  measurements: ParsedMeasurement[];
  errors: string[];
}

/**
 * Header aliases for raw instrument exports: normalized (lowercased,
 * alphanumeric-only) header cell -> template column.
 */
const HEADER_ALIASES: Record<AssayType, Record<string, string[]>> = {
  mic: {
    strain: ["strain", "organism", "isolate", "species", "targetstrain"],
    mic_ug_ml: ["micugml", "mic", "micug", "micml", "minimuminhibitoryconcentration"],
    method: ["method", "assay", "protocol", "technique"],
    replicate: ["replicate", "rep", "n", "replicateno"],
  },
  cytotoxicity: {
    cell_line: ["cellline", "cells", "celltype", "line"],
    concentration_ug_ml: ["concentrationugml", "concentration", "concm", "doseugml", "dose"],
    viability_pct: ["viabilitypct", "viability", "viablepct", "survivalpct"],
    method: ["method", "assay", "protocol", "technique"],
  },
  expression_titer: {
    host_strain: ["hoststrain", "host", "strain", "chassis"],
    construct_id: ["constructid", "construct", "plasmid", "cloneid", "sampleid"],
    titer_mg_l: ["titermgl", "titer", "titermg", "yieldmgl", "concentrationmgl"],
    method: ["method", "assay", "protocol", "technique"],
  },
  sequence_verification: {
    construct_id: ["constructid", "construct", "plasmid", "cloneid", "sampleid"],
    reference_match_pct: ["referencematchpct", "matchpct", "identitypct", "match", "identity"],
    method: ["method", "assay", "protocol", "technique"],
  },
};

function normalizeHeader(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Parses one assay CSV. Exact template headers parse strictly; unknown
 * headers fall back to alias sniffing and report `sniffed: true` so
 * callers can tell the user a mapping was guessed.
 */
export function parseAssayCsv(assay: AssayType, text: string): AssayParseResult {
  const template = ASSAY_TEMPLATES[assay];
  const rows = readCsvRows(text);
  if (rows.length === 0) {
    return { ok: false, sniffed: false, measurements: [], errors: ["Empty file: no rows found."] };
  }
  const header = (rows[0] ?? []).map((cell) => cell.trim());
  let mapping: number[] | null = null;
  let sniffed = false;
  if (
    header.length === template.columns.length &&
    header.every((cell, index) => cell === template.columns[index])
  ) {
    mapping = template.columns.map((_, index) => index);
  } else {
    const normalized = header.map(normalizeHeader);
    const guessed: number[] = [];
    for (const column of template.columns) {
      const aliases = HEADER_ALIASES[assay][column] ?? [];
      const found = normalized.findIndex((cell) => aliases.includes(cell));
      if (found === -1) {
        return {
          ok: false,
          sniffed: false,
          measurements: [],
          errors: [
            `Unrecognized header. Expected: ${template.columns.join(", ")}. ` +
              `Download the ${assay} template to match it exactly.`,
          ],
        };
      }
      guessed.push(found);
    }
    mapping = guessed;
    sniffed = true;
  }
  const measurements: ParsedMeasurement[] = [];
  const errors: string[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r] ?? [];
    if (cells.every((cell) => cell.trim() === "")) continue;
    const fields: Record<string, string> = {};
    template.columns.forEach((column, c) => {
      fields[column] = (cells[mapping?.[c] ?? c] ?? "").trim();
    });
    const empty = template.columns.filter((column) => fields[column] === "");
    if (empty.length > 0) {
      errors.push(`Row ${r + 1}: missing ${empty.join(", ")}.`);
      continue;
    }
    measurements.push({ row: r + 1, fields });
  }
  if (measurements.length === 0 && errors.length === 0) {
    errors.push("No data rows found below the header.");
  }
  return { ok: errors.length === 0, sniffed, measurements, errors };
}

export interface FastaSequence {
  defline: string;
  sequence: string;
}

export interface FastaParseResult {
  ok: boolean;
  sequences: FastaSequence[];
  errors: string[];
}

const FASTA_ALPHABET = /^[ACGTURYKMSWBDHVN\-]+$/i;

/**
 * Parses FASTA per NCBI conventions: `>` defline plus sequence lines,
 * IUB/IUPAC alphabet, no mid-file blank lines, no digits.
 */
export function parseFasta(text: string): FastaParseResult {
  const errors: string[] = [];
  const sequences: FastaSequence[] = [];
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && (lines[lines.length - 1] ?? "").trim() === "") {
    lines.pop();
  }
  let defline: string | null = null;
  let chunks: string[] = [];
  let seenEntry = false;
  const flush = (): void => {
    if (defline === null) return;
    const sequence = chunks.join("").toUpperCase();
    if (sequence.length === 0) {
      errors.push(`Entry "${defline}" has no sequence.`);
    } else if (!FASTA_ALPHABET.test(sequence)) {
      errors.push(`Entry "${defline}" has non-sequence characters (digits and whitespace are not allowed).`);
    } else {
      sequences.push({ defline, sequence });
    }
    defline = null;
    chunks = [];
  };
  for (const line of lines) {
    if (line.startsWith(">")) {
      flush();
      seenEntry = true;
      defline = line.slice(1).trim();
      if (defline.length === 0) errors.push("Entry with an empty defline.");
      continue;
    }
    if (line.trim() === "") {
      if (seenEntry && defline !== null) {
        errors.push("Blank line inside a FASTA entry is not allowed.");
      }
      continue;
    }
    if (defline === null) {
      errors.push("Sequence data before the first `>` defline.");
      continue;
    }
    chunks.push(line.trim());
  }
  flush();
  if (!seenEntry) errors.push("No FASTA entries found: expected `>` deflines.");
  return { ok: errors.length === 0, sequences, errors };
}

/** True when text looks like FASTA (first non-blank line is a defline). */
export function looksLikeFasta(text: string): boolean {
  const first = text.split(/\r?\n/).find((line) => line.trim() !== "");
  return first !== undefined && first.startsWith(">");
}
