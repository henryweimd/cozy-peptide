import type { Modality } from "./modality";
import { specForModality } from "./modality";
import {
  computeBomanIndex,
  computeCleavageSusceptibilityIndex,
  computeGravy,
  computeHydrophobicRunMax,
  computeMaxResidueFraction,
  computeMucosalAdhesionRatio,
} from "./symbolic-auditor";

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function countResidues(sequence: string, residues: string): number {
  let count = 0;
  for (const aa of sequence) {
    if (residues.includes(aa)) count += 1;
  }
  return count;
}

function countMotif(sequence: string, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let count = 0;
  while (re.exec(sequence) !== null) count += 1;
  return count;
}

export interface TherapeuticBreakdown {
  /** Protease resistance from the cleavage susceptibility index. */
  proteaseResistance: number;
  /** Charge centrality inside the +1..+4 window. */
  chargeCentrality: number;
  /** GRAVY centrality inside the modality window. */
  solubilityBalance: number;
  /** Boman binding band: moderate-high potential without stickiness. */
  bindingPotential: number;
  /** Mucosal adhesion presence (basic-over-acidic surface). */
  mucosalDwell: number;
}

export interface SafetyBreakdown {
  /** Absence of oxidation/deamidation/isomerization hotspots. */
  chemicalStability: number;
  /** Protease resistance (shared with therapeutic). */
  proteaseResistance: number;
  /** Hydrophobic load: short runs, no greasy stretches. */
  aggregationMargin: number;
  /** Cationic-plus-hydrophobic hemolysis-risk proxy stays low. */
  membraneSelectivity: number;
  /** Compositional simplicity (no low-complexity repeats). */
  sequenceSimplicity: number;
}

export interface TherapeuticAssessment {
  therapeutic_index: number;
  safety_index: number;
  therapeutic_breakdown: TherapeuticBreakdown;
  safety_breakdown: SafetyBreakdown;
}

/**
 * Therapeutic index (0-100): how promising a candidate looks as a gut
 * therapeutic, from deterministic sequence readouts only. Components:
 * - protease resistance 30%: 1 - cleavage susceptibility (capped)
 * - charge centrality 20%: formal charge near the window center (+2.5)
 * - solubility balance 20%: GRAVY near the modality window center
 * - binding potential 15%: Boman index inside the 0.5-2.5 band
 * - mucosal dwell 15%: basic-over-acidic surface ratio >= 1
 */
export function computeTherapeuticIndex(
  sequence: string,
  modality: Modality,
  chargeTarget: number
): { index: number; breakdown: TherapeuticBreakdown } {
  const seq = sequence.trim().toUpperCase();
  const spec = specForModality(modality);

  const cleavage = computeCleavageSusceptibilityIndex(seq);
  const proteaseResistance = clamp01(1 - cleavage / 0.6);

  const formalCharge =
    countResidues(seq, "KR") - countResidues(seq, "DE");
  const chargeCentrality = clamp01(
    1 - Math.abs(formalCharge - chargeTarget) / 4
  );

  const gravy = computeGravy(seq);
  const center = (spec.gravyMin + spec.gravyMax) / 2;
  const halfWidth = Math.max((spec.gravyMax - spec.gravyMin) / 2, 0.05);
  const solubilityBalance = clamp01(1 - Math.abs(gravy - center) / halfWidth);

  const boman = computeBomanIndex(seq);
  const bindingPotential =
    boman < 0.5
      ? clamp01(boman / 0.5) * 0.7
      : boman <= 2.5
        ? 1
        : clamp01(1 - (boman - 2.5) / 2.5);

  const adhesion = computeMucosalAdhesionRatio(seq);
  const mucosalDwell = adhesion >= 2 ? 1 : adhesion >= 1 ? 0.8 : adhesion > 0 ? 0.4 : 0.2;

  const breakdown: TherapeuticBreakdown = {
    proteaseResistance: round2(proteaseResistance),
    chargeCentrality: round2(chargeCentrality),
    solubilityBalance: round2(solubilityBalance),
    bindingPotential: round2(bindingPotential),
    mucosalDwell: round2(mucosalDwell),
  };
  const index =
    100 *
    (0.3 * proteaseResistance +
      0.2 * chargeCentrality +
      0.2 * solubilityBalance +
      0.15 * bindingPotential +
      0.15 * mucosalDwell);
  return { index: round2(index), breakdown };
}

/**
 * Safety index (0-100): how clean a candidate looks for continuous gut
 * exposure, from deterministic sequence readouts only. Components:
 * - chemical stability 30%: no M beyond one, no NG/DG hotspots
 * - protease resistance 25%: shared with therapeutic
 * - aggregation margin 20%: hydrophobic runs well under the cap
 * - membrane selectivity 15%: penalizes cationic-plus-greasy
 *   compositions (a documented hemolysis-risk proxy, not a prediction)
 * - sequence simplicity 10%: no low-complexity residue dominance
 */
export function computeSafetyIndex(sequence: string): {
  index: number;
  breakdown: SafetyBreakdown;
} {
  const seq = sequence.trim().toUpperCase();

  const metCount = countResidues(seq, "M");
  const ngCount = countMotif(seq, /NG/);
  const dgCount = countMotif(seq, /DG/);
  const hotspotPenalty = Math.min(
    1,
    Math.max(0, metCount - 1) * 0.2 + ngCount * 0.3 + dgCount * 0.3
  );
  const chemicalStability = clamp01(1 - hotspotPenalty);

  const cleavage = computeCleavageSusceptibilityIndex(seq);
  const proteaseResistance = clamp01(1 - cleavage / 0.6);

  const runMax = computeHydrophobicRunMax(seq);
  const aggregationMargin = clamp01(1 - runMax / 6);

  const cationicFraction =
    seq.length === 0 ? 0 : countResidues(seq, "KR") / seq.length;
  const hydrophobicFraction =
    seq.length === 0
      ? 0
      : countResidues(seq, "VILMFW") / seq.length;
  const membraneSelectivity = clamp01(
    1 - Math.max(0, cationicFraction - 0.1) * hydrophobicFraction * 4
  );

  const maxFraction = computeMaxResidueFraction(seq);
  const sequenceSimplicity = clamp01(1 - Math.max(0, maxFraction - 0.3) * 2);

  const breakdown: SafetyBreakdown = {
    chemicalStability: round2(chemicalStability),
    proteaseResistance: round2(proteaseResistance),
    aggregationMargin: round2(aggregationMargin),
    membraneSelectivity: round2(membraneSelectivity),
    sequenceSimplicity: round2(sequenceSimplicity),
  };
  const index =
    100 *
    (0.3 * chemicalStability +
      0.25 * proteaseResistance +
      0.2 * aggregationMargin +
      0.15 * membraneSelectivity +
      0.1 * sequenceSimplicity);
  return { index: round2(index), breakdown };
}

/**
 * Full therapeutic assessment for an audited candidate. Reported in the
 * audit ledger and used (higher wins) to rank passing pools.
 */
export function assessCandidate(
  sequence: string,
  modality: Modality,
  chargeTarget: number
): TherapeuticAssessment {
  const therapeutic = computeTherapeuticIndex(sequence, modality, chargeTarget);
  const safety = computeSafetyIndex(sequence);
  return {
    therapeutic_index: therapeutic.index,
    safety_index: safety.index,
    therapeutic_breakdown: therapeutic.breakdown,
    safety_breakdown: safety.breakdown,
  };
}
