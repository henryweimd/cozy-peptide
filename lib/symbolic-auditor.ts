import type { SymbolicAuditResult } from "../types/peptide";
import { parseKnottinGrammar } from "./protein-grammar";

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

/** Boman (2003) side-chain solubility values in kcal/mol. */
export const BOMAN_SOLUBILITY: Record<string, number> = {
  L: 4.92,
  I: 4.92,
  V: 4.04,
  F: 2.98,
  M: 2.35,
  W: 2.33,
  A: 2.1,
  C: 1.36,
  G: 1.1,
  S: 0.84,
  T: 0.52,
  Y: 0.51,
  P: 0.45,
  H: 0.11,
  Q: -0.25,
  N: -0.42,
  E: -0.87,
  D: -0.91,
  K: -1.35,
  R: -1.37,
};

/**
 * Bjellqvist side-chain pKa scale with standard termini, used for the
 * theoretical isoelectric point.
 */
export const BJELLQVIST_PKA = {
  nTerm: 8.0,
  cTerm: 3.1,
  D: 4.05,
  E: 4.45,
  H: 5.98,
  C: 9.0,
  Y: 10.0,
  K: 10.0,
  R: 12.0,
} as const;

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
 * Boman index: mean side-chain solubility, estimating receptor-binding
 * potential. Values above ~2.48 indicate high protein-binding potential.
 */
export function computeBomanIndex(sequence: string): number {
  const seq = sequence.trim().toUpperCase();
  if (seq.length === 0) return 0;
  let total = 0;
  for (const aa of seq) {
    total += BOMAN_SOLUBILITY[aa] ?? 0;
  }
  return Math.round((total / seq.length) * 1000) / 1000;
}

/**
 * Aliphatic index (Ikai 1980): relative volume occupied by aliphatic
 * side chains, assessing thermostability in hostile luminal environments.
 * AI = X(Ala) + 2.9*X(Val) + 3.9*(X(Ile) + X(Leu)) with mole percentages.
 */
export function computeAliphaticIndex(sequence: string): number {
  const seq = sequence.trim().toUpperCase();
  if (seq.length === 0) return 0;
  const molePercent = (residues: string): number =>
    (countResidues(seq, residues) / seq.length) * 100;
  const index =
    molePercent("A") +
    2.9 * molePercent("V") +
    3.9 * (molePercent("I") + molePercent("L"));
  return Math.round(index * 100) / 100;
}

function netChargeAtPh(sequence: string, ph: number): number {
  let charge =
    1 / (1 + Math.pow(10, ph - BJELLQVIST_PKA.nTerm)) -
    1 / (1 + Math.pow(10, BJELLQVIST_PKA.cTerm - ph));
  for (const aa of sequence) {
    if (aa === "K") charge += 1 / (1 + Math.pow(10, ph - BJELLQVIST_PKA.K));
    else if (aa === "R") charge += 1 / (1 + Math.pow(10, ph - BJELLQVIST_PKA.R));
    else if (aa === "H") charge += 1 / (1 + Math.pow(10, ph - BJELLQVIST_PKA.H));
    else if (aa === "D") charge -= 1 / (1 + Math.pow(10, BJELLQVIST_PKA.D - ph));
    else if (aa === "E") charge -= 1 / (1 + Math.pow(10, BJELLQVIST_PKA.E - ph));
    else if (aa === "C") charge -= 1 / (1 + Math.pow(10, BJELLQVIST_PKA.C - ph));
    else if (aa === "Y") charge -= 1 / (1 + Math.pow(10, BJELLQVIST_PKA.Y - ph));
  }
  return charge;
}

/**
 * Theoretical isoelectric point via bisection on the net-charge curve
 * using the Bjellqvist pKa scale, rounded to 2 decimals.
 */
export function computeIsoelectricPoint(sequence: string): number {
  const seq = sequence.trim().toUpperCase();
  let low = 0;
  let high = 14;
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    if (netChargeAtPh(seq, mid) > 0) low = mid;
    else high = mid;
  }
  return Math.round(((low + high) / 2) * 100) / 100;
}

/**
 * Mucosal adhesion ratio: basic (K, R) over acidic (D, E) residues across
 * the solvent-exposed loops L3 and L5. Falls back to the whole sequence
 * when the grammar topology is absent; reports the basic count when no
 * acidic residues are present.
 */
export function computeMucosalAdhesionRatio(sequence: string): number {
  const seq = sequence.trim().toUpperCase();
  const grammar = parseKnottinGrammar(seq);
  const loops = grammar.loops;
  const hasTopology =
    loops["L3"] !== undefined && loops["L5"] !== undefined;
  const surface = hasTopology
    ? `${loops["L3"] ?? ""}${loops["L5"] ?? ""}`
    : seq;
  const basic = countResidues(surface, "KR");
  const acidic = countResidues(surface, "DE");
  if (acidic === 0) return basic;
  return Math.round((basic / acidic) * 1000) / 1000;
}

/** Per-protease cleavage-site start indices (0-based). */
export interface CleavageProfile {
  trypsin: number[];
  chymotrypsin: number[];
  pepsin: number[];
  enterokinase: number[];
}

/**
 * Scans a sequence against the mucosal protease library:
 * trypsin [KR][^P], chymotrypsin [FYWL][^P], pepsin [FLWY],
 * enterokinase DDDDK.
 */
export function scanCleavageSites(sequence: string): CleavageProfile {
  const seq = sequence.trim().toUpperCase();
  const profile: CleavageProfile = {
    trypsin: [],
    chymotrypsin: [],
    pepsin: [],
    enterokinase: [],
  };
  for (let i = 0; i < seq.length; i += 1) {
    const aa = seq[i] ?? "";
    const next = i + 1 < seq.length ? (seq[i + 1] ?? "") : "";
    const notProline = next === "" || next !== "P";
    if ((aa === "K" || aa === "R") && notProline) {
      profile.trypsin.push(i);
    }
    if (
      (aa === "F" || aa === "Y" || aa === "W" || aa === "L") &&
      notProline
    ) {
      profile.chymotrypsin.push(i);
    }
    if (aa === "F" || aa === "L" || aa === "W" || aa === "Y") {
      profile.pepsin.push(i);
    }
    if (seq.slice(i, i + 5) === "DDDDK") {
      profile.enterokinase.push(i);
    }
  }
  return profile;
}

/**
 * Cleavage susceptibility index: total mucosal-protease motif hits per
 * residue, rounded to 3 decimals.
 */
export function computeCleavageSusceptibilityIndex(sequence: string): number {
  const seq = sequence.trim().toUpperCase();
  if (seq.length === 0) return 0;
  const profile = scanCleavageSites(seq);
  const hits =
    profile.trypsin.length +
    profile.chymotrypsin.length +
    profile.pepsin.length +
    profile.enterokinase.length;
  return Math.round((hits / seq.length) * 1000) / 1000;
}

/**
 * Deterministic symbolic verification of one knottin candidate, plus the
 * developability ledger (Boman, aliphatic, pI, mucosal adhesion, cleavage).
 *
 * Pass/fail invariants:
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
    boman_index: computeBomanIndex(seq),
    aliphatic_index: computeAliphaticIndex(seq),
    isoelectric_point: computeIsoelectricPoint(seq),
    mucosal_adhesion_ratio: computeMucosalAdhesionRatio(seq),
    cleavage_susceptibility_index: computeCleavageSusceptibilityIndex(seq),
  };
}
