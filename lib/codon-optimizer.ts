/**
 * S. cerevisiae / S. boulardii codon table.
 * Synonyms are ordered with the preferred (most frequent) codon first.
 */
export const CODON_TABLE: Record<string, string[]> = {
  F: ["TTT", "TTC"],
  L: ["TTG", "TTA", "CTT", "CTC", "CTA", "CTG"],
  I: ["ATT", "ATC", "ATA"],
  M: ["ATG"],
  V: ["GTT", "GTC", "GTA", "GTG"],
  S: ["TCT", "TCC", "TCA", "TCG", "AGT", "AGC"],
  P: ["CCA", "CCT", "CCC", "CCG"],
  T: ["ACT", "ACC", "ACA", "ACG"],
  A: ["GCT", "GCC", "GCA", "GCG"],
  Y: ["TAT", "TAC"],
  H: ["CAT", "CAC"],
  Q: ["CAA", "CAG"],
  N: ["AAT", "AAC"],
  K: ["AAG", "AAA"],
  D: ["GAT", "GAC"],
  E: ["GAA", "GAG"],
  C: ["TGT", "TGC"],
  W: ["TGG"],
  R: ["AGA", "AGG", "CGT", "CGC", "CGA", "CGG"],
  G: ["GGT", "GGC", "GGA", "GGG"],
};

/** Restriction sites silenced via synonymous codon substitution. */
export const RESTRICTION_SITES: string[] = [
  "GAATTC", // EcoRI
  "GGATCC", // BamHI
  "GCGGCCGC", // NotI
  "CTCGAG", // XhoI
  "GGTCTC", // BsaI
];

/**
 * S. cerevisiae codon usage frequencies per thousand (Kazusa), used to
 * derive relative adaptiveness weights for the codon adaptation index.
 */
export const S_CEREVISIAE_CODON_FREQUENCIES: Record<string, number> = {
  TTT: 26.1, TTC: 16.4, TTA: 26.2, TTG: 27.2,
  TCT: 23.5, TCC: 14.2, TCA: 18.9, TCG: 8.6,
  TAT: 18.8, TAC: 14.8, TGT: 8.1, TGC: 4.8, TGG: 10.4,
  CTT: 12.3, CTC: 5.4, CTA: 13.4, CTG: 10.5,
  CCT: 13.5, CCC: 6.8, CCA: 18.3, CCG: 5.3,
  CAT: 13.6, CAC: 7.8, CAA: 27.4, CAG: 12.0,
  CGT: 6.4, CGC: 2.6, CGA: 3.0, CGG: 1.7,
  ATT: 30.2, ATC: 17.2, ATA: 17.8, ATG: 20.9,
  ACT: 20.2, ACC: 12.7, ACA: 17.8, ACG: 8.0,
  AAT: 35.7, AAC: 19.5, AAA: 41.9, AAG: 30.8,
  AGT: 14.2, AGC: 9.8, AGA: 21.3, AGG: 9.2,
  GTT: 22.1, GTC: 11.8, GTA: 11.8, GTG: 10.8,
  GCT: 21.2, GCC: 12.6, GCA: 16.2, GCG: 6.2,
  GAT: 32.3, GAC: 20.2, GAA: 45.6, GAG: 19.2,
  GGT: 23.9, GGC: 9.8, GGA: 10.9, GGG: 6.0,
};

const MAX_SILENCING_ITERATIONS = 500;

/** GC fraction in [0, 1], rounded to 4 decimals. */
export function computeGcContent(dna: string): number {
  if (dna.length === 0) return 0;
  let gc = 0;
  for (const base of dna.toUpperCase()) {
    if (base === "G" || base === "C") gc += 1;
  }
  return Math.round((gc / dna.length) * 10000) / 10000;
}

/** Returns the first restriction site found in the DNA, or null. */
export function findRestrictionSite(dna: string): string | null {
  const upper = dna.toUpperCase();
  for (const site of RESTRICTION_SITES) {
    if (upper.includes(site)) return site;
  }
  return null;
}

function countSiteOccurrences(dna: string): number {
  const upper = dna.toUpperCase();
  let total = 0;
  for (const site of RESTRICTION_SITES) {
    let index = upper.indexOf(site);
    while (index !== -1) {
      total += 1;
      index = upper.indexOf(site, index + 1);
    }
  }
  return total;
}

function findFirstSiteIndex(dna: string): { site: string; index: number } | null {
  const upper = dna.toUpperCase();
  let best: { site: string; index: number } | null = null;
  for (const site of RESTRICTION_SITES) {
    const index = upper.indexOf(site);
    if (index !== -1 && (best === null || index < best.index)) {
      best = { site, index };
    }
  }
  return best;
}

/**
 * Removes internal restriction sites by synonymous codon substitution.
 * The DNA is in-frame from position 0, so codons overlapping a site window
 * are identified arithmetically and swapped until the site is gone.
 */
function silenceRestrictionSites(dna: string, proteinSeq: string): string {
  let codons: string[] = [];
  for (let i = 0; i < proteinSeq.length; i += 1) {
    codons.push(dna.slice(i * 3, i * 3 + 3));
  }

  for (let iter = 0; iter < MAX_SILENCING_ITERATIONS; iter += 1) {
    const current = codons.join("");
    const hit = findFirstSiteIndex(current);
    if (hit === null) return current;

    const firstCodon = Math.floor(hit.index / 3);
    const lastCodon = Math.floor((hit.index + hit.site.length - 1) / 3);
    const before = countSiteOccurrences(current);
    let fixed = false;

    for (let ci = firstCodon; ci <= lastCodon && !fixed; ci += 1) {
      const aa = proteinSeq[ci];
      if (aa === undefined) continue;
      const synonyms = CODON_TABLE[aa] ?? [];
      for (const candidate of synonyms) {
        if (candidate === codons[ci]) continue;
        const trial = [...codons];
        trial[ci] = candidate;
        if (countSiteOccurrences(trial.join("")) < before) {
          codons = trial;
          fixed = true;
          break;
        }
      }
    }

    if (!fixed) return current;
  }

  return codons.join("");
}

/**
 * Codon adaptation index (Sharp & Li 1987): geometric mean of relative
 * adaptiveness weights (codon frequency over the synonymous maximum)
 * across an in-frame coding sequence. Values above 0.85 indicate strong
 * yeast expression suitability.
 */
export function computeCAI(dna: string, proteinSeq: string): number {
  const coding = dna.trim().toUpperCase();
  const protein = proteinSeq.trim().toUpperCase();
  if (coding.length === 0 || coding.length !== protein.length * 3) {
    throw new Error(
      "computeCAI: DNA must be in-frame triplets matching the protein length."
    );
  }
  let logSum = 0;
  for (let i = 0; i < protein.length; i += 1) {
    const aa = protein[i] ?? "";
    const codon = coding.slice(i * 3, i * 3 + 3);
    const synonyms = CODON_TABLE[aa] ?? [];
    let maxFreq = 0;
    for (const syn of synonyms) {
      const freq = S_CEREVISIAE_CODON_FREQUENCIES[syn] ?? 0;
      if (freq > maxFreq) maxFreq = freq;
    }
    const freq = S_CEREVISIAE_CODON_FREQUENCIES[codon] ?? 0;
    if (maxFreq <= 0 || freq <= 0) {
      throw new Error(
        `computeCAI: no usage frequency for codon '${codon}' (${aa}).`
      );
    }
    logSum += Math.log(freq / maxFreq);
  }
  return Math.round(Math.exp(logSum / protein.length) * 10000) / 10000;
}

export interface CodonOptimizationResult {
  dna: string;
  gcContent: number;
}

/**
 * Maps a protein sequence to optimal S. cerevisiae / S. boulardii codons
 * and silences internal EcoRI / BamHI / NotI / BsaI sites synonymously.
 */
export function optimizeForSboulardii(
  proteinSeq: string
): CodonOptimizationResult {
  const seq = proteinSeq.trim().toUpperCase();
  if (seq.length === 0) {
    throw new Error("optimizeForSboulardii: empty protein sequence.");
  }

  let dna = "";
  for (const aa of seq) {
    const synonyms = CODON_TABLE[aa];
    if (synonyms === undefined || synonyms.length === 0) {
      throw new Error(
        `optimizeForSboulardii: unsupported residue '${aa}'. Only the 20 canonical amino acids are allowed.`
      );
    }
    const preferred = synonyms[0];
    if (preferred === undefined) {
      throw new Error(
        `optimizeForSboulardii: no codon available for residue '${aa}'.`
      );
    }
    dna += preferred;
  }

  const silenced = silenceRestrictionSites(dna, seq);
  return { dna: silenced, gcContent: computeGcContent(silenced) };
}
