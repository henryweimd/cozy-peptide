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
function silenceRestrictionSites(dna: string, proteinSeq: string): string {
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
      const synonyms = CODON_TABLE[aa] ?? [];
      // Prefer non-rare synonyms so silencing never introduces CGG/CGA/CUG.
      const ordered = [...synonyms].sort((x, y) => {
        const xr = RARE_CODONS.has(x) ? 1 : 0;
        const yr = RARE_CODONS.has(y) ? 1 : 0;
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
function codonAdaptiveness(aa: string, codon: string): number {
  const synonyms = CODON_TABLE[aa] ?? [];
  let maxFreq = 0;
  for (const syn of synonyms) {
    const freq = S_CEREVISIAE_CODON_FREQUENCIES[syn] ?? 0;
    if (freq > maxFreq) maxFreq = freq;
  }
  const freq = S_CEREVISIAE_CODON_FREQUENCIES[codon] ?? 0;
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
function removeRareCodons(codons: string[], proteinSeq: string): string[] {
  const out = [...codons];
  for (let i = 0; i < out.length; i += 1) {
    const current = out[i] ?? "";
    if (!RARE_CODONS.has(current)) continue;
    const aa = proteinSeq[i] ?? "";
    const synonyms = (CODON_TABLE[aa] ?? []).filter(
      (syn) => syn !== current && !RARE_CODONS.has(syn)
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
function tuneGcContent(codons: string[], proteinSeq: string): string[] {
  const out = [...codons];
  for (let iter = 0; iter < 500; iter += 1) {
    const gc = computeGcContent(out.join(""));
    const raising = gc < GC_CDS_MIN;
    const lowering = gc > GC_CDS_MAX;
    if (!raising && !lowering) return out;

    let bestIndex = -1;
    let bestCodon = "";
    let bestScore = -1;
    for (let i = 0; i < out.length; i += 1) {
      const current = out[i] ?? "";
      const currentGc = gcCount(current);
      const aa = proteinSeq[i] ?? "";
      for (const candidate of CODON_TABLE[aa] ?? []) {
        if (candidate === current || RARE_CODONS.has(candidate)) continue;
        const candidateGc = gcCount(candidate);
        if (raising && candidateGc <= currentGc) continue;
        if (lowering && candidateGc >= currentGc) continue;
        const trial = [...out];
        trial[i] = candidate;
        if (findRestrictionSite(trial.join("")) !== null) continue;
        const score = codonAdaptiveness(aa, candidate);
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

/**
 * Codon-optimizes one knottin payload CDS for S. cerevisiae /
 * S. boulardii: preferred codons, cloning-site silencing, rare-codon
 * (CGG/CGA/CUG) avoidance, and GC tuned into [38%, 45%].
 */
export function optimizePayloadCds(proteinSeq: string): PayloadCdsResult {
  const seq = proteinSeq.trim().toUpperCase();
  if (seq.length === 0) {
    throw new Error("optimizePayloadCds: empty protein sequence.");
  }

  let dna = "";
  for (const aa of seq) {
    const synonyms = CODON_TABLE[aa];
    if (synonyms === undefined || synonyms.length === 0) {
      throw new Error(
        `optimizePayloadCds: unsupported residue '${aa}'. Only the 20 canonical amino acids are allowed.`
      );
    }
    const preferred = synonyms[0];
    if (preferred === undefined) {
      throw new Error(
        `optimizePayloadCds: no codon available for residue '${aa}'.`
      );
    }
    dna += preferred;
  }

  // Alternate silencing and rare-codon removal until both hold.
  let codons = splitCodons(dna);
  for (let round = 0; round < 10; round += 1) {
    const silenced = silenceRestrictionSites(codons.join(""), seq);
    codons = removeRareCodons(splitCodons(silenced), seq);
    if (
      findRestrictionSite(codons.join("")) === null &&
      codons.every((codon) => !RARE_CODONS.has(codon))
    ) {
      break;
    }
  }
  codons = tuneGcContent(codons, seq);

  const finalDna = codons.join("");
  const gcContent = computeGcContent(finalDna);
  return {
    dna: finalDna,
    gcContent,
    gcPercent: Math.round(gcContent * 1000) / 10,
    gcOk: gcContent >= GC_CDS_MIN && gcContent <= GC_CDS_MAX,
    cai: computeCAI(finalDna, seq),
  };
}
