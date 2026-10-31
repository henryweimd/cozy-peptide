import type { LabHandoffManifest } from "../types/peptide";
import { findRestrictionSite, optimizeForSboulardii } from "./codon-optimizer";
import { computeFormalCharge } from "./symbolic-auditor";

/**
 * 85-aa Saccharomyces alpha-mating factor pre-pro secretion leader,
 * ending in the Kex2 processing junction (KR).
 */
export const ALPHA_FACTOR_LEADER_85 =
  "MRFPSIFTAVLFAASSALAAPVNTTTEDETAQIPAEAVIGYSDLEGDFDVAVLPFSNSTNNGLLFINTTIASIAAKEEGVSLEKR";

export const KEX2_JUNCTION = "KR";

/** 5' 40-bp Gibson assembly homology arm (restriction-site free). */
export const GIBSON_ARM_5 = "CAGTACAGTCAGTCTAGACCATGGCATCGATACGATCGTA";

/** 3' 40-bp Gibson assembly homology arm (restriction-site free). */
export const GIBSON_ARM_3 = "GCTAGCTAGCTTAACCGGTACCGGTTAACCGGTTAACCGG";

/** Average isotopic residue masses (Da); water is added for the free peptide. */
const RESIDUE_MASS: Record<string, number> = {
  A: 71.0788,
  R: 156.1875,
  N: 114.1038,
  D: 115.0886,
  C: 103.1388,
  E: 129.1155,
  Q: 128.1307,
  G: 57.0519,
  H: 137.1411,
  I: 113.1594,
  L: 113.1594,
  K: 128.1741,
  M: 131.1925,
  F: 147.1766,
  P: 97.1167,
  S: 87.0782,
  T: 101.1051,
  W: 186.2132,
  Y: 163.176,
  V: 99.1326,
};

const WATER_MASS = 18.01528;

/** Side-chain pKa values used for the theoretical pI calculation. */
const PKA = {
  nTerm: 8.0,
  cTerm: 3.1,
  K: 10.5,
  R: 12.5,
  H: 6.0,
  D: 3.9,
  E: 4.1,
  C: 8.3,
  Y: 10.1,
} as const;

/** Molecular weight (Da) of the free peptide, rounded to 2 decimals. */
export function computeMolecularWeight(sequence: string): number {
  const seq = sequence.trim().toUpperCase();
  let mass = WATER_MASS;
  for (const aa of seq) {
    const residue = RESIDUE_MASS[aa];
    if (residue === undefined) {
      throw new Error(
        `computeMolecularWeight: unsupported residue '${aa}'. Only the 20 canonical amino acids are allowed.`
      );
    }
    mass += residue;
  }
  return Math.round(mass * 100) / 100;
}

function netChargeAtPh(sequence: string, ph: number): number {
  let charge =
    1 / (1 + Math.pow(10, ph - PKA.nTerm)) -
    1 / (1 + Math.pow(10, PKA.cTerm - ph));
  for (const aa of sequence) {
    if (aa === "K") charge += 1 / (1 + Math.pow(10, ph - PKA.K));
    else if (aa === "R") charge += 1 / (1 + Math.pow(10, ph - PKA.R));
    else if (aa === "H") charge += 1 / (1 + Math.pow(10, ph - PKA.H));
    else if (aa === "D") charge -= 1 / (1 + Math.pow(10, PKA.D - ph));
    else if (aa === "E") charge -= 1 / (1 + Math.pow(10, PKA.E - ph));
    else if (aa === "C") charge -= 1 / (1 + Math.pow(10, PKA.C - ph));
    else if (aa === "Y") charge -= 1 / (1 + Math.pow(10, PKA.Y - ph));
  }
  return charge;
}

/**
 * Theoretical isoelectric point via bisection on the net-charge curve,
 * rounded to 2 decimals.
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

function toFasta(header: string, sequence: string): string {
  const clean = sequence.trim().toUpperCase();
  const wrapped: string[] = [];
  for (let i = 0; i < clean.length; i += 60) {
    wrapped.push(clean.slice(i, i + 60));
  }
  return `>${header}\n${wrapped.join("\n")}`;
}

function countResidues(sequence: string, residues: string): number {
  let count = 0;
  for (const aa of sequence) {
    if (residues.includes(aa)) count += 1;
  }
  return count;
}

/**
 * Builds lab-handoff production artifacts for one mature knottin:
 * alpha-factor pre-pro precursor, codon-optimized gBlock flanked by
 * 40-bp Gibson homology arms, MW, pI, and order metadata.
 */
export function buildLabHandoff(matureSeq: string): LabHandoffManifest {
  const mature = matureSeq.trim().toUpperCase();
  if (mature.length === 0) {
    throw new Error("buildLabHandoff: empty mature sequence.");
  }

  const precursor = `${ALPHA_FACTOR_LEADER_85}${mature}`;
  const { dna: cdna } = optimizeForSboulardii(precursor);
  const dnaGblock = `${GIBSON_ARM_5}${cdna}${GIBSON_ARM_3}`;

  let gcCount = 0;
  for (const base of dnaGblock) {
    if (base === "G" || base === "C") gcCount += 1;
  }
  const gcContent = Math.round((gcCount / dnaGblock.length) * 10000) / 10000;

  const mwDa = computeMolecularWeight(mature);
  const pi = computeIsoelectricPoint(mature);

  return {
    mature_fasta: toFasta(
      `mature_knottin length=${mature.length} charge=${computeFormalCharge(mature)}`,
      mature
    ),
    precursor_fasta: toFasta(
      `alpha_factor_prepro_85aa_KR_junction length=${precursor.length}`,
      precursor
    ),
    dna_gblock: dnaGblock,
    gc_content: gcContent,
    mw_da: mwDa,
    pi,
    order_metadata: {
      product: "gBlock",
      organism: "Saccharomyces boulardii",
      leader: "Saccharomyces alpha-mating factor pre-pro (85 aa)",
      leader_length: ALPHA_FACTOR_LEADER_85.length,
      kex2_junction: KEX2_JUNCTION,
      mature_length: mature.length,
      precursor_length: precursor.length,
      cdna_length: cdna.length,
      gblock_length: dnaGblock.length,
      gibson_arm_5: GIBSON_ARM_5,
      gibson_arm_3: GIBSON_ARM_3,
      gibson_arm_length: GIBSON_ARM_5.length,
      restriction_site_check: findRestrictionSite(dnaGblock) ?? "clean",
      disulfide_topology: "C1-C4,C2-C5,C3-C6",
      mature_cys_count: countResidues(mature, "C"),
      mature_formal_charge: computeFormalCharge(mature),
      stop_codon_note:
        "No in-frame stop codon appended; use the destination vector stop codon or add TAA during cloning.",
      generated_at: new Date().toISOString(),
    },
  };
}
