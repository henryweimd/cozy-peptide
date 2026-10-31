import type { KnottinGrammarParse } from "../types/peptide";

/**
 * Knottin architecture as a rigid linguistic grammar.
 *
 * Skeleton: L0 - C1 - L1 - C2 - L2 - C3 - L3 - C4 - L4 - C5 - L5 - C6 - L6
 * Disulfide pairing invariant (ICK motif): C1-C4, C2-C5, C3-C6.
 *
 * Semantic syntax rules per loop:
 * - L1 (3-7 aa): structural turn anchor; requires a turn-inducer (P or G).
 * - L2 (4-6 aa): beta-hairpin initiator; bulky aromatics (W, F) capped at
 *   40% of loop length.
 * - L3 (4-7 aa): functional variable cassette; charge-tolerant, no hard rule.
 * - L4 (1-3 aa): ultra-short linker; no helix-forming residues.
 * - L5 (4-8 aa): terminal amphipathic presentation; charge-tolerant.
 * - L0 / L6: terminal spacers; parsed and reported without constraints.
 */

/** Loop length rules: [min, max] inclusive. */
export const LOOP_LENGTH_RULES: Record<string, [number, number]> = {
  L1: [3, 7],
  L2: [4, 6],
  L3: [4, 7],
  L4: [1, 3],
  L5: [4, 8],
};

/** Turn-inducing residues required in L1 for loop closure. */
export const TURN_INDUCERS = new Set(["P", "G"]);

/** Bulky aromatics capped in L2. */
export const L2_BULKY_AROMATICS = new Set(["W", "F"]);
export const L2_AROMATIC_FRACTION_LIMIT = 0.4;

/**
 * Strong helix-forming residues (Chou-Fasman P-alpha > ~1.10) prohibited
 * in the ultra-short L4 linker, where helix nucleation would disrupt the
 * cystine-knot packing.
 */
export const L4_HELIX_FORMERS = new Set(["A", "E", "K", "L", "M", "Q"]);

const LOOP_NAMES = ["L0", "L1", "L2", "L3", "L4", "L5", "L6"] as const;

const CANONICAL_AA = new Set(
  "ACDEFGHIKLMNPQRSTVWY".split("")
);

function countWhere(loop: string, residues: Set<string>): number {
  let count = 0;
  for (const aa of loop) {
    if (residues.has(aa)) count += 1;
  }
  return count;
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

  const cysPositions: number[] = [];
  for (let i = 0; i < sequence.length; i += 1) {
    if (sequence[i] === "C") cysPositions.push(i);
  }

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

  const l1 = loops["L1"] ?? "";
  if (countWhere(l1, TURN_INDUCERS) === 0) {
    syntaxErrors.push(
      `L1_turn_anchor: loop lacks turn-inducers [P, G] required for C1-C2 closure ('${l1}')`
    );
  }

  const l2 = loops["L2"] ?? "";
  if (l2.length > 0) {
    const aromaticCount = countWhere(l2, L2_BULKY_AROMATICS);
    const fraction = aromaticCount / l2.length;
    if (fraction > L2_AROMATIC_FRACTION_LIMIT) {
      syntaxErrors.push(
        `L2_hairpin: bulky aromatics [W, F] exceed 40% of loop (${aromaticCount}/${l2.length} in '${l2}')`
      );
    }
  }

  const l4 = loops["L4"] ?? "";
  const helixOffenders = l4.split("").filter((aa) => L4_HELIX_FORMERS.has(aa));
  if (helixOffenders.length > 0) {
    syntaxErrors.push(
      `L4_linker: helix-forming residues [${helixOffenders.join(",")}] prohibited in the ultra-short linker ('${l4}')`
    );
  }

  return { valid: syntaxErrors.length === 0, loops, syntaxErrors };
}
