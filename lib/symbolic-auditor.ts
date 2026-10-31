import type { SymbolicAuditResult } from "../types/peptide";

export const KNOTTIN_MIN_LENGTH = 28;
export const KNOTTIN_MAX_LENGTH = 36;
export const KNOTTIN_CYS_COUNT = 6;
export const GRAVY_MIN = -0.4;
export const GRAVY_MAX = 0.1;

/** Full Kyte-Doolittle hydropathy scale. */
export const KYTE_DOOLITTLE: Record<string, number> = {
  I: 4.5,
  V: 4.2,
  L: 3.8,
  F: 2.8,
  C: 2.5,
  M: 1.9,
  A: 1.8,
  G: -0.4,
  T: -0.7,
  S: -0.8,
  W: -0.9,
  Y: -1.3,
  P: -1.6,
  H: -3.2,
  E: -3.5,
  Q: -3.5,
  D: -3.5,
  N: -3.5,
  K: -3.9,
  R: -4.5,
};

const CANONICAL_AA = new Set(Object.keys(KYTE_DOOLITTLE));

function countResidues(sequence: string, residues: string): number {
  let count = 0;
  for (const aa of sequence) {
    if (residues.includes(aa)) count += 1;
  }
  return count;
}

/** Formal charge at neutral pH: (K + R) - (D + E). */
export function computeFormalCharge(sequence: string): number {
  return (
    countResidues(sequence, "KR") - countResidues(sequence, "DE")
  );
}

/** Mean Kyte-Doolittle hydropathy (GRAVY score). */
export function computeGravy(sequence: string): number {
  if (sequence.length === 0) return 0;
  let total = 0;
  for (const aa of sequence) {
    total += KYTE_DOOLITTLE[aa] ?? 0;
  }
  return total / sequence.length;
}

/**
 * Deterministic symbolic verification of one knottin candidate.
 *
 * Invariants:
 * - Length 28-36 aa
 * - Exactly 6 cysteines (canonical C1-C4, C2-C5, C3-C6 knottin)
 * - Formal charge exactly equals the target
 * - No trypsin motif [KR]{2}, no pepsin/chymotrypsin motif [FYW]L
 * - No deamidation/isomerization liabilities (N[GS], D[GS]) and no Met
 * - GRAVY strictly within [-0.40, +0.10]
 */
export function auditPeptideCandidate(
  sequence: string,
  targetCharge: number
): SymbolicAuditResult {
  const violations: string[] = [];
  const seq = sequence.trim().toUpperCase();

  for (const aa of seq) {
    if (!CANONICAL_AA.has(aa)) {
      violations.push(
        `non_canonical_residue: sequence contains '${aa}', only the 20 canonical amino acids are allowed`
      );
      break;
    }
  }

  const length = seq.length;
  if (length < KNOTTIN_MIN_LENGTH || length > KNOTTIN_MAX_LENGTH) {
    violations.push(
      `length: expected ${KNOTTIN_MIN_LENGTH}-${KNOTTIN_MAX_LENGTH} aa, got ${length}`
    );
  }

  const cysCount = countResidues(seq, "C");
  if (cysCount !== KNOTTIN_CYS_COUNT) {
    violations.push(
      `cysteines: expected exactly ${KNOTTIN_CYS_COUNT} (C1-C4, C2-C5, C3-C6), got ${cysCount}`
    );
  }

  const formalCharge = computeFormalCharge(seq);
  if (formalCharge !== targetCharge) {
    violations.push(
      `formal_charge: expected ${targetCharge}, got ${formalCharge}`
    );
  }

  if (/[KR]{2}/.test(seq)) {
    violations.push(
      "protease_trypsin: dibasic [KR]{2} motif is a trypsin cleavage site"
    );
  }
  if (/[FYW]L/.test(seq)) {
    violations.push(
      "protease_pepsin_chymotrypsin: [FYW]L motif is a pepsin/chymotrypsin cleavage site"
    );
  }

  if (/N[GS]/.test(seq)) {
    violations.push(
      "liability_deamidation: N[GS] asparagine deamidation motif present"
    );
  }
  if (/D[GS]/.test(seq)) {
    violations.push(
      "liability_isomerization: D[GS] aspartate isomerization motif present"
    );
  }
  if (seq.includes("M")) {
    violations.push(
      "liability_oxidation: methionine (M) oxidation liability present"
    );
  }

  const gravyScore = computeGravy(seq);
  if (gravyScore < GRAVY_MIN || gravyScore > GRAVY_MAX) {
    violations.push(
      `gravy: expected within [${GRAVY_MIN.toFixed(2)}, +${GRAVY_MAX.toFixed(2)}], got ${gravyScore.toFixed(3)}`
    );
  }

  return {
    passed: violations.length === 0,
    length,
    cys_count: cysCount,
    formal_charge: formalCharge,
    gravy_score: Math.round(gravyScore * 1000) / 1000,
    violations,
  };
}
