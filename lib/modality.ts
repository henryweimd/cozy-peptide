import type { KnottinGrammarParse } from "../types/peptide";
import { cysteineIndices, parseKnottinGrammar } from "./protein-grammar";

/**
 * Design modalities: the compiler is no longer knottin-only. Every
 * modality shares the charge window, the bioprocess liability gates, and
 * the yeast secretion cassette; each carries its own length window and
 * disulfide-topology grammar.
 */
export type Modality = "knottin-6c" | "disulfide-4c" | "disulfide-2c" | "linear";

export const DEFAULT_MODALITY: Modality = "knottin-6c";

export const MODALITIES: Modality[] = [
  "knottin-6c",
  "disulfide-4c",
  "disulfide-2c",
  "linear",
];

export interface ModalitySpec {
  modality: Modality;
  /** Human noun used in prompts, telemetry, and reports. */
  noun: string;
  minLength: number;
  maxLength: number;
  /** Exact cysteine count, or null when cysteines are unconstrained. */
  cysteines: number | null;
  /** Minimum residues between consecutive cysteines (disulfide loop floor). */
  minCysSpacing: number;
  /** GRAVY window calibrated to the modality's typical composition. */
  gravyMin: number;
  gravyMax: number;
  /** Response `modality` identifier. */
  responseId: string;
  /** Candidate id prefix (SB-KNOT- style). */
  idPrefix: string;
  /** Topology label for the candidate payload. */
  topologyLabel: string;
  /** Cassette format label for the cloning payload. */
  cassetteFormat: string;
  /** Short payload noun for FASTA headers and manifests. */
  payloadNoun: string;
}

export const MODALITY_SPECS: Record<Modality, ModalitySpec> = {
  "knottin-6c": {
    modality: "knottin-6c",
    noun: "knottin",
    minLength: 28,
    maxLength: 36,
    cysteines: 6,
    minCysSpacing: 1,
    gravyMin: -0.4,
    gravyMax: 0.1,
    responseId: "engineered_knottin_microprotein",
    idPrefix: "SB-KNOT-",
    topologyLabel: "C1-C4, C2-C5, C3-C6 ICK",
    cassetteFormat: "MFalpha1-Kex2-Knottin-CYC1term",
    payloadNoun: "knottin",
  },
  "disulfide-4c": {
    modality: "disulfide-4c",
    noun: "4-cysteine disulfide peptide",
    minLength: 20,
    maxLength: 36,
    cysteines: 4,
    minCysSpacing: 2,
    gravyMin: -0.8,
    gravyMax: 0.1,
    responseId: "engineered_disulfide_peptide_4c",
    idPrefix: "SB-SS4-",
    topologyLabel: "4-Cys double-disulfide",
    cassetteFormat: "MFalpha1-Kex2-SS4Peptide-CYC1term",
    payloadNoun: "peptide",
  },
  "disulfide-2c": {
    modality: "disulfide-2c",
    noun: "2-cysteine disulfide peptide",
    minLength: 12,
    maxLength: 30,
    cysteines: 2,
    minCysSpacing: 4,
    gravyMin: -1.2,
    gravyMax: 0.1,
    responseId: "engineered_disulfide_peptide_2c",
    idPrefix: "SB-SS2-",
    topologyLabel: "2-Cys single-disulfide",
    cassetteFormat: "MFalpha1-Kex2-SS2Peptide-CYC1term",
    payloadNoun: "peptide",
  },
  linear: {
    modality: "linear",
    noun: "linear peptide",
    minLength: 8,
    maxLength: 30,
    cysteines: 0,
    minCysSpacing: 0,
    gravyMin: -2.0,
    gravyMax: 0.3,
    responseId: "engineered_linear_peptide",
    idPrefix: "SB-LIN-",
    topologyLabel: "linear (cysteine-free)",
    cassetteFormat: "MFalpha1-Kex2-LinearPeptide-CYC1term",
    payloadNoun: "peptide",
  },
};

export function specForModality(modality: Modality): ModalitySpec {
  return MODALITY_SPECS[modality];
}

export function isModality(value: unknown): value is Modality {
  return (
    typeof value === "string" &&
    (MODALITIES as string[]).includes(value)
  );
}

const CANONICAL_AA = new Set("ACDEFGHIKLMNPQRSTVWY".split(""));

/**
 * Parses a candidate against a non-knottin modality grammar: alphabet,
 * exact cysteine count, and minimum spacing between consecutive
 * cysteines (a disulfide needs a real loop). Loops are reported as the
 * inter-cysteine segments L1..Ln plus terminal spacers L0/Ln+1.
 */
function parseDisulfideGrammar(
  sequence: string,
  spec: ModalitySpec
): KnottinGrammarParse {
  const syntaxErrors: string[] = [];
  const seq = sequence.trim().toUpperCase();

  for (const aa of seq) {
    if (!CANONICAL_AA.has(aa)) {
      syntaxErrors.push(
        `alphabet: residue '${aa}' is outside the 20-letter protein alphabet`
      );
      break;
    }
  }

  const positions = cysteineIndices(seq);
  const expected = spec.cysteines ?? 0;
  if (positions.length !== expected) {
    syntaxErrors.push(
      `cysteine_topology: expected exactly ${expected} cysteines for ${spec.noun} (${spec.modality}), got ${positions.length}`
    );
    return { valid: false, loops: {}, syntaxErrors };
  }

  for (let i = 1; i < positions.length; i += 1) {
    const gap = (positions[i] ?? 0) - (positions[i - 1] ?? 0) - 1;
    if (gap < spec.minCysSpacing) {
      syntaxErrors.push(
        `cysteine_spacing: C${i}-C${i + 1} gap is ${gap} aa, minimum ${spec.minCysSpacing} for a disulfide loop`
      );
    }
  }

  const boundaries = [-1, ...positions, seq.length];
  const loops: Record<string, string> = {};
  for (let li = 0; li < boundaries.length - 1; li += 1) {
    const start = (boundaries[li] ?? -1) + 1;
    const end = boundaries[li + 1] ?? seq.length;
    loops[`L${li}`] = seq.slice(start, end);
  }

  return { valid: syntaxErrors.length === 0, loops, syntaxErrors };
}

/**
 * Grammar dispatch: knottins keep the canonical ICK loop envelopes;
 * every other modality parses against its own disulfide grammar.
 */
export function parseModalityGrammar(
  sequence: string,
  modality: Modality
): KnottinGrammarParse {
  if (modality === "knottin-6c") return parseKnottinGrammar(sequence);
  return parseDisulfideGrammar(sequence, specForModality(modality));
}

/**
 * Loop segments for the candidate payload: knottins report L1-L5; other
 * modalities report their inter-cysteine segments (empty for linears).
 */
export function loopSegmentsForModality(
  grammar: KnottinGrammarParse,
  modality: Modality
): string[] {
  if (modality === "knottin-6c") {
    return [
      grammar.loops["L1"] ?? "",
      grammar.loops["L2"] ?? "",
      grammar.loops["L3"] ?? "",
      grammar.loops["L4"] ?? "",
      grammar.loops["L5"] ?? "",
    ];
  }
  const segments: string[] = [];
  for (let li = 1; ; li += 1) {
    const loop = grammar.loops[`L${li}`];
    if (loop === undefined) break;
    segments.push(loop);
  }
  // Drop the trailing terminal spacer: only inter-cysteine segments count.
  if (segments.length > 0) segments.pop();
  return segments;
}
