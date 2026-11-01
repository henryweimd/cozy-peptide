import { specForHost, type HostId } from "./hosts";
import { specForModality, type Modality } from "./modality";
import {
  computeFormalCharge,
  computeGravy,
  computeHydrophobicRunMax,
} from "./symbolic-auditor";
import { optimizeCdsForHostId } from "./codon-optimizer";

export type PlasmidVerdict = "stable" | "review" | "fragile";
export type ToxicityRisk = "low" | "moderate" | "elevated";

export interface PlasmidStability {
  verdict: PlasmidVerdict;
  flags: string[];
  mitigations: string[];
}

export interface PayloadToxicity {
  risk: ToxicityRisk;
  notes: string[];
}

export interface BiocontainmentPlan {
  host: HostId;
  hostDisplay: string;
  auxotrophy: string[];
  killSwitches: string[];
  integration: string;
  plasmidStability: PlasmidStability;
  payloadToxicity: PayloadToxicity;
  notes: string[];
}

/** 10-mer repeats seen 3+ times in the CDS (recombination risk). */
function repeatFlags(dna: string): string[] {
  const flags: string[] = [];
  const counts = new Map<string, number>();
  for (let i = 0; i + 10 <= dna.length; i += 1) {
    const kmer = dna.slice(i, i + 10);
    counts.set(kmer, (counts.get(kmer) ?? 0) + 1);
  }
  for (const [kmer, count] of counts) {
    if (count >= 3 && flags.length < 3) {
      flags.push(`10-mer '${kmer}' repeated ${count}x — recombination risk`);
    }
  }
  return flags;
}

/** Homopolymer runs of 6+ (polymerase-slip / synthesis risk). */
function homopolymerFlags(dna: string): string[] {
  const flags: string[] = [];
  const runRe = /(A{6,}|C{6,}|G{6,}|T{6,})/g;
  let match: RegExpExecArray | null;
  while ((match = runRe.exec(dna)) !== null && flags.length < 3) {
    flags.push(
      `${match[1]?.[0] ?? "?"}x${match[1]?.length ?? 0} at ${match.index} — slip risk`
    );
  }
  return flags;
}

/**
 * Plasmid-stability pre-screen for the host CDS: direct repeats and
 * homopolymers select for deletion mutants during scale-up. A
 * pre-screen, not a fermenter trial — the verdict routes to
 * mitigations (par loci, addiction systems, or the chromosome).
 */
function assessPlasmidStability(
  sequence: string,
  host: HostId
): PlasmidStability {
  const flags: string[] = [];
  try {
    const cds = optimizeCdsForHostId(host, sequence).dna;
    flags.push(...repeatFlags(cds), ...homopolymerFlags(cds));
  } catch {
    flags.push("CDS optimization failed — stability unreadable");
  }
  const verdict: PlasmidVerdict =
    flags.length >= 2 ? "fragile" : flags.length === 1 ? "review" : "stable";
  const mitigations =
    verdict === "stable"
      ? ["Standard plasmid maintenance suffices for prototyping."]
      : [
          "Chromosomal integration removes segregational loss entirely.",
          specForHost(host).plasmid,
        ];
  return { verdict, flags, mitigations };
}

/**
 * Payload-toxicity proxy: cationic-hydrophobic peptides and heavy
 * folding loads select against producing cells. Heuristic — the
 * honest output is "watch growth curves early," not a number.
 */
function assessPayloadToxicity(
  sequence: string,
  cysteines: number,
  host: HostId
): PayloadToxicity {
  const notes: string[] = [];
  const charge = computeFormalCharge(sequence);
  const gravy = computeGravy(sequence);
  const runMax = computeHydrophobicRunMax(sequence);
  let risk: ToxicityRisk = "low";
  if (charge >= 4 && (gravy > 0 || runMax >= 3)) {
    risk = "elevated";
    notes.push(
      "Cationic-hydrophobic character — test chassis growth inhibition before scale-up."
    );
  } else if (charge >= 3) {
    risk = "moderate";
    notes.push("Cationic payload — include an empty-vector growth control.");
  }
  if (cysteines >= 6 && host !== "sboulardii") {
    risk = risk === "low" ? "moderate" : risk;
    notes.push(
      "Heavy folding load for a bacterial host — weak producers will be outcompeted."
    );
  }
  if (notes.length === 0) {
    notes.push("No toxicity signals — routine growth monitoring suffices.");
  }
  return { risk, notes };
}

/**
 * Biocontainment plan for one designed sequence in one host: the
 * registry's auxotrophy and kill-switch layers, an integration
 * recommendation, plus sequence-derived plasmid-stability and
 * payload-toxicity pre-screens. Deterministic — runs inside the
 * design pipeline and ships in the response and the ledger.
 */
export function planBiocontainment(
  sequence: string,
  modality: Modality,
  host: HostId
): BiocontainmentPlan {
  const seq = sequence.trim().toUpperCase();
  const hostSpec = specForHost(host);
  const modalitySpec = specForModality(modality);
  let cysteines = 0;
  for (const aa of seq) {
    if (aa === "C") cysteines += 1;
  }
  const notes: string[] = [];
  if (hostSpec.colonization === "transient") {
    notes.push("Transient guest — exposure ends when dosing ends.");
  } else if (hostSpec.colonization === "short-term") {
    notes.push("Short-term persister — shedding monitoring belongs in the trial protocol.");
  } else {
    notes.push(
      "Spores persist in the environment — sporulation control plus auxotrophy are both required."
    );
  }
  if (modalitySpec.cyclic === true) {
    notes.push(
      "Cyclic mature peptide — containment sees the linear precursor; confirm the ligation junction by MS."
    );
  }
  return {
    host,
    hostDisplay: hostSpec.shortName,
    auxotrophy: [...hostSpec.containment.auxotrophy],
    killSwitches: [...hostSpec.containment.killSwitches],
    integration: hostSpec.containment.integration,
    plasmidStability: assessPlasmidStability(seq, host),
    payloadToxicity: assessPayloadToxicity(seq, cysteines, host),
    notes,
  };
}
