/**
 * Outbound lab dispatch: repackages a stored run as a machine-readable
 * work order — design specifications plus suggested experiment
 * parameters — for external labs and CRO integrations. Pure builder
 * over a fetched run; the route handles auth and fetching.
 */

import { z } from "zod";
import { LabHandoffManifestSchema } from "../types/peptide";
import type { RunDetail } from "./db/recent";

export const LAB_DISPATCH_SCHEMA = "cozy-peptide.lab-dispatch/1";

/**
 * Stored handoff shape. The persistence layer renames two builder keys
 * on write (see neurosymbolic-payload), so ledger blobs never match
 * LabHandoffManifestSchema directly; the dispatch accepts both shapes.
 */
const StoredHandoffSchema = z.object({
  mature_fasta: z.string(),
  precursor_fasta: z.string(),
  gblock_manifest: z.string(),
  cDNA_sequence: z.string(),
  gc_content: z.number(),
  mw_da: z.number(),
  order_csv: z.string().optional(),
  host: z.string().optional(),
  host_display: z.string().optional(),
  yeast_chassis: z.string(),
  secretion_leader: z.string(),
  codon_basis: z.string().optional(),
});

interface NormalizedHandoff {
  mature_fasta: string;
  precursor_fasta: string;
  dna_gblock: string;
  cdna_sequence: string;
  gc_content: number;
  mw_da: number;
  order_csv: string | null;
  host: string | null;
  host_display: string | null;
  yeast_chassis: string;
  secretion_leader: string;
  codon_basis: string | null;
}

function normalizeHandoff(value: unknown): NormalizedHandoff | null {
  const builder = LabHandoffManifestSchema.safeParse(value);
  if (builder.success) {
    const handoff = builder.data;
    return {
      mature_fasta: handoff.mature_fasta,
      precursor_fasta: handoff.precursor_fasta,
      dna_gblock: handoff.dna_gblock,
      cdna_sequence: handoff.cdna_sequence,
      gc_content: handoff.gc_content,
      mw_da: handoff.mw_da,
      order_csv: handoff.order_csv ?? null,
      host: handoff.host ?? null,
      host_display: handoff.host_display ?? null,
      yeast_chassis: handoff.yeast_chassis,
      secretion_leader: handoff.secretion_leader,
      codon_basis: handoff.codon_basis ?? null,
    };
  }
  const stored = StoredHandoffSchema.safeParse(value);
  if (!stored.success) return null;
  const handoff = stored.data;
  return {
    mature_fasta: handoff.mature_fasta,
    precursor_fasta: handoff.precursor_fasta,
    dna_gblock: handoff.gblock_manifest,
    cdna_sequence: handoff.cDNA_sequence,
    gc_content: handoff.gc_content,
    mw_da: handoff.mw_da,
    order_csv: handoff.order_csv ?? null,
    host: handoff.host ?? null,
    host_display: handoff.host_display ?? null,
    yeast_chassis: handoff.yeast_chassis,
    secretion_leader: handoff.secretion_leader,
    codon_basis: handoff.codon_basis ?? null,
  };
}

export interface LabDispatchExperiment {
  methods_suggested: string[];
  unit: string;
  replicates_suggested: number;
  controls_suggested: string[];
  notes: string;
}

export interface LabDispatch {
  schema: typeof LAB_DISPATCH_SCHEMA;
  run_id: string;
  generated_at: string;
  design: {
    target: string;
    modality: string | null;
    candidate_id: string | null;
    candidate_sequence: string | null;
    mature_fasta: string;
    precursor_fasta: string;
    dna_gblock: string;
    cdna_sequence: string;
    gc_content: number;
    mw_da: number;
    order_csv: string | null;
  };
  chassis: {
    host: string | null;
    host_display: string | null;
    yeast_chassis: string;
    secretion_leader: string;
    codon_basis: string | null;
  };
  experiment_panel: {
    sequence_verification: LabDispatchExperiment;
    expression_titer: LabDispatchExperiment;
    mic: LabDispatchExperiment;
    cytotoxicity: LabDispatchExperiment;
  };
  result_ingest: {
    endpoint: string;
    templates_endpoint: string;
    auth: string;
    template_version: string;
    consent_license_default: string;
  };
}

const ASSAY_TEMPLATE_VERSION = "labguide-1";

/**
 * Builds the dispatch payload, or null when the run has no usable
 * handoff manifest (pre-handoff and failed runs).
 */
export function buildLabDispatch(run: RunDetail): LabDispatch | null {
  const handoff = normalizeHandoff(run.labHandoff);
  if (handoff === null) return null;
  if (
    run.candidateSequence === null ||
    run.candidateSequence.length === 0 ||
    handoff.dna_gblock.length === 0
  ) {
    return null;
  }
  const experiment = (
    methods_suggested: string[],
    unit: string,
    notes: string,
    controls_suggested: string[] = ["no-peptide growth control"]
  ): LabDispatchExperiment => ({
    methods_suggested,
    unit,
    replicates_suggested: 3,
    controls_suggested,
    notes,
  });
  return {
    schema: LAB_DISPATCH_SCHEMA,
    run_id: run.id,
    generated_at: new Date().toISOString(),
    design: {
      target: run.target,
      modality: run.modality,
      candidate_id: run.candidateId,
      candidate_sequence: run.candidateSequence,
      mature_fasta: handoff.mature_fasta,
      precursor_fasta: handoff.precursor_fasta,
      dna_gblock: handoff.dna_gblock,
      cdna_sequence: handoff.cdna_sequence,
      gc_content: handoff.gc_content,
      mw_da: handoff.mw_da,
      order_csv: handoff.order_csv ?? null,
    },
    chassis: {
      host: handoff.host ?? null,
      host_display: handoff.host_display ?? null,
      yeast_chassis: handoff.yeast_chassis,
      secretion_leader: handoff.secretion_leader,
      codon_basis: handoff.codon_basis ?? null,
    },
    experiment_panel: {
      sequence_verification: experiment(
        ["sanger", "full-plasmid-seq"],
        "match_pct",
        "Confirm the built construct against dna_gblock before expression."
      ),
      expression_titer: experiment(
        ["ELISA", "HPLC", "western-blot"],
        "mg/L",
        "Secreted mature peptide in culture supernatant."
      ),
      mic: experiment(
        ["broth microdilution"],
        "ug/mL",
        "Target pathogen plus a commensal counter-panel when available.",
        ["no-peptide growth control", "reference antibiotic"]
      ),
      cytotoxicity: experiment(
        ["CellTiter-Glo", "MTT"],
        "viability_pct",
        "Mammalian lines (e.g. Caco-2, HEK293) at and above the MIC.",
        ["untreated cells", "vehicle control"]
      ),
    },
    result_ingest: {
      endpoint: "/api/assay-results",
      templates_endpoint: "/api/assay-templates",
      auth: "Authorization: Bearer <API_BEARER_TOKEN>",
      template_version: ASSAY_TEMPLATE_VERSION,
      consent_license_default: "CC0",
    },
  };
}
