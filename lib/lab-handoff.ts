import type { LabHandoffManifest } from "../types/peptide";
import {
  RESTRICTION_SITES,
  computeCAI,
  findRestrictionSite,
  optimizeForSboulardii,
} from "./codon-optimizer";
import { computeFormalCharge, computeIsoelectricPoint } from "./symbolic-auditor";

/**
 * 85-aa Saccharomyces cerevisiae MF-alpha-1 pre-pro secretion leader,
 * ending in the native Kex2 dibasic endoprotease junction SLDKR.
 */
export const ALPHA_FACTOR_LEADER_85 =
  "MRFPSIFTAVLFAASSALAAPVNTTTEDETAQIPAEAVIGYSDLEGDFDVAVLPFSNSTNNGLLFINTTIASIAAKEEGVSLDKR";

export const KEX2_JUNCTION = "KR";
export const SLDKR_JUNCTION = "SLDKR";

export const YEAST_CHASSIS = "Saccharomyces boulardii (ATCC MYA-796)";
export const SECRETION_LEADER_LABEL = "MF-alpha-1 (85 aa) + Kex2 (KR)";

/** 5' 40-bp Gibson homology arm for pESC / pPic9 integration. */
export const GIBSON_ARM_5 = "ACACAAACAAAAGATACACAAACAACGATATATACAAAAC";

/** 3' 40-bp Gibson homology arm for pESC / pPic9 integration. */
export const GIBSON_ARM_3 = "TCCTTGACGTTAAAGTATAGAGGTATATTAACAATTTTTT";

export const VECTOR_INTEGRATION_STRATEGY =
  "Gibson assembly into pESC / pPic9 episomal expression backbones via 40-bp homology arms";

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

function gcFraction(dna: string): number {
  if (dna.length === 0) return 0;
  let gcCount = 0;
  for (const base of dna) {
    if (base === "G" || base === "C") gcCount += 1;
  }
  return gcCount / dna.length;
}

/** Short deterministic construct tag derived from the mature sequence. */
function constructTag(mature: string): string {
  let hash = 2166136261;
  for (let i = 0; i < mature.length; i += 1) {
    hash ^= mature.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 6);
}

/**
 * Builds the translational yeast expression cassette for one mature
 * knottin: MF-alpha-1 pre-pro precursor with the SLDKR Kex2 junction,
 * yeast-optimized cDNA, gBlock flanked by pESC/pPic9 Gibson homology
 * arms, biophysics, restriction-scrub verification, and a vendor-ready
 * synthesis order payload.
 */
export function buildLabHandoff(matureSeq: string): LabHandoffManifest {
  const mature = matureSeq.trim().toUpperCase();
  if (mature.length === 0) {
    throw new Error("buildLabHandoff: empty mature sequence.");
  }

  const precursor = `${ALPHA_FACTOR_LEADER_85}${mature}`;
  const { dna: cdna } = optimizeForSboulardii(precursor);
  const dnaGblock = `${GIBSON_ARM_5}${cdna}${GIBSON_ARM_3}`;

  const gcContent = Math.round(gcFraction(dnaGblock) * 10000) / 10000;
  const gcPercent = Math.round(gcFraction(dnaGblock) * 1000) / 10;
  const mwDa = computeMolecularWeight(mature);
  const pi = computeIsoelectricPoint(mature);
  const cai = computeCAI(cdna, precursor);
  const residualSite = findRestrictionSite(dnaGblock);

  return {
    mature_fasta: toFasta(
      `mature_knottin length=${mature.length} charge=${computeFormalCharge(mature)}`,
      mature
    ),
    precursor_fasta: toFasta(
      `MFa1_prepro_85aa_SLDKR_junction length=${precursor.length}`,
      precursor
    ),
    dna_gblock: dnaGblock,
    gc_content: gcContent,
    mw_da: mwDa,
    pi,
    order_metadata: {
      product: "gBlock",
      organism: "Saccharomyces boulardii",
      yeast_chassis: YEAST_CHASSIS,
      leader: "Saccharomyces cerevisiae MF-alpha-1 pre-pro (85 aa)",
      leader_length: ALPHA_FACTOR_LEADER_85.length,
      kex2_junction: SLDKR_JUNCTION,
      mature_length: mature.length,
      precursor_length: precursor.length,
      cdna_length: cdna.length,
      gblock_length: dnaGblock.length,
      gibson_arm_5: GIBSON_ARM_5,
      gibson_arm_3: GIBSON_ARM_3,
      gibson_arm_length: GIBSON_ARM_5.length,
      cai,
      restriction_site_check: residualSite ?? "clean",
      disulfide_topology: "C1-C4,C2-C5,C3-C6",
      mature_cys_count: countResidues(mature, "C"),
      mature_formal_charge: computeFormalCharge(mature),
      stop_codon_note:
        "No in-frame stop codon appended; use the destination vector stop codon or add TAA during cloning.",
      generated_at: new Date().toISOString(),
    },
    cdna_sequence: cdna,
    gibson_5p_arm: GIBSON_ARM_5,
    gibson_3p_arm: GIBSON_ARM_3,
    cai,
    restriction_scrub: {
      status: residualSite === null ? "clean" : `residual site: ${residualSite}`,
      sites_verified: [...RESTRICTION_SITES],
    },
    synthesis_order: {
      sequence_name: `SB-KNOT-${constructTag(mature)}`,
      dna_length: dnaGblock.length,
      gc_percent: gcPercent,
      volume: "500 ng lyophilized dsDNA fragment",
      vector_integration_strategy: VECTOR_INTEGRATION_STRATEGY,
      vendor_notes:
        "Compatible with Twist Bioscience and IDT gBlock order forms.",
    },
    yeast_chassis: YEAST_CHASSIS,
    secretion_leader: SECRETION_LEADER_LABEL,
  };
}
