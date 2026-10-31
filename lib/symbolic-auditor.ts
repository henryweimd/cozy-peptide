import type {
  KnottinGrammarParse,
  SymbolicAuditResult,
  VerificationReport,
} from "../types/peptide";
import { parseKnottinGrammar } from "./protein-grammar";
import { type Modality, specForModality } from "./modality";

export const KNOTTIN_MIN_LENGTH = 28;
export const KNOTTIN_MAX_LENGTH = 36;
export const KNOTTIN_CYS_COUNT = 6;
export const GRAVY_MIN = -0.4;
export const GRAVY_MAX = 0.1;
/** Net-charge window at pH 7.4 for gentle mucosal retention. */
export const CHARGE_MIN = 1;
export const CHARGE_MAX = 4;

/** Kex2 / trypsin dibasic liabilities (Golgi fragmentation risk). */
export const KEX2_DIBASIC_PATTERN = /(KR|RR|KK|RK)/;
/** Kex2 proline-adjacent liability. */
export const KEX2_PR_PATTERN = /PR/;
/** Exposed chymotrypsin consensus sites. */
export const CHYMOTRYPSIN_EXPOSED_PATTERN = /[FYW][^P][KR]/;
/** N-linked glycosylation sequon (yeast hyper-mannosylation risk). */
export const GLYCOSYLATION_SEQUON_PATTERN = /N[^P][ST]/;
/** Residues forbidden at position 1 (Kex2 N-terminal processing). */
export const BLOCKED_N_TERMINI = new Set(["P", "F", "Y", "W"]);
/** Maximum methionines per payload (oxidation risk). */
export const MAX_METHIONINES = 1;
/** Asparagine-glycine deamidation hotspot. */
export const DEAMIDATION_PATTERN = /NG/;
/** Aspartate-glycine isomerization hotspot. */
export const ISOMERIZATION_PATTERN = /DG/;
/** Asp-Pro acid-labile bond (cleaves in stomach acid). */
export const ACID_LABILE_PATTERN = /DP/;
/** Maximum single-residue fraction (low-complexity cap). */
export const MAX_LOW_COMPLEXITY_FRACTION = 0.4;

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
 * theoretical isoelectric point and the pH 7.4 net charge.
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

/**
 * Net charge at a given pH via Henderson-Hasselbalch over the termini
 * and ionizable side chains (Bjellqvist pKa scale).
 */
export function computeNetChargeAtPh(sequence: string, ph: number): number {
  const seq = sequence.trim().toUpperCase();
  let charge =
    1 / (1 + Math.pow(10, ph - BJELLQVIST_PKA.nTerm)) -
    1 / (1 + Math.pow(10, BJELLQVIST_PKA.cTerm - ph));
  for (const aa of seq) {
    if (aa === "K") charge += 1 / (1 + Math.pow(10, ph - BJELLQVIST_PKA.K));
    else if (aa === "R") charge += 1 / (1 + Math.pow(10, ph - BJELLQVIST_PKA.R));
    else if (aa === "H") charge += 1 / (1 + Math.pow(10, ph - BJELLQVIST_PKA.H));
    else if (aa === "D") charge -= 1 / (1 + Math.pow(10, BJELLQVIST_PKA.D - ph));
    else if (aa === "E") charge -= 1 / (1 + Math.pow(10, BJELLQVIST_PKA.E - ph));
    else if (aa === "C") charge -= 1 / (1 + Math.pow(10, BJELLQVIST_PKA.C - ph));
    else if (aa === "Y") charge -= 1 / (1 + Math.pow(10, BJELLQVIST_PKA.Y - ph));
  }
  return Math.round(charge * 1000) / 1000;
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
    if (computeNetChargeAtPh(seq, mid) > 0) low = mid;
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
 * Hydrophobic residues tracked for secretion runs: at most 3 consecutive
 * ([VILMFW]{1,3}); runs of 4+ risk ER aggregation.
 */
export const HYDROPHOBIC_RUN_SET = new Set(["V", "I", "L", "M", "F", "W"]);
export const MAX_HYDROPHOBIC_RUN = 3;
export const MAX_RESIDUE_FRACTION = 0.3;

/** Longest contiguous run of hydrophobic residues. */
export function computeHydrophobicRunMax(sequence: string): number {
  const seq = sequence.trim().toUpperCase();
  let longest = 0;
  let run = 0;
  for (const aa of seq) {
    if (HYDROPHOBIC_RUN_SET.has(aa)) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return longest;
}

/** Highest single-residue fraction (low-complexity readout). */
export function computeMaxResidueFraction(sequence: string): number {
  const seq = sequence.trim().toUpperCase();
  if (seq.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const aa of seq) {
    counts.set(aa, (counts.get(aa) ?? 0) + 1);
  }
  let max = 0;
  for (const count of counts.values()) {
    if (count > max) max = count;
  }
  return Math.round((max / seq.length) * 1000) / 1000;
}

/**
 * Deterministic symbolic verification of one peptide secretion payload,
 * plus the developability ledger (Boman, aliphatic, pI, mucosal adhesion,
 * cleavage, hydrophobic runs).
 *
 * Pass/fail invariants (knottin defaults; other modalities substitute
 * their own length window, cysteine count, and GRAVY window):
 * - Length inside the modality window (knottin: 28-36 aa)
 * - Exact cysteine count (knottin: 6, canonical C1-C4/C2-C5/C3-C6)
 * - Formal charge exactly equals the target and sits in [+1, +4]
 * - No Kex2 liabilities: (KR|RR|KK|RK) dibasics and PR
 * - No N-glycosylation sequon N[^P][ST]
 * - No exposed chymotrypsin sites [FYW][^P][KR]
 * - Residue 1 (post-Kex2 N-terminus) is not P, F, Y, or W
 * - No hydrophobic run of 4+ over [VILMFW]
 * - GRAVY strictly inside the modality window (knottin: [-0.40, +0.10])
 * - At most one methionine (oxidation risk)
 * - No NG deamidation or DG isomerization hotspots
 * - No DP acid-labile bonds (stomach-acid cleavage risk)
 * - No low-complexity dominance (single residue at most 40%)
 */
export function auditPeptideCandidate(
  sequence: string,
  targetCharge: number,
  modality: Modality = "knottin-6c"
): SymbolicAuditResult {
  const violations: string[] = [];
  const seq = sequence.trim().toUpperCase();
  const spec = specForModality(modality);

  for (const aa of seq) {
    if (!CANONICAL_AA.has(aa)) {
      violations.push(
        `non_canonical_residue: sequence contains '${aa}', only the 20 canonical amino acids are allowed`
      );
      break;
    }
  }

  const length = seq.length;
  if (length < spec.minLength || length > spec.maxLength) {
    violations.push(
      `length: expected ${spec.minLength}-${spec.maxLength} aa for ${spec.noun}, got ${length}`
    );
  }

  const cysCount = countResidues(seq, "C");
  const expectedCys = spec.cysteines ?? cysCount;
  if (spec.cysteines !== null && cysCount !== spec.cysteines) {
    const detail =
      modality === "knottin-6c" ? " (C1-C4, C2-C5, C3-C6)" : "";
    violations.push(
      `cysteines: expected exactly ${expectedCys}${detail}, got ${cysCount}`
    );
  }

  const formalCharge = computeFormalCharge(seq);
  if (formalCharge < CHARGE_MIN || formalCharge > CHARGE_MAX) {
    violations.push(
      `formal_charge_window: expected net charge within [+${CHARGE_MIN}, +${CHARGE_MAX}] at pH 7.4, got ${formalCharge}`
    );
  }
  if (formalCharge !== targetCharge) {
    violations.push(
      `formal_charge: expected ${targetCharge}, got ${formalCharge}`
    );
  }

  const dibasic = KEX2_DIBASIC_PATTERN.exec(seq);
  if (dibasic !== null) {
    violations.push(
      `kex2_site: dibasic '${dibasic[0]}' at index ${dibasic.index} would be cleaved by Kex2 during Golgi processing`
    );
  }
  const pr = KEX2_PR_PATTERN.exec(seq);
  if (pr !== null) {
    violations.push(
      `kex2_site: 'PR' at index ${pr.index} is a Kex2 processing liability`
    );
  }
  if (GLYCOSYLATION_SEQUON_PATTERN.test(seq)) {
    violations.push(
      "liability_glycosylation: N-X-[ST] sequon would be N-glycosylated by yeast, likely killing activity"
    );
  }
  const exposed = CHYMOTRYPSIN_EXPOSED_PATTERN.exec(seq);
  if (exposed !== null) {
    violations.push(
      `chymotrypsin_exposed: '${exposed[0]}' at index ${exposed.index} is an exposed chymotrypsin consensus site`
    );
  }

  const nTerm = seq[0] ?? "";
  if (BLOCKED_N_TERMINI.has(nTerm)) {
    violations.push(
      `n_terminus: residue 1 is '${nTerm}' (immediately downstream of Kex2); P, F, Y, W block clean N-terminal processing`
    );
  }

  const hydrophobicRunMax = computeHydrophobicRunMax(seq);
  if (hydrophobicRunMax > MAX_HYDROPHOBIC_RUN) {
    violations.push(
      `liability_aggregation: hydrophobic run of ${hydrophobicRunMax} over [VILMFW] exceeds the ${MAX_HYDROPHOBIC_RUN}-residue secretion cap`
    );
  }

  const maxResidueFraction = computeMaxResidueFraction(seq);
  if (maxResidueFraction > MAX_LOW_COMPLEXITY_FRACTION) {
    violations.push(
      `liability_low_complexity: single-residue fraction ${maxResidueFraction.toFixed(3)} exceeds the ${MAX_LOW_COMPLEXITY_FRACTION.toFixed(1)} low-complexity cap`
    );
  }

  const gravyScore = computeGravy(seq);
  if (gravyScore < spec.gravyMin || gravyScore > spec.gravyMax) {
    violations.push(
      `gravy: expected within [${spec.gravyMin.toFixed(2)}, +${spec.gravyMax.toFixed(2)}], got ${gravyScore.toFixed(3)}`
    );
  }

  const metCount = countResidues(seq, "M");
  if (metCount > MAX_METHIONINES) {
    violations.push(
      `liability_oxidation: ${metCount} methionines exceed the ${MAX_METHIONINES}-residue oxidation cap`
    );
  }
  const deamidation = DEAMIDATION_PATTERN.exec(seq);
  if (deamidation !== null) {
    violations.push(
      `liability_deamidation: 'NG' at index ${deamidation.index} is an asparagine deamidation hotspot`
    );
  }
  const isomerization = ISOMERIZATION_PATTERN.exec(seq);
  if (isomerization !== null) {
    violations.push(
      `liability_isomerization: 'DG' at index ${isomerization.index} is an aspartate isomerization hotspot`
    );
  }
  const acidLabile = ACID_LABILE_PATTERN.exec(seq);
  if (acidLabile !== null) {
    violations.push(
      `liability_acid_labile: 'DP' at index ${acidLabile.index} is an acid-labile bond (stomach-acid cleavage risk)`
    );
  }

  return {
    passed: violations.length === 0,
    length,
    cys_count: cysCount,
    formal_charge: formalCharge,
    net_charge_ph74: computeNetChargeAtPh(seq, 7.4),
    gravy_score: Math.round(gravyScore * 1000) / 1000,
    violations,
    boman_index: computeBomanIndex(seq),
    aliphatic_index: computeAliphaticIndex(seq),
    isoelectric_point: computeIsoelectricPoint(seq),
    mucosal_adhesion_ratio: computeMucosalAdhesionRatio(seq),
    cleavage_susceptibility_index: computeCleavageSusceptibilityIndex(seq),
    hydrophobic_run_max: hydrophobicRunMax,
    max_residue_fraction: maxResidueFraction,
  };
}

/**
 * Maps audit violations to machine-readable failure modes for retry
 * logging and the verification report.
 */
export function auditFailureModes(audit: SymbolicAuditResult): string[] {
  const modes = new Set<string>();
  for (const violation of audit.violations) {
    if (violation.startsWith("non_canonical_residue:")) {
      modes.add("NON_CANONICAL_RESIDUE");
    } else if (violation.startsWith("length:")) {
      modes.add("LENGTH_VIOLATION");
    } else if (violation.startsWith("cysteines:")) {
      modes.add("CYSTEINE_TOPOLOGY_VIOLATION");
    } else if (violation.startsWith("formal_charge_window:")) {
      modes.add("CHARGE_OUT_OF_BOUNDS");
    } else if (violation.startsWith("formal_charge:")) {
      modes.add("CHARGE_TARGET_MISMATCH");
    } else if (violation.startsWith("kex2_site:")) {
      modes.add("KEX2_SITE_DETECTED");
    } else if (violation.startsWith("liability_glycosylation:")) {
      modes.add("N_GLYCOSYLATION_SEQUON");
    } else if (violation.startsWith("chymotrypsin_exposed:")) {
      modes.add("CHYMOTRYPSIN_EXPOSED_SITE");
    } else if (violation.startsWith("n_terminus:")) {
      modes.add("N_TERMINUS_BLOCKED");
    } else if (violation.startsWith("liability_aggregation:")) {
      modes.add("HYDROPHOBIC_RUN_TOO_LONG");
    } else if (violation.startsWith("gravy:")) {
      modes.add("GRAVY_OUT_OF_BOUNDS");
    } else if (violation.startsWith("liability_oxidation:")) {
      modes.add("OXIDATION_LIABILITY");
    } else if (violation.startsWith("liability_deamidation:")) {
      modes.add("DEAMIDATION_HOTSPOT");
    } else if (violation.startsWith("liability_isomerization:")) {
      modes.add("ISOMERIZATION_HOTSPOT");
    } else if (violation.startsWith("liability_acid_labile:")) {
      modes.add("ACID_LABILE_BOND");
    } else if (violation.startsWith("liability_low_complexity:")) {
      modes.add("LOW_COMPLEXITY_SEQUENCE");
    } else {
      modes.add("AUDIT_VIOLATION");
    }
  }
  return [...modes];
}

/**
 * Maps grammar syntax errors to machine-readable failure modes.
 */
export function grammarFailureModes(
  grammar: KnottinGrammarParse
): string[] {
  const modes = new Set<string>();
  for (const error of grammar.syntaxErrors) {
    if (error.startsWith("alphabet:")) {
      modes.add("NON_CANONICAL_RESIDUE");
    } else if (error.startsWith("cysteine_topology:")) {
      modes.add("CYSTEINE_TOPOLOGY_VIOLATION");
    } else {
      modes.add("LOOP_ENVELOPE_VIOLATION");
    }
  }
  return [...modes];
}

/**
 * Builds the per-candidate verification report: one boolean per
 * bioprocess gate plus the combined failure-mode list.
 */
export function buildVerificationReport(
  grammar: KnottinGrammarParse,
  audit: SymbolicAuditResult
): VerificationReport {
  const has = (prefix: string): boolean =>
    audit.violations.some((violation) => violation.startsWith(prefix));
  const kex2Clean = !has("kex2_site:");
  const chymoClean = !has("chymotrypsin_exposed:");
  const failureModes = [
    ...grammarFailureModes(grammar),
    ...auditFailureModes(audit),
  ];
  return {
    kex2_clean: kex2Clean,
    glycosylation_clean: !has("liability_glycosylation:"),
    charge_window_ok: !has("formal_charge_window:"),
    protease_clean: kex2Clean && chymoClean,
    n_terminus_ok: !has("n_terminus:"),
    hydrophobic_runs_ok: !has("liability_aggregation:"),
    gravy_ok: !has("gravy:"),
    oxidation_clean: !has("liability_oxidation:"),
    deamidation_clean: !has("liability_deamidation:"),
    isomerization_clean: !has("liability_isomerization:"),
    acid_clean: !has("liability_acid_labile:"),
    complexity_ok: !has("liability_low_complexity:"),
    ick_topology_ok:
      grammar.valid && !has("length:") && !has("cysteines:"),
    passed: grammar.valid && audit.passed,
    failure_modes: failureModes,
  };
}
