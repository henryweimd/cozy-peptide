import type { KnottinGrammarParse } from "../types/peptide";

/**
 * Knottin architecture as a rigid topological grammar.
 *
 * Skeleton: L0 - C1 - L1 - C2 - L2 - C3 - L3 - C4 - L4 - C5 - L5 - C6 - L6
 * Disulfide pairing invariant (ICK motif): C1-C4, C2-C5, C3-C6.
 *
 * Canonical ICK loop envelopes (lengths only):
 * - L1 (3-7 aa): C1-C2 spacing
 * - L2 (3-6 aa): C2-C3 spacing
 * - L3 (1-4 aa): C3-C4 spacing
 * - L4 (2-6 aa): C4-C5 spacing
 * - L5 (4-10 aa): C5-C6 spacing
 * - L0 / L6: terminal spacers; parsed and reported without constraints.
 */

/** Loop length rules: [min, max] inclusive. */
export const LOOP_LENGTH_RULES: Record<string, [number, number]> = {
  L1: [3, 7],
  L2: [3, 6],
  L3: [1, 4],
  L4: [2, 6],
  L5: [4, 10],
};

const LOOP_NAMES = ["L0", "L1", "L2", "L3", "L4", "L5", "L6"] as const;

const CANONICAL_AA = new Set(
  "ACDEFGHIKLMNPQRSTVWY".split("")
);

/**
 * Returns the 0-based indices of every cysteine in the sequence.
 */
export function cysteineIndices(seq: string): number[] {
  const sequence = seq.trim().toUpperCase();
  const positions: number[] = [];
  for (let i = 0; i < sequence.length; i += 1) {
    if (sequence[i] === "C") positions.push(i);
  }
  return positions;
}

/**
 * Parses a candidate sequence against the knottin loop grammar.
 * Loops are reported whenever the 6-cysteine topology is present, even
 * when individual loop rules fail; `valid` is true only when every
 * syntactic rule holds.
 */
export function parseKnottinGrammar(seq: string): KnottinGrammarParse {
  const syntaxErrors: string[] = [];
  const sequence = seq.trim().toUpperCase();

  for (const aa of sequence) {
    if (!CANONICAL_AA.has(aa)) {
      syntaxErrors.push(
        `alphabet: residue '${aa}' is outside the 20-letter protein alphabet`
      );
      break;
    }
  }

  const cysPositions = cysteineIndices(sequence);

  if (cysPositions.length !== 6) {
    syntaxErrors.push(
      `cysteine_topology: expected exactly 6 cysteines (C1-C4, C2-C5, C3-C6 ICK), got ${cysPositions.length}`
    );
    return { valid: false, loops: {}, syntaxErrors };
  }

  const boundaries = [-1, ...cysPositions, sequence.length];
  const loops: Record<string, string> = {};
  for (let li = 0; li < LOOP_NAMES.length; li += 1) {
    const name = LOOP_NAMES[li] ?? `L${li}`;
    const start = (boundaries[li] ?? -1) + 1;
    const end = boundaries[li + 1] ?? sequence.length;
    loops[name] = sequence.slice(start, end);
  }

  for (const name of ["L1", "L2", "L3", "L4", "L5"] as const) {
    const loop = loops[name] ?? "";
    const rule = LOOP_LENGTH_RULES[name] ?? [0, 0];
    if (loop.length < rule[0] || loop.length > rule[1]) {
      syntaxErrors.push(
        `${name}_length: expected ${rule[0]}-${rule[1]} aa, got ${loop.length} ('${loop}')`
      );
    }
  }

  return { valid: syntaxErrors.length === 0, loops, syntaxErrors };
}
