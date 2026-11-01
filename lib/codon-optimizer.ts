import { HOST_SPECS, type HostSpec } from "./hosts";

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

/**
 * Cloning sites silenced via synonymous codon substitution so cassettes
 * drop directly into yeast integration plasmids (incl. Golden Gate).
 */
export const RESTRICTION_SITES: string[] = [
  "GAATTC", // EcoRI
  "GCGGCCGC", // NotI
  "CTCGAG", // XhoI
  "GGTCTC", // BsaI
  "CGTCTC", // BsmBI
];

/** Rare S. cerevisiae codons excluded from optimized coding sequences. */
export const RARE_CODONS: ReadonlySet<string> = new Set([
  "CGG",
  "CGA",
  "CUG",
]);

/** GC window enforced across the optimized knottin coding sequence. */
export const GC_CDS_MIN = 0.38;
export const GC_CDS_MAX = 0.45;

/**
 * E. coli K-12 codon table for LBP-chassis coding sequences (Nissle
 * 1917-type hosts). Synonyms are ordered with the preferred (most
 * frequent) codon first, per Kazusa usage data.
 */
export const ECOLI_CODON_TABLE: Record<string, string[]> = {
  F: ["TTT", "TTC"],
  L: ["CTG", "TTA", "TTG", "CTC", "CTT", "CTA"],
  I: ["ATT", "ATC", "ATA"],
  M: ["ATG"],
  V: ["GTG", "GTT", "GTC", "GTA"],
  S: ["AGC", "TCG", "AGT", "TCC", "TCT", "TCA"],
  P: ["CCG", "CCA", "CCT", "CCC"],
  T: ["ACC", "ACG", "ACT", "ACA"],
  A: ["GCG", "GCC", "GCA", "GCT"],
  Y: ["TAT", "TAC"],
  H: ["CAT", "CAC"],
  Q: ["CAG", "CAA"],
  N: ["AAC", "AAT"],
  K: ["AAA", "AAG"],
  D: ["GAT", "GAC"],
  E: ["GAA", "GAG"],
  C: ["TGC", "TGT"],
  W: ["TGG"],
  R: ["CGC", "CGT", "CGG", "CGA", "AGA", "AGG"],
  G: ["GGC", "GGT", "GGG", "GGA"],
};

/** Rare E. coli codons excluded from optimized coding sequences. */
export const ECOLI_RARE_CODONS: ReadonlySet<string> = new Set([
  "AGG",
  "AGA",
  "CGA",
  "CGG",
  "ATA",
  "CTA",
  "CCC",
]);

/** GC window for E. coli coding sequences (genome average ~51%). */
export const ECOLI_GC_CDS_MIN = 0.45;
export const ECOLI_GC_CDS_MAX = 0.6;

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

/**
 * E. coli K-12 codon usage frequencies per thousand (Kazusa), used to
 * derive relative adaptiveness weights for the LBP-chassis CAI.
 */
export const E_COLI_CODON_FREQUENCIES: Record<string, number> = {
  TTT: 22.3, TTC: 16.6, TTA: 13.6, TTG: 13.0,
  TCT: 8.5, TCC: 8.6, TCA: 7.2, TCG: 8.9,
  TAT: 16.3, TAC: 12.2, TGT: 5.0, TGC: 6.4, TGG: 15.3,
  CTT: 11.0, CTC: 11.1, CTA: 3.9, CTG: 52.6,
  CCT: 7.0, CCC: 5.5, CCA: 8.4, CCG: 23.3,
  CAT: 12.5, CAC: 9.7, CAA: 15.1, CAG: 28.7,
  CGT: 21.0, CGC: 22.0, CGA: 3.6, CGG: 5.4,
  ATT: 30.1, ATC: 24.6, ATA: 4.3, ATG: 27.7,
  ACT: 8.9, ACC: 23.4, ACA: 7.1, ACG: 14.3,
  AAT: 17.7, AAC: 21.4, AAA: 33.2, AAG: 10.2,
  AGT: 8.8, AGC: 15.2, AGA: 2.8, AGG: 1.6,
  GTT: 18.4, GTC: 14.3, GTA: 10.9, GTG: 25.5,
  GCT: 15.3, GCC: 25.5, GCA: 20.3, GCG: 33.7,
  GAT: 32.2, GAC: 19.1, GAA: 39.1, GAG: 17.8,
  GGT: 24.7, GGC: 29.6, GGA: 7.9, GGG: 11.2,
};

/**
 * B. subtilis 168 codon table for LBP-chassis coding sequences. Synonyms
 * are ordered with the preferred (most frequent) codon first, counted
 * genome-wide from 4,236 RefSeq CDS (GCF_000009045.1);
 * counted 2026-11-01 from the matching _cds_from_genomic.fna RefSeq file; generated, never hand-transcribed.
 */
export const BSUBTILIS_CODON_TABLE: Record<string, string[]> = {
  F: ["TTT", "TTC"],
  L: ["CTG", "CTT", "TTA", "TTG", "CTC", "CTA"],
  I: ["ATT", "ATC", "ATA"],
  M: ["ATG"],
  V: ["GTT", "GTG", "GTC", "GTA"],
  S: ["TCA", "AGC", "TCT", "TCC", "AGT", "TCG"],
  P: ["CCG", "CCT", "CCA", "CCC"],
  T: ["ACA", "ACG", "ACT", "ACC"],
  A: ["GCA", "GCG", "GCT", "GCC"],
  Y: ["TAT", "TAC"],
  H: ["CAT", "CAC"],
  Q: ["CAA", "CAG"],
  N: ["AAT", "AAC"],
  K: ["AAA", "AAG"],
  D: ["GAT", "GAC"],
  E: ["GAA", "GAG"],
  C: ["TGC", "TGT"],
  W: ["TGG"],
  R: ["AGA", "CGC", "CGT", "CGG", "CGA", "AGG"],
  G: ["GGC", "GGA", "GGT", "GGG"],
};

/** Rare B. subtilis 168 codons (under 10% of synonymous use) excluded from optimized coding sequences. */
export const BSUBTILIS_RARE_CODONS: ReadonlySet<string> = new Set([
  "AGG",
  "CCC",
  "CGA",
  "CTA",
]);

/**
 * B. subtilis 168 codon usage frequencies per thousand, counted from the
 * same RefSeq CDS set; derives relative adaptiveness weights for CAI.
 */
export const BSUBTILIS_CODON_FREQUENCIES: Record<string, number> = {
  TTT: 30.7, TTC: 14.1, TTA: 19.2, TTG: 15.4,
  TCT: 12.8, TCC: 8.0, TCA: 14.8, TCG: 6.3,
  TAT: 22.7, TAC: 12.0, TGT: 3.6, TGC: 4.3, TGG: 10.3,
  CTT: 23.1, CTC: 10.9, CTA: 4.9, CTG: 23.2,
  CCT: 10.5, CCC: 3.2, CCA: 7.0, CCG: 15.9,
  CAT: 15.2, CAC: 7.4, CAA: 19.6, CAG: 18.6,
  CGT: 7.4, CGC: 8.4, CGA: 4.0, CGG: 6.4,
  ATT: 37.1, ATC: 27.0, ATA: 9.4, ATG: 27.0,
  ACT: 8.7, ACC: 8.6, ACA: 22.3, ACG: 14.5,
  AAT: 22.3, AAC: 17.1, AAA: 49.4, AAG: 21.0,
  AGT: 6.6, AGC: 14.1, AGA: 10.7, AGG: 3.8,
  GTT: 19.2, GTC: 17.3, GTA: 13.3, GTG: 17.7,
  GCT: 18.9, GCC: 15.9, GCA: 21.6, GCG: 20.1,
  GAT: 33.1, GAC: 18.6, GAA: 49.2, GAG: 23.2,
  GGT: 12.7, GGC: 23.4, GGA: 21.7, GGG: 11.2,
};

/**
 * L. lactis Il1403 codon table for LBP-chassis coding sequences. Synonyms
 * are ordered with the preferred (most frequent) codon first, counted
 * genome-wide from 2,328 RefSeq CDS (GCF_000006865.1);
 * counted 2026-11-01 from the matching _cds_from_genomic.fna RefSeq file; generated, never hand-transcribed.
 */
export const LLACTIS_CODON_TABLE: Record<string, string[]> = {
  F: ["TTT", "TTC"],
  L: ["TTA", "CTT", "TTG", "CTA", "CTC", "CTG"],
  I: ["ATT", "ATC", "ATA"],
  M: ["ATG"],
  V: ["GTT", "GTA", "GTC", "GTG"],
  S: ["TCA", "TCT", "AGT", "AGC", "TCG", "TCC"],
  P: ["CCA", "CCT", "CCG", "CCC"],
  T: ["ACA", "ACT", "ACC", "ACG"],
  A: ["GCT", "GCA", "GCC", "GCG"],
  Y: ["TAT", "TAC"],
  H: ["CAT", "CAC"],
  Q: ["CAA", "CAG"],
  N: ["AAT", "AAC"],
  K: ["AAA", "AAG"],
  D: ["GAT", "GAC"],
  E: ["GAA", "GAG"],
  C: ["TGT", "TGC"],
  W: ["TGG"],
  R: ["CGT", "AGA", "CGA", "CGC", "CGG", "AGG"],
  G: ["GGA", "GGT", "GGC", "GGG"],
};

/** Rare L. lactis Il1403 codons (under 10% of synonymous use) excluded from optimized coding sequences. */
export const LLACTIS_RARE_CODONS: ReadonlySet<string> = new Set([
  "AGC",
  "AGG",
  "CCC",
  "CCG",
  "CGG",
  "CTA",
  "CTC",
  "CTG",
  "TCC",
  "TCG",
]);

/**
 * L. lactis Il1403 codon usage frequencies per thousand, counted from the
 * same RefSeq CDS set; derives relative adaptiveness weights for CAI.
 */
export const LLACTIS_CODON_FREQUENCIES: Record<string, number> = {
  TTT: 36.0, TTC: 11.5, TTA: 32.4, TTG: 20.9,
  TCT: 16.9, TCC: 2.9, TCA: 22.2, TCG: 3.5,
  TAT: 27.5, TAC: 7.6, TGT: 3.6, TGC: 1.1, TGG: 10.1,
  CTT: 25.6, CTC: 7.5, CTA: 7.5, CTG: 5.4,
  CCT: 11.6, CCC: 2.4, CCA: 15.4, CCG: 2.7,
  CAT: 13.4, CAC: 4.5, CAA: 31.0, CAG: 5.9,
  CGT: 14.9, CGC: 4.0, CGA: 5.4, CGG: 2.2,
  ATT: 53.3, ATC: 15.0, ATA: 8.7, ATG: 24.9,
  ACT: 21.1, ACC: 6.6, ACA: 22.7, ACG: 6.3,
  AAT: 41.0, AAC: 10.6, AAA: 61.7, AAG: 12.4,
  AGT: 14.6, AGC: 5.7, AGA: 8.3, AGG: 1.5,
  GTT: 33.0, GTC: 11.1, GTA: 13.0, GTG: 8.5,
  GCT: 30.8, GCC: 10.6, GCA: 23.8, GCG: 7.7,
  GAT: 38.4, GAC: 13.8, GAA: 57.6, GAG: 11.7,
  GGT: 24.8, GGC: 8.1, GGA: 24.8, GGG: 7.8,
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

/** Total cloning-site occurrences in the DNA (overlapping counted). */
export function countRestrictionSites(dna: string): number {
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

export interface RestrictionSiteHit {
  site: string;
  index: number;
}

/** First cloning site in the DNA with its 0-based index, or null. */
export function findFirstSiteHit(dna: string): RestrictionSiteHit | null {
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
function silenceRestrictionSites(
  dna: string,
  proteinSeq: string,
  table: Record<string, string[]> = CODON_TABLE,
  rare: ReadonlySet<string> = RARE_CODONS
): string {
  let codons: string[] = [];
  for (let i = 0; i < proteinSeq.length; i += 1) {
    codons.push(dna.slice(i * 3, i * 3 + 3));
  }

  for (let iter = 0; iter < MAX_SILENCING_ITERATIONS; iter += 1) {
    const current = codons.join("");
    const hit = findFirstSiteHit(current);
    if (hit === null) return current;

    const firstCodon = Math.floor(hit.index / 3);
    const lastCodon = Math.floor((hit.index + hit.site.length - 1) / 3);
    const before = countRestrictionSites(current);
    let fixed = false;

    for (let ci = firstCodon; ci <= lastCodon && !fixed; ci += 1) {
      const aa = proteinSeq[ci];
      if (aa === undefined) continue;
      const synonyms = table[aa] ?? [];
      // Prefer non-rare synonyms so silencing never introduces rare codons.
      const ordered = [...synonyms].sort((x, y) => {
        const xr = rare.has(x) ? 1 : 0;
        const yr = rare.has(y) ? 1 : 0;
        return xr - yr;
      });
      for (const candidate of ordered) {
        if (candidate === codons[ci]) continue;
        const trial = [...codons];
        trial[ci] = candidate;
        if (countRestrictionSites(trial.join("")) < before) {
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
function computeCaiWithTables(
  caller: string,
  dna: string,
  proteinSeq: string,
  table: Record<string, string[]>,
  frequencies: Record<string, number>
): number {
  const coding = dna.trim().toUpperCase();
  const protein = proteinSeq.trim().toUpperCase();
  if (coding.length === 0 || coding.length !== protein.length * 3) {
    throw new Error(
      `${caller}: DNA must be in-frame triplets matching the protein length.`
    );
  }
  let logSum = 0;
  for (let i = 0; i < protein.length; i += 1) {
    const aa = protein[i] ?? "";
    const codon = coding.slice(i * 3, i * 3 + 3);
    const synonyms = table[aa] ?? [];
    let maxFreq = 0;
    for (const syn of synonyms) {
      const freq = frequencies[syn] ?? 0;
      if (freq > maxFreq) maxFreq = freq;
    }
    const freq = frequencies[codon] ?? 0;
    if (maxFreq <= 0 || freq <= 0) {
      throw new Error(
        `${caller}: no usage frequency for codon '${codon}' (${aa}).`
      );
    }
    logSum += Math.log(freq / maxFreq);
  }
  return Math.round(Math.exp(logSum / protein.length) * 10000) / 10000;
}

export function computeCAI(dna: string, proteinSeq: string): number {
  return computeCaiWithTables(
    "computeCAI",
    dna,
    proteinSeq,
    CODON_TABLE,
    S_CEREVISIAE_CODON_FREQUENCIES
  );
}

/**
 * Codon adaptation index against E. coli K-12 usage. Values above
 * 0.85 indicate strong bacterial expression suitability.
 */
export function computeEcoliCAI(dna: string, proteinSeq: string): number {
  return computeCaiWithTables(
    "computeEcoliCAI",
    dna,
    proteinSeq,
    ECOLI_CODON_TABLE,
    E_COLI_CODON_FREQUENCIES
  );
}

export function computeBsubtilisCAI(dna: string, proteinSeq: string): number {
  return computeCaiWithTables(
    "computeBsubtilisCAI",
    dna,
    proteinSeq,
    BSUBTILIS_CODON_TABLE,
    BSUBTILIS_CODON_FREQUENCIES
  );
}

export function computeLlactisCAI(dna: string, proteinSeq: string): number {
  return computeCaiWithTables(
    "computeLlactisCAI",
    dna,
    proteinSeq,
    LLACTIS_CODON_TABLE,
    LLACTIS_CODON_FREQUENCIES
  );
}

/** CAI against the registered host's own usage table. */
export function computeHostCAI(
  host: string,
  dna: string,
  proteinSeq: string
): number {
  if (host === "bacillus-subtilis") {
    return computeBsubtilisCAI(dna, proteinSeq);
  }
  if (host === "lactococcus-lactis") {
    return computeLlactisCAI(dna, proteinSeq);
  }
  if (host === "sboulardii") return computeCAI(dna, proteinSeq);
  return computeEcoliCAI(dna, proteinSeq);
}

/** Codon table, rare set, and frequencies for a bacterial host. */
export function tablesForBacterialHost(host: string): {
  table: Record<string, string[]>;
  rare: ReadonlySet<string>;
  frequencies: Record<string, number>;
} {
  if (host === "bacillus-subtilis") {
    return {
      table: BSUBTILIS_CODON_TABLE,
      rare: BSUBTILIS_RARE_CODONS,
      frequencies: BSUBTILIS_CODON_FREQUENCIES,
    };
  }
  if (host === "lactococcus-lactis") {
    return {
      table: LLACTIS_CODON_TABLE,
      rare: LLACTIS_RARE_CODONS,
      frequencies: LLACTIS_CODON_FREQUENCIES,
    };
  }
  return {
    table: ECOLI_CODON_TABLE,
    rare: ECOLI_RARE_CODONS,
    frequencies: E_COLI_CODON_FREQUENCIES,
  };
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

function gcCount(codon: string): number {
  let count = 0;
  for (const base of codon) {
    if (base === "G" || base === "C") count += 1;
  }
  return count;
}

/**
 * Relative adaptiveness of a codon: its usage frequency over the
 * synonymous maximum (Sharp & Li 1987 weight).
 */
function codonAdaptiveness(
  aa: string,
  codon: string,
  table: Record<string, string[]> = CODON_TABLE,
  frequencies: Record<string, number> = S_CEREVISIAE_CODON_FREQUENCIES
): number {
  const synonyms = table[aa] ?? [];
  let maxFreq = 0;
  for (const syn of synonyms) {
    const freq = frequencies[syn] ?? 0;
    if (freq > maxFreq) maxFreq = freq;
  }
  const freq = frequencies[codon] ?? 0;
  if (maxFreq <= 0 || freq <= 0) return 0;
  return freq / maxFreq;
}

function splitCodons(dna: string): string[] {
  const codons: string[] = [];
  for (let i = 0; i + 3 <= dna.length; i += 3) {
    codons.push(dna.slice(i, i + 3));
  }
  return codons;
}

/**
 * Replaces rare codons (CGG, CGA, CUG) with the preferred non-rare
 * synonym that keeps the sequence free of cloning sites.
 */
function removeRareCodons(
  codons: string[],
  proteinSeq: string,
  table: Record<string, string[]> = CODON_TABLE,
  rare: ReadonlySet<string> = RARE_CODONS
): string[] {
  const out = [...codons];
  for (let i = 0; i < out.length; i += 1) {
    const current = out[i] ?? "";
    if (!rare.has(current)) continue;
    const aa = proteinSeq[i] ?? "";
    const synonyms = (table[aa] ?? []).filter(
      (syn) => syn !== current && !rare.has(syn)
    );
    let placed = false;
    for (const candidate of synonyms) {
      const trial = [...out];
      trial[i] = candidate;
      if (findRestrictionSite(trial.join("")) === null) {
        out[i] = candidate;
        placed = true;
        break;
      }
    }
    if (!placed && synonyms.length > 0) {
      // Rare-codon avoidance wins over site placement; a later
      // silencing round repairs any reintroduced site.
      out[i] = synonyms[0] ?? current;
    }
  }
  return out;
}

/**
 * Greedy GC tuning toward [GC_CDS_MIN, GC_CDS_MAX]. Each step applies
 * the single synonymous swap (never a rare codon, never introducing a
 * cloning site) with the highest adaptiveness, so CAI degrades as
 * little as possible. Deterministic: ties break by codon index, then
 * table order.
 */
function tuneGcContent(
  codons: string[],
  proteinSeq: string,
  table: Record<string, string[]> = CODON_TABLE,
  rare: ReadonlySet<string> = RARE_CODONS,
  frequencies: Record<string, number> = S_CEREVISIAE_CODON_FREQUENCIES,
  gcMin: number = GC_CDS_MIN,
  gcMax: number = GC_CDS_MAX
): string[] {
  const out = [...codons];
  for (let iter = 0; iter < 500; iter += 1) {
    const gc = computeGcContent(out.join(""));
    const raising = gc < gcMin;
    const lowering = gc > gcMax;
    if (!raising && !lowering) return out;

    let bestIndex = -1;
    let bestCodon = "";
    let bestScore = -1;
    for (let i = 0; i < out.length; i += 1) {
      const current = out[i] ?? "";
      const currentGc = gcCount(current);
      const aa = proteinSeq[i] ?? "";
      for (const candidate of table[aa] ?? []) {
        if (candidate === current || rare.has(candidate)) continue;
        const candidateGc = gcCount(candidate);
        if (raising && candidateGc <= currentGc) continue;
        if (lowering && candidateGc >= currentGc) continue;
        const trial = [...out];
        trial[i] = candidate;
        if (findRestrictionSite(trial.join("")) !== null) continue;
        const score = codonAdaptiveness(aa, candidate, table, frequencies);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
          bestCodon = candidate;
        }
      }
    }
    if (bestIndex === -1) return out;
    out[bestIndex] = bestCodon;
  }
  return out;
}

/**
 * Translates an in-frame coding sequence back to protein using the
 * codon table. Used to verify DNA/protein consistency of cassettes.
 */
export function translateCds(dna: string): string {
  const coding = dna.trim().toUpperCase();
  if (coding.length === 0 || coding.length % 3 !== 0) {
    throw new Error("translateCds: DNA must be non-empty in-frame triplets.");
  }
  const codonToAa = new Map<string, string>();
  for (const [aa, synonyms] of Object.entries(CODON_TABLE)) {
    for (const codon of synonyms) {
      if (!codonToAa.has(codon)) codonToAa.set(codon, aa);
    }
  }
  let protein = "";
  for (let i = 0; i < coding.length; i += 3) {
    const codon = coding.slice(i, i + 3);
    const aa = codonToAa.get(codon);
    if (aa === undefined) {
      throw new Error(`translateCds: unknown codon '${codon}'.`);
    }
    protein += aa;
  }
  return protein;
}

export interface PayloadCdsResult {
  dna: string;
  gcContent: number;
  gcPercent: number;
  gcOk: boolean;
  cai: number;
}

interface CdsHost {
  caller: string;
  table: Record<string, string[]>;
  rare: ReadonlySet<string>;
  frequencies: Record<string, number>;
  gcMin: number;
  gcMax: number;
}

function optimizeCdsForHost(
  proteinSeq: string,
  host: CdsHost
): PayloadCdsResult {
  const seq = proteinSeq.trim().toUpperCase();
  if (seq.length === 0) {
    throw new Error(`${host.caller}: empty protein sequence.`);
  }

  let dna = "";
  for (const aa of seq) {
    const synonyms = host.table[aa];
    if (synonyms === undefined || synonyms.length === 0) {
      throw new Error(
        `${host.caller}: unsupported residue '${aa}'. Only the 20 canonical amino acids are allowed.`
      );
    }
    const preferred = synonyms[0];
    if (preferred === undefined) {
      throw new Error(
        `${host.caller}: no codon available for residue '${aa}'.`
      );
    }
    dna += preferred;
  }

  // Alternate silencing and rare-codon removal until both hold.
  let codons = splitCodons(dna);
  for (let round = 0; round < 10; round += 1) {
    const silenced = silenceRestrictionSites(
      codons.join(""),
      seq,
      host.table,
      host.rare
    );
    codons = removeRareCodons(
      splitCodons(silenced),
      seq,
      host.table,
      host.rare
    );
    if (
      findRestrictionSite(codons.join("")) === null &&
      codons.every((codon) => !host.rare.has(codon))
    ) {
      break;
    }
  }
  codons = tuneGcContent(
    codons,
    seq,
    host.table,
    host.rare,
    host.frequencies,
    host.gcMin,
    host.gcMax
  );

  const finalDna = codons.join("");
  const gcContent = computeGcContent(finalDna);
  return {
    dna: finalDna,
    gcContent,
    gcPercent: Math.round(gcContent * 1000) / 10,
    gcOk: gcContent >= host.gcMin && gcContent <= host.gcMax,
    cai: computeCaiWithTables(
      host.caller,
      finalDna,
      seq,
      host.table,
      host.frequencies
    ),
  };
}

/**
 * Codon-optimizes one knottin payload CDS for S. cerevisiae /
 * S. boulardii: preferred codons, cloning-site silencing, rare-codon
 * (CGG/CGA/CUG) avoidance, and GC tuned into [38%, 45%].
 */
export function optimizePayloadCds(proteinSeq: string): PayloadCdsResult {
  return optimizeCdsForHost(proteinSeq, {
    caller: "optimizePayloadCds",
    table: CODON_TABLE,
    rare: RARE_CODONS,
    frequencies: S_CEREVISIAE_CODON_FREQUENCIES,
    gcMin: GC_CDS_MIN,
    gcMax: GC_CDS_MAX,
  });
}

/**
 * Codon-optimizes a peptide CDS for transfer into a bacterial LBP
 * chassis (E. coli Nissle 1917-type hosts): preferred E. coli codons,
 * cloning-site silencing, rare-codon avoidance, GC tuned into
 * [45%, 60%]. Deterministic — no model call — so the LBP-ready DNA is
 * always available alongside the designed sequence.
 */
export function optimizeForEcoli(proteinSeq: string): PayloadCdsResult {
  return optimizeCdsForHost(proteinSeq, {
    caller: "optimizeForEcoli",
    table: ECOLI_CODON_TABLE,
    rare: ECOLI_RARE_CODONS,
    frequencies: E_COLI_CODON_FREQUENCIES,
    gcMin: ECOLI_GC_CDS_MIN,
    gcMax: ECOLI_GC_CDS_MAX,
  });
}

export interface HostCdsResult extends PayloadCdsResult {
  /** Native host table, or E. coli-table provisional (see hosts.ts). */
  basis: "native" | "provisional";
}

/**
 * Codon-optimizes a peptide CDS for any registered chassis, each on
 * its own usage table (Kazusa for yeast and E. coli, RefSeq-derived
 * for Lactococcus and Bacillus), GC-tuned into the host window.
 * Client-safe (pure computation).
 */
export function optimizeCdsForHostId(
  host: string,
  proteinSeq: string
): HostCdsResult {
  if (host === "sboulardii") {
    return { ...optimizePayloadCds(proteinSeq), basis: "native" as const };
  }
  if (host === "ecoli-nissle") {
    return { ...optimizeForEcoli(proteinSeq), basis: "native" as const };
  }
  const spec: HostSpec | undefined = (
    HOST_SPECS as Record<string, HostSpec | undefined>
  )[host];
  if (spec === undefined) {
    throw new Error(`optimizeCdsForHostId: unknown host '${host}'.`);
  }
  const tables = tablesForBacterialHost(host);
  return {
    ...optimizeCdsForHost(proteinSeq, {
      caller: `optimizeCdsForHost:${host}`,
      table: tables.table,
      rare: tables.rare,
      frequencies: tables.frequencies,
      gcMin: spec.gcMin,
      gcMax: spec.gcMax,
    }),
    basis: "native" as const,
  };
}
