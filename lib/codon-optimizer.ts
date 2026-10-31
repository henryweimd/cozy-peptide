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
  "GGTCTC", // BsaI
];

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
