import type {
  ApiResponse,
  LabHandoffManifest,
  RefinementTurn,
  SymbolicAuditResult,
} from "../types/peptide";
import { parseKnottinGrammar } from "./protein-grammar";

const MODALITY = "engineered_knottin_microprotein";
const LINGUISTIC_PARADIGM = "context_sensitive_loop_grammar";
const TOPOLOGY_LABEL = "C1-C4, C2-C5, C3-C6 ICK";
const PROPOSER_MODEL = "Meta-Spark-1.3-Contributor";

/** Human-readable liability names cleared by the strict audit motifs. */
function liabilitiesCleared(sequence: string): string[] {
  const cleared: string[] = [];
  if (!/[KR]{2}/.test(sequence)) cleared.push("Trypsin");
  if (!/[FYW]L/.test(sequence)) {
    cleared.push("Pepsin");
    cleared.push("Chymotrypsin");
  }
  if (!/D[GS]/.test(sequence)) cleared.push("Asp-Gly");
  if (!/N[GS]/.test(sequence)) cleared.push("Asn-Gly");
  if (!sequence.includes("M")) cleared.push("Met-oxidation");
  return cleared;
}

export function refinementCycles(history: RefinementTurn[]): number {
  let maxTurn = 0;
  for (const entry of history) {
    if (entry.turn > maxTurn) maxTurn = entry.turn;
  }
  return maxTurn;
}

/**
 * Builds the flat neurosymbolic HTTP 200 payload shared by the
 * authenticated API route and the public demo route.
 */
export function buildNeurosymbolicPayload(
  target: string,
  chargeTarget: number,
  candidate: string,
  audit: SymbolicAuditResult,
  history: RefinementTurn[],
  manifest: LabHandoffManifest
): ApiResponse {
  const grammar = parseKnottinGrammar(candidate);
  return {
    success: true,
    target,
    modality: MODALITY,
    neurosymbolic_provenance: {
      proposer_model: PROPOSER_MODEL,
      linguistic_paradigm: LINGUISTIC_PARADIGM,
      compiler_refinement_cycles: refinementCycles(history),
      refinement_trace: history,
    },
    candidate: {
      mature_sequence: candidate,
      topology: TOPOLOGY_LABEL,
      grammar_breakdown: grammar.loops,
    },
    symbolic_audit: {
      passed: audit.passed,
      length: audit.length,
      cys_count: audit.cys_count,
      charge: audit.formal_charge,
      charge_target: chargeTarget,
      gravy: audit.gravy_score,
      boman_index: audit.boman_index,
      aliphatic_index: audit.aliphatic_index,
      isoelectric_point: audit.isoelectric_point,
      mucosal_adhesion_ratio: audit.mucosal_adhesion_ratio,
      cleavage_susceptibility_index: audit.cleavage_susceptibility_index,
      liabilities_cleared: liabilitiesCleared(candidate),
      violations: audit.violations,
    },
    lab_handoff: {
      yeast_chassis: manifest.yeast_chassis,
      secretion_leader: manifest.secretion_leader,
      cDNA_sequence: manifest.cdna_sequence,
      gblock_manifest: manifest.dna_gblock,
      gibson_5p_arm: manifest.gibson_5p_arm,
      gibson_3p_arm: manifest.gibson_3p_arm,
      mature_fasta: manifest.mature_fasta,
      precursor_fasta: manifest.precursor_fasta,
      gc_content: manifest.gc_content,
      mw_da: manifest.mw_da,
      pi: manifest.pi,
      cai: manifest.cai,
      restriction_scrub: manifest.restriction_scrub,
      synthesis_order: manifest.synthesis_order,
    },
  } as unknown as ApiResponse;
}
