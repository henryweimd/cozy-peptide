import type {
  AgentToolResult,
  ApiResponse,
  LabHandoffManifest,
  RefinementTurn,
  SpecificityReport,
  SymbolicAuditResult,
} from "../types/peptide";
import { cysteineIndices } from "./protein-grammar";
import {
  DEFAULT_MODALITY,
  type Modality,
  loopSegmentsForModality,
  parseModalityGrammar,
  specForModality,
} from "./modality";
import { buildVerificationReport } from "./symbolic-auditor";
import { buildCloningPayload, constructTag } from "./lab-handoff";
import type { TargetClass } from "./prompt-steering";
import { META_SPARK_MODEL, displayNameForModel } from "./spark-config";
import type { ResearchProvenance } from "./research/brief";

const LINGUISTIC_PARADIGM = "context_sensitive_loop_grammar";

/** Human-readable liability names cleared by the strict audit motifs. */
function liabilitiesCleared(sequence: string): string[] {
  const cleared: string[] = [];
  if (!/(KR|RR|KK|RK)/.test(sequence)) cleared.push("Trypsin");
  if (!/(KR|RR|KK|RK|PR)/.test(sequence)) cleared.push("Kex2-site");
  if (!/[FYW][^P][KR]/.test(sequence)) {
    cleared.push("Pepsin");
    cleared.push("Chymotrypsin");
  }
  if (!/D[GS]/.test(sequence)) cleared.push("Asp-Gly");
  if (!/N[GS]/.test(sequence)) cleared.push("Asn-Gly");
  if (!/N[^P][ST]/.test(sequence)) cleared.push("N-glycosylation");
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
  manifest: LabHandoffManifest,
  modality: Modality = DEFAULT_MODALITY,
  agentTools: AgentToolResult[] = [],
  targetClass: TargetClass = "general",
  model: string = META_SPARK_MODEL,
  research?: ResearchProvenance
): ApiResponse {
  const grammar = parseModalityGrammar(candidate, modality);
  const spec = specForModality(modality);
  const accepted = history.find((entry) => entry.disposition === "accepted");
  const specificity: SpecificityReport = accepted?.specificity ?? {
    checked: false,
    pass: true,
    intended_target: target,
    predicted_targets: [],
    off_targets: [],
    high_risk_flags: [],
    warnings: [],
    reason: "Specificity review not run for this candidate",
  };
  return {
    success: true,
    target,
    modality: spec.responseId,
    specificity,
    agent_tools: agentTools,
    research_provenance:
      research === undefined
        ? {
            status: "disabled",
            latency_ms: 0,
            evidence_count: 0,
            cached: false,
            sources: [],
            brief: null,
          }
        : {
            status: research.status,
            ...(research.reason !== undefined
              ? { reason: research.reason }
              : {}),
            latency_ms: research.latencyMs,
            evidence_count: research.evidenceCount,
            cached: research.cached,
            sources: research.sources.map((source) => ({
              name: source.name,
              count: source.count,
              latency_ms: source.latencyMs,
              ...(source.error !== undefined ? { error: source.error } : {}),
            })),
            brief: research.brief ?? null,
          },
    neurosymbolic_provenance: {
      proposer_model: displayNameForModel(model),
      linguistic_paradigm: LINGUISTIC_PARADIGM,
      compiler_refinement_cycles: refinementCycles(history),
      target_class: targetClass,
      refinement_trace: history,
    },
    candidate: {
      id: `${spec.idPrefix}${constructTag(candidate)}`,
      sequence: candidate,
      length: candidate.length,
      cysteine_indices: cysteineIndices(candidate),
      loop_segments: loopSegmentsForModality(grammar, modality),
      biophysical_profile: {
        net_charge_ph74: audit.net_charge_ph74,
        isoelectric_point: audit.isoelectric_point,
        gravy_score: audit.gravy_score,
        boman_index: audit.boman_index,
      },
      cloning_payload: buildCloningPayload(candidate, modality),
      verification_report: buildVerificationReport(grammar, audit),
      mature_sequence: candidate,
      topology: spec.topologyLabel,
      grammar_breakdown: grammar.loops,
    },
    symbolic_audit: {
      passed: audit.passed,
      length: audit.length,
      cys_count: audit.cys_count,
      charge: audit.formal_charge,
      charge_target: chargeTarget,
      net_charge_ph74: audit.net_charge_ph74,
      gravy: audit.gravy_score,
      boman_index: audit.boman_index,
      aliphatic_index: audit.aliphatic_index,
      isoelectric_point: audit.isoelectric_point,
      mucosal_adhesion_ratio: audit.mucosal_adhesion_ratio,
      cleavage_susceptibility_index: audit.cleavage_susceptibility_index,
      therapeutic_index: audit.therapeutic_index,
      safety_index: audit.safety_index,
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
      synthesis_difficulty: manifest.synthesis_difficulty,
      order_csv: manifest.order_csv,
    },
  } as unknown as ApiResponse;
}
