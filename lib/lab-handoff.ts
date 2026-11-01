import type { CloningPayload, LabHandoffManifest } from "../types/peptide";
import {
  CODON_TABLE,
  GC_CDS_MAX,
  GC_CDS_MIN,
  RARE_CODONS,
  RESTRICTION_SITES,
  computeCAI,
  computeGcContent,
  computeHostCAI,
  countRestrictionSites,
  findFirstSiteHit,
  findRestrictionSite,
  optimizeCdsForHostId,
  optimizeForSboulardii,
  optimizePayloadCds,
  tablesForBacterialHost,
} from "./codon-optimizer";
import { computeFormalCharge, computeIsoelectricPoint } from "./symbolic-auditor";
import { type Modality, specForModality } from "./modality";
import { specForHost, type HostId } from "./hosts";
import { planBiocontainment } from "./biocontainment";

/**
 * 85-aa Saccharomyces cerevisiae MF-alpha-1 pre-pro secretion leader
 * (UniProt P01149 residues 1-85), ending in the native Kex2 dibasic
 * endoprotease junction SLDKR.
 */
export const ALPHA_FACTOR_LEADER_85 =
  "MRFPSIFTAVLFAASSALAAPVNTTTEDETAQIPAEAVIGYLDLEGDFDVAVLPFSNSTNNGLLFINTTIASIAAKEEGVSLDKR";

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

/** Dual stop codon terminating the knottin payload CDS. */
export const DUAL_STOP_CODON = "TAATGA";

/** Flanking-context label for the modular yeast cassette. */
export const CASSETTE_FORMAT = "MFalpha1-Kex2-Knottin-CYC1term";

/**
 * Fixed Kex2 junction DNA closing the MFalpha1 5' flank (encodes NLEKR;
 * Kex2 cleaves after the KR dibasic, releasing the payload with a clean
 * N-terminus).
 */
export const LEADER_JUNCTION_DNA = "AACCTGGAAAAGAGA";

/**
 * S. cerevisiae CYC1 terminator: 250 bp of native 3' UTR immediately
 * downstream of the CYC1 stop codon (S288C chrX NC_001142.9:526664-526913).
 */
export const CYC1_TERMINATOR_250 =
  "AACAGGCCCCTTTTCCTTTGTCGATATCATGTAATTAGTTATGTCACGCTTA" +
  "CATTCACGCCCTCCTCCCACATCCGCTCTAACCGAAAAGGAAGGAGTTAGACAACCTGAAGTCTAGGTCCCTATTTATTT" +
  "TTTTTAATAGTTATGTTAGTATTAAGAACGTTATTTATATTTCAAATTTTTCTTTTTTTTCTGTACAAACGCGTGTACGC" +
  "ATGTAACATTATACTGAAAACCTTGCTTGAGAAGGTTT";

/**
 * Builds the fixed 255-nt MFalpha1 5' flank CDS: codon-optimized native
 * leader residues 1-80 closed by the fixed Kex2 junction DNA. Any cloning
 * site spanning the internal boundary is repaired with synonymous,
 * non-rare swaps inside the optimized region.
 */
function buildLeaderCds(): string {
  const leader80 = ALPHA_FACTOR_LEADER_85.slice(0, 80);
  let dna = `${optimizeForSboulardii(leader80).dna}${LEADER_JUNCTION_DNA}`;
  for (let iter = 0; iter < 50; iter += 1) {
    const hit = findFirstSiteHit(dna);
    if (hit === null) return dna;
    const boundary = leader80.length * 3;
    const spansBoundary =
      hit.index < boundary && hit.index + hit.site.length > boundary;
    if (!spansBoundary) return dna;
    const before = countRestrictionSites(dna);
    const codons: string[] = [];
    for (let i = 0; i < leader80.length; i += 1) {
      codons.push(dna.slice(i * 3, i * 3 + 3));
    }
    let fixed = false;
    const firstCodon = Math.floor(hit.index / 3);
    for (let ci = firstCodon; ci < leader80.length && !fixed; ci += 1) {
      const aa = leader80[ci] ?? "";
      const ordered = [...(CODON_TABLE[aa] ?? [])].sort((x, y) => {
        const xr = RARE_CODONS.has(x) ? 1 : 0;
        const yr = RARE_CODONS.has(y) ? 1 : 0;
        return xr - yr;
      });
      for (const candidate of ordered) {
        if (candidate === codons[ci]) continue;
        const trial = [...codons];
        trial[ci] = candidate;
        if (countRestrictionSites(trial.join("") + LEADER_JUNCTION_DNA) < before) {
          codons[ci] = candidate;
          fixed = true;
          break;
        }
      }
    }
    if (!fixed) return dna;
    dna = codons.join("") + LEADER_JUNCTION_DNA;
  }
  return dna;
}

/** Fixed 255-nt MFalpha1 5' flank CDS ending in the Kex2 junction. */
export const LEADER_CDS_5FLANK = buildLeaderCds();

/** Protein translation of the fixed 5' flank (85 aa, ends NLEKR). */
export const CASSETTE_LEADER_PROTEIN =
  `${ALPHA_FACTOR_LEADER_85.slice(0, 80)}NLEKR`;

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
export interface SynthesisDifficulty {
  /** 0-100, higher means easier to synthesize. */
  score: number;
  homopolymer_runs: string[];
  gc_extreme_windows: string[];
  repeat_flags: string[];
}

/** Homopolymer run length that vendors flag (synthesis errors). */
export const HOMOPOLYMER_FLAG_LENGTH = 5;
/** Sliding window for GC-extreme detection. */
export const GC_WINDOW = 50;

/**
 * Scores DNA synthesis difficulty for vendor ordering: homopolymer runs
 * of 5+, 50-nt windows outside 25-75% GC, and direct repeats of 10+ bp.
 * Score starts at 100 and loses 15 per homopolymer, 10 per extreme
 * window, and 10 per repeat, floored at 0.
 */
export function assessSynthesisDifficulty(dna: string): SynthesisDifficulty {
  const seq = dna.trim().toUpperCase();
  const homopolymer_runs: string[] = [];
  const gc_extreme_windows: string[] = [];
  const repeat_flags: string[] = [];

  const runRe = new RegExp(
    `(A{${HOMOPOLYMER_FLAG_LENGTH},}|C{${HOMOPOLYMER_FLAG_LENGTH},}|G{${HOMOPOLYMER_FLAG_LENGTH},}|T{${HOMOPOLYMER_FLAG_LENGTH},})`,
    "g"
  );
  let runMatch: RegExpExecArray | null;
  while ((runMatch = runRe.exec(seq)) !== null) {
    homopolymer_runs.push(
      `${runMatch[1]?.[0] ?? "?"}x${runMatch[1]?.length ?? 0} at ${runMatch.index}`
    );
  }

  for (let i = 0; i + GC_WINDOW <= seq.length; i += 10) {
    const window = seq.slice(i, i + GC_WINDOW);
    let gc = 0;
    for (const base of window) {
      if (base === "G" || base === "C") gc += 1;
    }
    const fraction = gc / GC_WINDOW;
    if (fraction > 0.75 || fraction < 0.25) {
      gc_extreme_windows.push(
        `${i}-${i + GC_WINDOW} gc=${Math.round(fraction * 100)}%`
      );
    }
  }

  const seen = new Map<string, number>();
  for (let i = 0; i + 10 <= seq.length; i += 1) {
    const kmer = seq.slice(i, i + 10);
    const first = seen.get(kmer);
    if (first === undefined) {
      seen.set(kmer, i);
    } else if (repeat_flags.length < 5) {
      repeat_flags.push(`10-mer repeat at ${first} and ${i}`);
    }
  }

  const score = Math.max(
    0,
    100 -
      homopolymer_runs.length * 15 -
      gc_extreme_windows.length * 10 -
      repeat_flags.length * 10
  );
  return { score, homopolymer_runs, gc_extreme_windows, repeat_flags };
}

/**
 * Builds a vendor-ready order CSV: one row per DNA artifact (gBlock and
 * precursor cDNA) with construct id, length, and GC percent.
 */
export function buildOrderCsv(
  constructId: string,
  gblockDna: string,
  payloadCds: string
): string {
  const gcPercent = (dna: string): string =>
    `${Math.round(gcFraction(dna) * 1000) / 10}`;
  const rows = [
    "construct_id,artifact,dna_length,gc_percent,sequence",
    `${constructId},gblock,${gblockDna.length},${gcPercent(gblockDna)},${gblockDna}`,
    `${constructId},precursor_cdna,${payloadCds.length},${gcPercent(payloadCds)},${payloadCds}`,
  ];
  return rows.join("\n");
}

export function constructTag(mature: string): string {
  let hash = 2166136261;
  for (let i = 0; i < mature.length; i += 1) {
    hash ^= mature.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 6);
}

/**
 * CRO-readable host plan embedded in every manifest: secretion,
 * folding, proteases, colonization, containment, and plasmid posture
 * for the chosen chassis, plus the sequence-derived containment
 * pre-screens.
 */
function buildHostPlan(
  mature: string,
  modality: Modality,
  host: HostId
): Record<string, unknown> {
  const hostSpec = specForHost(host);
  const containment = planBiocontainment(mature, modality, host);
  return {
    host,
    host_display: `${hostSpec.name} (${hostSpec.strain})`,
    kind: hostSpec.kind,
    delivery: hostSpec.delivery,
    colonization: hostSpec.colonization,
    colonization_note: hostSpec.colonizationNote,
    secretion_system: hostSpec.secretion.system,
    leader: hostSpec.secretion.leaderName,
    leader_evidence: hostSpec.secretion.leaderEvidence,
    leader_note: hostSpec.secretion.note,
    folding: hostSpec.folding,
    proteases: hostSpec.proteases,
    auxotrophy: containment.auxotrophy,
    kill_switches: containment.killSwitches,
    integration: containment.integration,
    plasmid_stability: containment.plasmidStability,
    payload_toxicity: containment.payloadToxicity,
    containment_notes: containment.notes,
    codon_basis: hostSpec.codonBasis,
    codon_note: hostSpec.codonNote,
  };
}

/** Cyclization manufacturing note for cyclic scaffolds. */
function cyclizationNote(modality: Modality): Record<string, string> {
  if (specForModality(modality).cyclic !== true) return {};
  return {
    cyclization:
      "Mature backbone is head-to-tail cyclic; the fragment encodes the linear precursor — ligation (split-intein/sortase) is a CRO manufacturing step.",
  };
}

/**
 * Bacterial expression fragment: leader CDS (when the registry vouches
 * for the sequence) plus host-optimized payload CDS plus TAA. Vector
 * homology arms are backbone-specific, so the CRO designs them from
 * the destination vector — the manifest says so instead of printing
 * arms for the wrong plasmid.
 */
export function buildBacterialHandoff(
  matureSeq: string,
  modality: Modality,
  host: HostId
): LabHandoffManifest {
  const mature = matureSeq.trim().toUpperCase();
  if (mature.length === 0) {
    throw new Error("buildBacterialHandoff: empty mature sequence.");
  }
  const spec = specForModality(modality);
  const hostSpec = specForHost(host);
  const leader = hostSpec.secretion.leaderSequence;
  const leaderCds =
    leader === null ? "" : optimizeCdsForHostId(host, leader).dna;
  const payload = optimizeCdsForHostId(host, mature);
  const fragment = scrubBacterialFragment(
    `${leaderCds}${payload.dna}TAA`,
    leaderCds.length / 3,
    leader ?? "",
    mature,
    host
  );
  const payloadRegion = fragment.slice(
    leaderCds.length,
    leaderCds.length + payload.dna.length
  );
  const precursor = leader === null ? mature : `${leader}${mature}`;
  const gcContent = Math.round(gcFraction(fragment) * 10000) / 10000;
  const gcPercent = Math.round(gcFraction(fragment) * 1000) / 10;
  const cai = computeHostCAI(host, payloadRegion, mature);
  const residualSite = findRestrictionSite(fragment);
  const constructId = `${spec.idPrefix}${constructTag(mature)}`;
  const strategies: Record<string, string> = {
    "ecoli-nissle":
      "Golden Gate or Gibson into a PelB periplasmic expression vector (pET/pTrc lineage); CRO finalizes overhangs",
    "lactococcus-lactis":
      "NICE-system integration (pNZ8148 lineage) via vendor-designed overhangs; confirm the SPusp45 junction by sequencing",
    "bacillus-subtilis":
      "amyE/thrC double-crossover integration in the WB800 background; CRO finalizes homology arms",
  };
  const vendorNotes: Record<string, string> = {
    "ecoli-nissle":
      "Compatible with Twist Bioscience and IDT fragment order forms; confirm the PelB junction by sequencing.",
    "lactococcus-lactis":
      "Native L. lactis codons; compatible with Twist/IDT fragment forms. Confirm the SPusp45 junction by sequencing.",
    "bacillus-subtilis":
      "Native B. subtilis codons; compatible with Twist/IDT fragment forms. Confirm the SacB junction by sequencing.",
  };
  const leaderTag =
    host === "lactococcus-lactis"
      ? "SPusp45_27aa"
      : host === "bacillus-subtilis"
        ? "SacB_29aa"
        : "PelB_22aa_periplasm";
  return {
    mature_fasta: toFasta(
      `mature_${spec.payloadNoun} length=${mature.length} charge=${computeFormalCharge(mature)}`,
      mature
    ),
    precursor_fasta: toFasta(
      leader === null
        ? `mature_no_leader leader_designed_by_CRO length=${mature.length}`
        : `${leaderTag} length=${precursor.length}`,
      precursor
    ),
    dna_gblock: fragment,
    gc_content: gcContent,
    mw_da: computeMolecularWeight(mature),
    pi: computeIsoelectricPoint(mature),
    order_metadata: {
      product: "gene fragment",
      organism: hostSpec.name,
      host,
      host_strain: hostSpec.strain,
      leader: hostSpec.secretion.leaderName,
      leader_evidence: hostSpec.secretion.leaderEvidence,
      leader_note: hostSpec.secretion.note,
      mature_length: mature.length,
      precursor_length: precursor.length,
      payload_cds_length: payloadRegion.length,
      fragment_length: fragment.length,
      codon_basis: hostSpec.codonBasis,
      codon_note: hostSpec.codonNote,
      cai,
      restriction_site_check: residualSite ?? "clean",
      disulfide_topology:
        modality === "knottin-6c" ? "C1-C4,C2-C5,C3-C6" : spec.topologyLabel,
      mature_cys_count: countResidues(mature, "C"),
      mature_formal_charge: computeFormalCharge(mature),
      stop_codon_note:
        "TAA appended; clone downstream of the vector ATG start codon.",
      vector_arms_note:
        "Vector homology arms are backbone-specific — designed by the CRO from the destination vector.",
      ...cyclizationNote(modality),
      generated_at: new Date().toISOString(),
    },
    cdna_sequence: payloadRegion,
    gibson_5p_arm: "",
    gibson_3p_arm: "",
    cai,
    restriction_scrub: {
      status: residualSite === null ? "clean" : `residual site: ${residualSite}`,
      sites_verified: [...RESTRICTION_SITES],
    },
    synthesis_order: {
      sequence_name: constructId,
      dna_length: fragment.length,
      gc_percent: gcPercent,
      volume: "500 ng lyophilized dsDNA fragment",
      vector_integration_strategy:
        strategies[host] ?? "CRO-designed vector integration",
      vendor_notes: vendorNotes[host] ?? "Vendor re-optimizes codons natively.",
    },
    yeast_chassis: `${hostSpec.name} (${hostSpec.strain})`,
    secretion_leader: hostSpec.secretion.leaderName,
    synthesis_difficulty: assessSynthesisDifficulty(fragment),
    order_csv: buildOrderCsv(constructId, fragment, payloadRegion),
    host,
    host_display: `${hostSpec.name} (${hostSpec.strain})`,
    codon_basis: hostSpec.codonBasis,
    host_plan: buildHostPlan(mature, modality, host),
  };
}

/**
 * Scrubs cloning sites spanning the leader/payload/TAA junctions of a
 * bacterial fragment. Only host-table codons are tunable (the TAA
 * stop is fixed), and swaps are always non-rare synonyms.
 */
function scrubBacterialFragment(
  fragment: string,
  leaderCodons: number,
  leaderAa: string,
  mature: string,
  host: HostId
): string {
  const tables = tablesForBacterialHost(host);
  const totalCodons = (fragment.length - 3) / 3;
  const codons: string[] = [];
  for (let i = 0; i < totalCodons; i += 1) {
    codons.push(fragment.slice(i * 3, i * 3 + 3));
  }
  const stop = fragment.slice(totalCodons * 3);
  for (let iter = 0; iter < 100; iter += 1) {
    const full = codons.join("") + stop;
    const hit = findFirstSiteHit(full);
    if (hit === null) return full;
    const firstCodon = Math.max(0, Math.floor(hit.index / 3));
    const lastCodon = Math.min(
      totalCodons - 1,
      Math.floor((hit.index + hit.site.length - 1) / 3)
    );
    if (lastCodon < firstCodon) return full;
    const before = countRestrictionSites(full);
    let fixed = false;
    for (let ci = firstCodon; ci <= lastCodon && !fixed; ci += 1) {
      const aa =
        ci < leaderCodons
          ? (leaderAa[ci] ?? "")
          : (mature[ci - leaderCodons] ?? "");
      const ordered = [...(tables.table[aa] ?? [])].sort((x, y) => {
        const xr = tables.rare.has(x) ? 1 : 0;
        const yr = tables.rare.has(y) ? 1 : 0;
        return xr - yr;
      });
      for (const candidate of ordered) {
        if (candidate === codons[ci] || tables.rare.has(candidate)) {
          continue;
        }
        const trial = [...codons];
        trial[ci] = candidate;
        if (countRestrictionSites(trial.join("") + stop) < before) {
          codons[ci] = candidate;
          fixed = true;
          break;
        }
      }
    }
    if (!fixed) return full;
  }
  return codons.join("") + stop;
}

/**
 * Builds the translational yeast expression cassette for one mature
 * peptide: MF-alpha-1 pre-pro precursor with the SLDKR Kex2 junction,
 * yeast-optimized cDNA, gBlock flanked by pESC/pPic9 Gibson homology
 * arms, biophysics, restriction-scrub verification, and a vendor-ready
 * synthesis order payload. Bacterial hosts dispatch to the fragment
 * builder above.
 */
export function buildLabHandoff(
  matureSeq: string,
  modality: Modality = "knottin-6c",
  host: HostId = "sboulardii"
): LabHandoffManifest {
  const mature = matureSeq.trim().toUpperCase();
  if (mature.length === 0) {
    throw new Error("buildLabHandoff: empty mature sequence.");
  }
  if (host !== "sboulardii") {
    return buildBacterialHandoff(mature, modality, host);
  }
  const spec = specForModality(modality);

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
      `mature_${spec.payloadNoun} length=${mature.length} charge=${computeFormalCharge(mature)}`,
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
      disulfide_topology:
        modality === "knottin-6c" ? "C1-C4,C2-C5,C3-C6" : spec.topologyLabel,
      mature_cys_count: countResidues(mature, "C"),
      mature_formal_charge: computeFormalCharge(mature),
      stop_codon_note:
        "No in-frame stop codon appended; use the destination vector stop codon or add TAA during cloning.",
      ...cyclizationNote(modality),
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
      sequence_name: `${spec.idPrefix}${constructTag(mature)}`,
      dna_length: dnaGblock.length,
      gc_percent: gcPercent,
      volume: "500 ng lyophilized dsDNA fragment",
      vector_integration_strategy: VECTOR_INTEGRATION_STRATEGY,
      vendor_notes:
        "Compatible with Twist Bioscience and IDT gBlock order forms.",
    },
    yeast_chassis: YEAST_CHASSIS,
    secretion_leader: SECRETION_LEADER_LABEL,
    synthesis_difficulty: assessSynthesisDifficulty(dnaGblock),
    order_csv: buildOrderCsv(
      `${spec.idPrefix}${constructTag(mature)}`,
      dnaGblock,
      cdna
    ),
    host,
    host_display: `${specForHost(host).name} (${specForHost(host).strain})`,
    codon_basis: "native",
    host_plan: buildHostPlan(mature, modality, host),
  };
}

/**
 * Scrubs cloning sites spanning the payload junctions of the modular
 * cassette. Only payload codons are tunable (the leader and terminator
 * flanks are fixed), and swaps are always non-rare synonyms.
 */
function scrubPayloadJunctions(payloadCds: string, mature: string): string {
  const codons: string[] = [];
  for (let i = 0; i < mature.length; i += 1) {
    codons.push(payloadCds.slice(i * 3, i * 3 + 3));
  }
  for (let iter = 0; iter < 100; iter += 1) {
    const full = `${LEADER_CDS_5FLANK}${codons.join("")}${DUAL_STOP_CODON}${CYC1_TERMINATOR_250}`;
    const hit = findFirstSiteHit(full);
    if (hit === null) return codons.join("");
    const leaderLen = LEADER_CDS_5FLANK.length;
    const firstCodon = Math.max(
      0,
      Math.floor((hit.index - leaderLen) / 3)
    );
    const lastCodon = Math.min(
      mature.length - 1,
      Math.floor((hit.index + hit.site.length - 1 - leaderLen) / 3)
    );
    if (lastCodon < firstCodon) return codons.join("");
    const before = countRestrictionSites(full);
    let fixed = false;
    for (let ci = firstCodon; ci <= lastCodon && !fixed; ci += 1) {
      const aa = mature[ci] ?? "";
      const ordered = [...(CODON_TABLE[aa] ?? [])].sort((x, y) => {
        const xr = RARE_CODONS.has(x) ? 1 : 0;
        const yr = RARE_CODONS.has(y) ? 1 : 0;
        return xr - yr;
      });
      for (const candidate of ordered) {
        if (candidate === codons[ci] || RARE_CODONS.has(candidate)) continue;
        const trial = [...codons];
        trial[ci] = candidate;
        const trialFull = `${LEADER_CDS_5FLANK}${trial.join("")}${DUAL_STOP_CODON}${CYC1_TERMINATOR_250}`;
        if (countRestrictionSites(trialFull) < before) {
          codons[ci] = candidate;
          fixed = true;
          break;
        }
      }
    }
    if (!fixed) return codons.join("");
  }
  return codons.join("");
}

/**
 * Cassette-format labels for bacterial expression fragments. The
 * terminator and vector arms are backbone-provided; the fragment is
 * leader CDS (when vouched) plus payload CDS plus TAA.
 */
function bacterialCassetteFormat(host: HostId): string {
  switch (host) {
    case "ecoli-nissle":
      return "PelB-Sec-Periplasm-TAA";
    case "lactococcus-lactis":
      return "SPusp45-Sec-Extracellular-TAA";
    case "bacillus-subtilis":
      return "SacB-Sec-Extracellular-TAA";
    case "sboulardii":
    default:
      return "MFalpha1-Kex2-Payload-CYC1term";
  }
}

/**
 * Builds the ready-to-clone expression cassette for one mature
 * peptide. Yeast gets the modular MFalpha1 5' flank with the Kex2
 * junction, GC-tuned payload CDS, dual stop codon, and CYC1
 * terminator; bacterial hosts get the leader-plus-payload fragment
 * mapped onto the same schema (vector terminator and arms provided
 * by the destination backbone).
 */
export function buildCloningPayload(
  matureSeq: string,
  modality: Modality = "knottin-6c",
  host: HostId = "sboulardii"
): CloningPayload {
  const mature = matureSeq.trim().toUpperCase();
  if (mature.length === 0) {
    throw new Error("buildCloningPayload: empty mature sequence.");
  }
  if (host !== "sboulardii") {
    const manifest = buildBacterialHandoff(mature, modality, host);
    const hostSpec = specForHost(host);
    const gcContent = computeGcContent(manifest.cdna_sequence);
    return {
      dna_sequence: manifest.cdna_sequence,
      cassette_format: bacterialCassetteFormat(host),
      leader_dna_5flank: manifest.dna_gblock.slice(
        0,
        manifest.dna_gblock.length - manifest.cdna_sequence.length - 3
      ),
      payload_cds: manifest.cdna_sequence,
      stop_codon: "TAA",
      terminator_3flank: "",
      full_cassette_dna: manifest.dna_gblock,
      gc_percent_cds: Math.round(gcContent * 1000) / 10,
      gc_ok: gcContent >= hostSpec.gcMin && gcContent <= hostSpec.gcMax,
      payload_cai: manifest.cai,
      restriction_scrub: manifest.restriction_scrub,
      rare_codons_avoided: [...tablesForBacterialHost(host).rare],
    };
  }

  const payloadCds = scrubPayloadJunctions(optimizePayloadCds(mature).dna, mature);
  const fullCassette = `${LEADER_CDS_5FLANK}${payloadCds}${DUAL_STOP_CODON}${CYC1_TERMINATOR_250}`;
  const gcContent = computeGcContent(payloadCds);
  const gcPercent = Math.round(gcContent * 1000) / 10;
  const residualSite = findFirstSiteHit(fullCassette);

  return {
    dna_sequence: payloadCds,
    cassette_format: specForModality(modality).cassetteFormat,
    leader_dna_5flank: LEADER_CDS_5FLANK,
    payload_cds: payloadCds,
    stop_codon: DUAL_STOP_CODON,
    terminator_3flank: CYC1_TERMINATOR_250,
    full_cassette_dna: fullCassette,
    gc_percent_cds: gcPercent,
    gc_ok: gcContent >= GC_CDS_MIN && gcContent <= GC_CDS_MAX,
    payload_cai: computeCAI(payloadCds, mature),
    restriction_scrub: {
      status: residualSite === null ? "clean" : `residual site: ${residualSite.site}`,
      sites_verified: [...RESTRICTION_SITES],
    },
    rare_codons_avoided: [...RARE_CODONS],
  };
}
