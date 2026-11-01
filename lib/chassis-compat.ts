import { HOSTS, specForHost, type HostId } from "./hosts";
import { specForModality, type Modality } from "./modality";
import {
  computeFormalCharge,
  computeGravy,
  computeHydrophobicRunMax,
  computeMaxResidueFraction,
} from "./symbolic-auditor";
import { optimizeCdsForHostId } from "./codon-optimizer";
import type { TargetClass } from "./prompt-steering";

export type CompatVerdict = "excellent" | "good" | "workable" | "poor";

export interface CompatDimension {
  verdict: CompatVerdict;
  notes: string[];
}

export interface HostCompatibility {
  host: HostId;
  hostDisplay: string;
  score: number;
  verdict: CompatVerdict;
  secretion: CompatDimension;
  burden: CompatDimension;
  processing: CompatDimension;
  summary: string;
}

function band(score: number): CompatVerdict {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "workable";
  return "poor";
}

function countCysteines(sequence: string): number {
  let count = 0;
  for (const aa of sequence) {
    if (aa === "C") count += 1;
  }
  return count;
}

/**
 * Secretion-signal and folding assessment: can this host make and
 * export this exact sequence? Disulfide count is the dominant term —
 * yeast ER folds knots natively, Lactococcus has no disulfide
 * machinery at all.
 */
function assessSecretion(
  cysteines: number,
  cyclic: boolean,
  host: HostId
): { penalty: number; dimension: CompatDimension } {
  const notes: string[] = [];
  let penalty = 0;
  const disulfides = Math.floor(cysteines / 2);
  switch (host) {
    case "sboulardii":
      notes.push(
        cysteines === 0
          ? "MF-alpha/Kex2 secretion with no folding load."
          : `ER oxidative folding (Ero1/PDI) forms ${disulfides} disulfide(s) natively.`
      );
      break;
    case "ecoli-nissle":
      if (cysteines === 0) {
        notes.push("PelB-to-periplasm secretion with no folding load.");
      } else if (cysteines <= 4) {
        penalty += 5;
        notes.push(
          "Periplasmic Dsb forms the disulfides; confirm pairing by mass spec."
        );
      } else {
        penalty += 12;
        notes.push(
          "Six-cysteine knots need DsbC co-expression in the periplasm; confirm pairing by mass spec."
        );
      }
      break;
    case "lactococcus-lactis":
      if (cysteines === 0) {
        notes.push("SPusp45 secretion with no folding load.");
      } else if (cysteines === 2) {
        penalty += 15;
        notes.push(
          "No native disulfide machinery — co-express DsbA or oxidize in vitro."
        );
      } else {
        penalty += 30;
        notes.push(
          "No native disulfide machinery — multi-disulfide scaffolds belong in yeast or Nissle."
        );
      }
      break;
    case "bacillus-subtilis":
      if (cysteines === 0) {
        notes.push("Strong Sec secretion; screen a signal-peptide panel.");
      } else if (cysteines === 2) {
        penalty += 10;
        notes.push(
          "BdbDC forms one disulfide moderately well; confirm pairing."
        );
      } else {
        penalty += 25;
        notes.push(
          "BdbDC is outmatched by multi-disulfide knots — prefer yeast."
        );
      }
      break;
  }
  if (cyclic) {
    notes.push(
      "Backbone ligation is a post-expression manufacturing step (split-intein/sortase); the fragment encodes the linear precursor."
    );
  }
  return {
    penalty,
    dimension: { verdict: band(100 - penalty * 2), notes },
  };
}

/**
 * Expression-burden assessment: how hard is this sequence on the
 * host's translation and folding budget? Draws on the host CDS
 * (codon fit) plus sequence stress signals (runs, repeats, charge).
 */
function assessBurden(
  sequence: string,
  host: HostId
): { penalty: number; dimension: CompatDimension } {
  const notes: string[] = [];
  let penalty = 0;
  const spec = specForHost(host);
  if (sequence.length > 30 && host !== "sboulardii") {
    penalty += 3;
    notes.push("Longer payloads burden bacterial secretion slightly.");
  }
  if (computeHydrophobicRunMax(sequence) >= 3) {
    penalty += 5;
    notes.push("A 3-residue hydrophobic run risks aggregation during export.");
  }
  if (computeMaxResidueFraction(sequence) > 0.25) {
    penalty += 5;
    notes.push("Composition skew stresses charged tRNA pools.");
  }
  if (computeFormalCharge(sequence) >= 4 && computeGravy(sequence) > 0) {
    penalty += 5;
    notes.push(
      "Cationic-hydrophobic character can stress bacterial membranes; watch growth curves."
    );
  }
  try {
    const cds = optimizeCdsForHostId(host, sequence);
    if (cds.cai < 0.7) {
      penalty += 8;
      notes.push(`Low host CAI (${cds.cai.toFixed(2)}) — vendor re-optimization required.`);
    }
  } catch {
    penalty += 8;
    notes.push("CDS optimization failed for this host — vendor review required.");
  }
  if (spec.codonBasis === "provisional") {
    penalty += 4;
    notes.push(
      "Provisional codon basis — the synthesis vendor confirms native optimization free."
    );
  }
  if (notes.length === 0) notes.push("Light load: short, clean, well-coded.");
  return {
    penalty,
    dimension: { verdict: band(100 - penalty * 2), notes },
  };
}

/**
 * Proteolytic-processing assessment: does the host chew up the
 * peptide before or after export? The compiler's shared gates already
 * exclude dibasics and exposed sites; this scores what remains.
 */
function assessProcessing(
  sequence: string,
  cysteines: number,
  host: HostId
): { penalty: number; dimension: CompatDimension } {
  const notes: string[] = [];
  let penalty = 0;
  switch (host) {
    case "sboulardii":
      notes.push("Kex2/yapsin clean by the compiler's shared gates.");
      break;
    case "ecoli-nissle":
      notes.push(
        "OmpT clean by the compiler's shared gates; ΔompT background recommended regardless."
      );
      break;
    case "lactococcus-lactis":
      if (cysteines === 0 && sequence.length < 16) {
        penalty += 8;
        notes.push(
          "Short linears are HtrA-vulnerable — consider fusion-stabilized expression."
        );
      } else {
        notes.push("Folded scaffolds resist HtrA housekeeping protease.");
      }
      break;
    case "bacillus-subtilis":
      penalty += 10;
      notes.push(
        "AprE/NprE shred secreted peptides — the WB800 protease-deficient background is mandatory."
      );
      if (cysteines >= 2) {
        notes.push("Folded disulfides resist better than linears.");
      }
      notes.push("Production starts on spore germination — exposure lags dosing by hours.");
      break;
  }
  return {
    penalty,
    dimension: { verdict: band(100 - penalty * 2), notes },
  };
}

/**
 * Full chassis-compatibility assessment for one sequence in one host:
 * secretion/folding, expression burden, and proteolytic processing,
 * rolled into a 0-100 score. Deterministic and sequence-derived —
 * the data behind the default-chassis recommendation.
 */
export function assessHostCompatibility(
  sequence: string,
  modality: Modality,
  host: HostId
): HostCompatibility {
  const seq = sequence.trim().toUpperCase();
  const spec = specForModality(modality);
  const cysteines = countCysteines(seq);
  const secretion = assessSecretion(cysteines, spec.cyclic === true, host);
  const burden = assessBurden(seq, host);
  const processing = assessProcessing(seq, cysteines, host);
  const score = Math.max(
    0,
    100 - secretion.penalty - burden.penalty - processing.penalty
  );
  const verdict = band(score);
  const top =
    secretion.dimension.notes[0] ??
    "Compatibility assessed.";
  return {
    host,
    hostDisplay: specForHost(host).shortName,
    score,
    verdict,
    secretion: secretion.dimension,
    burden: burden.dimension,
    processing: processing.dimension,
    summary: `${specForHost(host).shortName}: ${score} (${verdict}) — ${top}`,
  };
}

/**
 * Scores every registered chassis for one sequence, best first (host
 * registration order breaks ties, so the proven yeast wins draws).
 */
export function scoreAllHosts(
  sequence: string,
  modality: Modality
): HostCompatibility[] {
  return HOSTS.map((host) => assessHostCompatibility(sequence, modality, host)).sort(
    (a, b) => b.score - a.score
  );
}

/**
 * Pre-sequence default chassis: with no sequence to score yet, folding
 * physics and target biology pick. Disulfide-rich scaffolds need the
 * yeast ER; colonization targets want Nissle's weeks-long presence;
 * everything simple goes food-grade transient. Bacillus spores are
 * never the blind default — germination-gated production is opt-in.
 */
export function selectDefaultHost(
  targetClass: TargetClass,
  modality: Modality
): { host: HostId; reason: string } {
  const cysteines = specForModality(modality).cysteines ?? 0;
  if (cysteines >= 4) {
    return {
      host: "sboulardii",
      reason: `S. boulardii: oxidative ER folding for ${cysteines}-cysteine scaffolds`,
    };
  }
  if (targetClass === "bacterial-colonization") {
    return {
      host: "ecoli-nissle",
      reason: "E. coli Nissle: gut-adapted persister for colonization targets",
    };
  }
  return {
    host: "lactococcus-lactis",
    reason: "L. lactis: food-grade transient, the simplest path for simple scaffolds",
  };
}
