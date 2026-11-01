/**
 * LBP chassis registry: the engineered hosts a designed peptide can be
 * manufactured in. Every host is orally dosed (capsule-compatible) —
 * spores, yeast, or lyophilized bacteria — and every host carries its
 * secretion system, folding capacity, protease landscape, and
 * containment story, so chassis choice is data, not folklore.
 *
 * Leader-sequence evidence tiers: `uniprot` (exact UniProt entry),
 * `canonical` (textbook/pET-manual sequence, multiply attested), or
 * `cro-designed` (the CRO finalizes the junction; the registry names
 * the literature-standard cassette but prints no sequence it cannot
 * vouch for).
 */

export type HostId =
  | "sboulardii"
  | "ecoli-nissle"
  | "lactococcus-lactis"
  | "bacillus-subtilis";

export const HOSTS: HostId[] = [
  "sboulardii",
  "ecoli-nissle",
  "lactococcus-lactis",
  "bacillus-subtilis",
];

export const DEFAULT_HOST: HostId = "sboulardii";

export type LeaderEvidence = "uniprot" | "canonical" | "cro-designed";

export interface HostSecretion {
  system: string;
  leaderName: string;
  /** Mature secretion-leader peptide, or null when CRO-designed. */
  leaderSequence: string | null;
  leaderEvidence: LeaderEvidence;
  note: string;
}

export interface HostContainment {
  auxotrophy: string[];
  killSwitches: string[];
  integration: string;
}

export interface HostSpec {
  id: HostId;
  /** Full organism name for prose and manifests. */
  name: string;
  /** Short name for selectors and tables. */
  shortName: string;
  strain: string;
  kind: "yeast" | "gram-negative" | "gram-positive";
  delivery: string;
  colonization: "transient" | "short-term" | "spore-gated";
  colonizationNote: string;
  secretion: HostSecretion;
  /** Disulfide/folding capacity in one honest paragraph. */
  folding: string;
  /** Host proteases that threaten a secreted peptide. */
  proteases: string;
  containment: HostContainment;
  /** Plasmid-stability posture for prototyping versus dosing. */
  plasmid: string;
  /** CDS GC window for codon optimization. */
  gcMin: number;
  gcMax: number;
  /**
   * Codon-optimization basis: `native` uses the host's own Kazusa
   * usage table; `provisional` tunes the E. coli table into the
   * host GC window and the vendor re-optimizes for free.
   */
  codonBasis: "native" | "provisional";
  codonNote: string;
  /** One-liner for selectors. */
  blurb: string;
}

/**
 * PelB pectate-lyase signal peptide (Erwinia carotovora, 22 aa), the
 * canonical E. coli Sec-to-periplasm leader from the pET manuals.
 */
export const PELB_LEADER_22 = "MKYLLPTAAAGLLLLAAQPAMA";

/**
 * SPusp45 signal peptide (Lactococcus lactis Usp45, 27 aa): UniProt
 * P22865 residues 1-27, SIGNAL feature 1-27.
 */
export const USP45_LEADER_27 = "MKKKIISAILMSTVILSAAAPLSGVYA";

/**
 * SacB signal peptide (Bacillus subtilis levansucrase, 29 aa): UniProt
 * P05655 residues 1-29, SIGNAL feature 1-29.
 */
export const SACB_LEADER_29 = "MNIKKFAKQATVLTFTTALLAGGATQAFA";

export const HOST_SPECS: Record<HostId, HostSpec> = {
  sboulardii: {
    id: "sboulardii",
    name: "Saccharomyces boulardii",
    shortName: "S. boulardii",
    strain: "ATCC MYA-796",
    kind: "yeast",
    delivery: "oral capsule",
    colonization: "transient",
    colonizationNote:
      "Transits without colonizing; clears within days of the last dose, so exposure ends when dosing ends.",
    secretion: {
      system: "MF-alpha pre-pro → Kex2 Golgi processing → secretion",
      leaderName: "MF-alpha-1 (85 aa) + Kex2 (KR)",
      leaderSequence: null,
      leaderEvidence: "uniprot",
      note: "UniProt P01149 residues 1-85 with the native SLDKR Kex2 junction; the handoff compiler builds the full cassette.",
    },
    folding:
      "ER oxidative folding (Ero1/PDI) — the best disulfide former of the four hosts. Six-cysteine knots and cyclotides fold natively.",
    proteases:
      "Kex2/yapsin dibasics are excluded by the compiler's shared gates, so the secreted peptide survives Golgi processing intact.",
    containment: {
      auxotrophy: ["ura3", "his3/leu2 backgrounds"],
      killSwitches: [
        "inducible toxin–antitoxin module (e.g., tetracycline-gated)",
        "temperature-sensitive essential allele as backup",
      ],
      integration:
        "Chromosomal (HO/loci knock-in). A eukaryote with no conjugative plasmids — negligible gene transfer to gut bacteria.",
    },
    plasmid:
      "Episomal 2µ vectors for prototyping; chromosomal integration for any dosed strain.",
    gcMin: 0.38,
    gcMax: 0.45,
    codonBasis: "native",
    codonNote: "S. cerevisiae Kazusa usage table (native).",
    blurb: "Proven safe yeast; the disulfide-folding champion",
  },
  "ecoli-nissle": {
    id: "ecoli-nissle",
    name: "Escherichia coli Nissle 1917",
    shortName: "E. coli Nissle",
    strain: "Mutaflor lineage",
    kind: "gram-negative",
    delivery: "oral capsule",
    colonization: "short-term",
    colonizationNote:
      "Gut-adapted: persists days to weeks for durable delivery, then clears without engrafting permanently.",
    secretion: {
      system: "Sec translocon → periplasm (PelB) with Dsb oxidation",
      leaderName: "PelB (22 aa) → periplasm",
      leaderSequence: PELB_LEADER_22,
      leaderEvidence: "canonical",
      note: "Periplasmic DsbA/DsbC form disulfides; confirm pairing by mass spec before dosing.",
    },
    folding:
      "Periplasmic Dsb handles up to three disulfides; knottins may need DsbC co-expression. Simplest scaffolds express cleanly.",
    proteases:
      "OmpT outer-membrane protease cleaves dibasics — the compiler excludes them globally. Use ΔompT backgrounds regardless.",
    containment: {
      auxotrophy: ["dapA (diaminopimelate)", "thyA (thymidine)"],
      killSwitches: [
        "deadman/passcode circuit tied to a gut-absent signal",
        "auxotrophy-gated essential gene",
      ],
      integration:
        "Chromosomal (attTn7 / lambda-red knock-in). Never dose a mobilizable plasmid in a Gram-negative gut guest.",
    },
    plasmid:
      "pMB1/p15A for prototyping; add hok/sok or par loci for stability, then move to chromosome for dosing.",
    gcMin: 0.45,
    gcMax: 0.6,
    codonBasis: "native",
    codonNote: "E. coli K-12 Kazusa usage table (native).",
    blurb: "Gut-adapted workhorse; weeks-long presence from one course",
  },
  "lactococcus-lactis": {
    id: "lactococcus-lactis",
    name: "Lactococcus lactis",
    shortName: "L. lactis",
    strain: "subsp. lactis MG1363 / NZ9000 lineage",
    kind: "gram-positive",
    delivery: "oral capsule",
    colonization: "transient",
    colonizationNote:
      "Food-grade transient: passes through without colonizing, the simplest regulatory story of the bacterial hosts.",
    secretion: {
      system: "Sec translocon → extracellular (SPusp45)",
      leaderName: "SPusp45 (27 aa) + LEISSTCDA propeptide",
      leaderSequence: USP45_LEADER_27,
      leaderEvidence: "uniprot",
      note: "UniProt P22865 residues 1-27 with the native signal-peptidase junction; the LEISSTCDA propeptide follows the literature-standard cassette (Le Loir et al. 2001).",
    },
    folding:
      "No native disulfide machinery — linear, helical, and hairpin scaffolds are preferred. Multi-disulfide designs need DsbA co-expression.",
    proteases:
      "HtrA housekeeping protease degrades unfolded secretions; folded scaffolds resist. ΔhtrA strains available.",
    containment: {
      auxotrophy: ["thyA (clinical precedent: the hIL-10 strain)"],
      killSwitches: [
        "thymidine auxotrophy is itself the containment — die-off without supplement",
      ],
      integration:
        "Chromosomal double crossover for dosed strains; pSH71/pWV01 plasmids for prototyping only.",
    },
    plasmid:
      "Food-grade theta-replicating vectors segregate well; add par or integrate for dosing.",
    gcMin: 0.3,
    gcMax: 0.4,
    codonBasis: "native",
    codonNote:
      "L. lactis Il1403 RefSeq usage table (2,328 CDS, GCF_000006865.1; native).",
    blurb: "Food-grade transient; the lightest regulatory path",
  },
  "bacillus-subtilis": {
    id: "bacillus-subtilis",
    name: "Bacillus subtilis",
    shortName: "B. subtilis",
    strain: "168-derived, WB800 protease-deficient background",
    kind: "gram-positive",
    delivery: "oral spore capsule",
    colonization: "spore-gated",
    colonizationNote:
      "Dosed as room-stable spores that survive stomach acid by design; germination in the small intestine starts production.",
    secretion: {
      system: "Sec translocon → extracellular (Bacillus signal peptides)",
      leaderName: "SacB (29 aa)",
      leaderSequence: SACB_LEADER_29,
      leaderEvidence: "uniprot",
      note: "UniProt P05655 residues 1-29 with the native signal-peptidase junction; LipA/WapA/AmyX-class leaders are the screening backups.",
    },
    folding:
      "BdbDC thiol-disulfide system gives moderate disulfide capacity. Six-cysteine knots are ambitious here — prefer simpler scaffolds or yeast.",
    proteases:
      "AprE/NprE extracellular proteases shred secreted peptides. Always use the protease-deficient WB800 background.",
    containment: {
      auxotrophy: ["trpC2/his auxotrophy"],
      killSwitches: [
        "germination-gated essential gene",
        "sporulation control (spo0A) separating dosed spores from vegetative escape",
      ],
      integration:
        "Chromosomal double crossover (amyE/thrC). Rolling-circle plasmids are never dosed.",
    },
    plasmid:
      "Rolling-circle plasmids segregate poorly — integrate, or use theta replicons for prototyping only.",
    gcMin: 0.38,
    gcMax: 0.5,
    codonBasis: "native",
    codonNote:
      "B. subtilis 168 RefSeq usage table (4,236 CDS, GCF_000009045.1; native).",
    blurb: "Spore-dosed survivor; room-stable, acid-proof delivery",
  },
};

export function specForHost(host: HostId): HostSpec {
  return HOST_SPECS[host];
}

export function hostLabel(host: HostId): string {
  return HOST_SPECS[host]?.shortName ?? host;
}

export function isHost(value: unknown): value is HostId {
  return (
    typeof value === "string" && (HOSTS as string[]).includes(value)
  );
}
