import { z } from "zod";

/**
 * Incoming client request for a gut-delivered peptide. Defaults to the
 * flagship knottin modality; callers may request simpler disulfide or
 * linear scaffolds instead.
 */
export const PeptideRequestSchema = z.object({
  target: z.string().min(1).max(500),
  mechanism: z.string().max(2000).optional(),
  charge_target: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
  modality: z
    .enum(["knottin-6c", "disulfide-4c", "disulfide-2c", "linear"])
    .optional(),
});
export type PeptideRequest = z.infer<typeof PeptideRequestSchema>;

/**
 * Chat message shape used by the Meta Spark 1.3 Contributor API.
 */
export const MetaSparkMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});
export type MetaSparkMessage = z.infer<typeof MetaSparkMessageSchema>;

/**
 * Outbound payload sent to the Meta Spark 1.3 Contributor API.
 */
export const MetaSparkRequestSchema = z.object({
  model: z.string(),
  messages: z.array(MetaSparkMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  reasoning_effort: z.string().optional(),
});
export type MetaSparkRequest = z.infer<typeof MetaSparkRequestSchema>;

/**
 * Inbound completion received from the Meta Spark 1.3 Contributor API.
 * Kept tolerant (optional fields) because contributor endpoints vary;
 * unparseable completions trigger deterministic fallback sampling.
 */
export const MetaSparkResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        index: z.number().int().optional(),
        finish_reason: z.string().optional(),
        message: z
          .object({
            role: z.string().optional(),
            content: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
        text: z.string().optional(),
      })
    )
    .optional(),
  output_text: z.string().optional(),
});
export type MetaSparkResponse = z.infer<typeof MetaSparkResponseSchema>;

/**
 * Union covering both directions of the Meta Spark 1.3 Contributor API exchange.
 */
export const MetaSparkPayloadSchema = z.union([
  MetaSparkRequestSchema,
  MetaSparkResponseSchema,
]);
export type MetaSparkPayload = z.infer<typeof MetaSparkPayloadSchema>;

/**
 * One turn of the neurosymbolic propose-verify-repair loop, kept as
 * conversational provenance for the API response.
 */
/**
 * Blinded round-trip specificity review: the proposer model judges a
 * candidate without knowing the intended target.
 */
export const SpecificityReportSchema = z.object({
  checked: z.boolean(),
  pass: z.boolean(),
  intended_target: z.string(),
  predicted_targets: z.array(z.string()),
  off_targets: z.array(z.string()),
  high_risk_flags: z.array(z.string()),
  warnings: z.array(z.string()),
  gut_plausible: z.boolean().optional(),
  reason: z.string(),
});
export type SpecificityReport = z.infer<typeof SpecificityReportSchema>;

export const RefinementTurnSchema = z.object({
  turn: z.number().int(),
  candidate: z.string(),
  grammar_valid: z.boolean(),
  syntax_errors: z.array(z.string()),
  audit_passed: z.boolean(),
  violations: z.array(z.string()),
  compiler_diagnostic: z.string(),
  disposition: z.enum(["accepted", "repaired", "exhausted", "superseded"]),
  source: z.enum(["meta-spark-1.3", "deterministic-synthesis"]),
  specificity: SpecificityReportSchema.optional(),
  failure_modes: z.array(z.string()).optional(),
  temperature: z.number().optional(),
});
export type RefinementTurn = z.infer<typeof RefinementTurnSchema>;

/**
 * Linguistic parse of a knottin against the loop-grammar skeleton
 * L0-C1-L1-C2-L2-C3-L3-C4-L4-C5-L5-C6-L6.
 */
export const KnottinGrammarParseSchema = z.object({
  valid: z.boolean(),
  loops: z.record(z.string(), z.string()),
  syntaxErrors: z.array(z.string()),
});
export type KnottinGrammarParse = z.infer<typeof KnottinGrammarParseSchema>;

/**
 * Deterministic symbolic verification result for one peptide candidate,
 * including the developability ledger metrics.
 */
export const SymbolicAuditResultSchema = z.object({
  passed: z.boolean(),
  length: z.number().int(),
  cys_count: z.number().int(),
  formal_charge: z.number().int(),
  net_charge_ph74: z.number(),
  gravy_score: z.number(),
  violations: z.array(z.string()),
  boman_index: z.number(),
  aliphatic_index: z.number(),
  isoelectric_point: z.number(),
  mucosal_adhesion_ratio: z.number(),
  cleavage_susceptibility_index: z.number(),
  hydrophobic_run_max: z.number().int(),
  max_residue_fraction: z.number(),
  therapeutic_index: z.number().optional(),
  safety_index: z.number().optional(),
});
export type SymbolicAuditResult = z.infer<typeof SymbolicAuditResultSchema>;

/**
 * Restriction-scrub verification for the expression cassette DNA.
 */
export const RestrictionScrubSchema = z.object({
  status: z.string(),
  sites_verified: z.array(z.string()),
});
export type RestrictionScrub = z.infer<typeof RestrictionScrubSchema>;

/**
 * Computed biophysical profile attached to an accepted candidate.
 */
export const BiophysicalProfileSchema = z.object({
  net_charge_ph74: z.number(),
  isoelectric_point: z.number(),
  gravy_score: z.number(),
  boman_index: z.number(),
});
export type BiophysicalProfile = z.infer<typeof BiophysicalProfileSchema>;

/**
 * Deterministic verification report: one boolean per bioprocess gate,
 * plus machine-readable failure modes (empty when everything passes).
 */
export const VerificationReportSchema = z.object({
  kex2_clean: z.boolean(),
  glycosylation_clean: z.boolean(),
  charge_window_ok: z.boolean(),
  protease_clean: z.boolean(),
  n_terminus_ok: z.boolean(),
  hydrophobic_runs_ok: z.boolean(),
  gravy_ok: z.boolean(),
  oxidation_clean: z.boolean().optional(),
  deamidation_clean: z.boolean().optional(),
  isomerization_clean: z.boolean().optional(),
  acid_clean: z.boolean().optional(),
  complexity_ok: z.boolean().optional(),
  ick_topology_ok: z.boolean(),
  passed: z.boolean(),
  failure_modes: z.array(z.string()),
});
export type VerificationReport = z.infer<typeof VerificationReportSchema>;

/**
 * Ready-to-clone yeast expression cassette for one knottin payload:
 * MFalpha1 5' flank with the Kex2 junction, codon-optimized payload CDS,
 * dual stop codon, and the CYC1 terminator.
 */
export const CloningPayloadSchema = z.object({
  dna_sequence: z.string(),
  cassette_format: z.string(),
  leader_dna_5flank: z.string(),
  payload_cds: z.string(),
  stop_codon: z.string(),
  terminator_3flank: z.string(),
  full_cassette_dna: z.string(),
  gc_percent_cds: z.number(),
  gc_ok: z.boolean(),
  payload_cai: z.number(),
  restriction_scrub: RestrictionScrubSchema,
  rare_codons_avoided: z.array(z.string()),
});
export type CloningPayload = z.infer<typeof CloningPayloadSchema>;

/**
 * Expanded accepted-candidate metadata. New consumers should use `id`,
 * `sequence`, `cysteine_indices`, `loop_segments`, `biophysical_profile`,
 * `cloning_payload`, and `verification_report`; the legacy
 * `mature_sequence` / `topology` / `grammar_breakdown` keys are kept for
 * backward compatibility.
 */
export const CandidatePayloadSchema = z.object({
  id: z.string(),
  sequence: z.string(),
  length: z.number().int(),
  cysteine_indices: z.array(z.number().int()).max(6),
  loop_segments: z.array(z.string()).max(5),
  biophysical_profile: BiophysicalProfileSchema,
  cloning_payload: CloningPayloadSchema,
  verification_report: VerificationReportSchema,
  mature_sequence: z.string().optional(),
  topology: z.string().optional(),
  grammar_breakdown: z.record(z.string(), z.string()).optional(),
});
export type CandidatePayload = z.infer<typeof CandidatePayloadSchema>;

/**
 * Ready-to-copy synthesis order payload for Twist / IDT gBlock forms.
 */
export const SynthesisOrderSchema = z.object({
  sequence_name: z.string(),
  dna_length: z.number().int(),
  gc_percent: z.number(),
  volume: z.string(),
  vector_integration_strategy: z.string(),
  vendor_notes: z.string(),
});
export type SynthesisOrder = z.infer<typeof SynthesisOrderSchema>;

/**
 * DNA synthesis-difficulty report for vendor ordering.
 */
export const SynthesisDifficultySchema = z.object({
  score: z.number(),
  homopolymer_runs: z.array(z.string()),
  gc_extreme_windows: z.array(z.string()),
  repeat_flags: z.array(z.string()),
});
export type SynthesisDifficulty = z.infer<typeof SynthesisDifficultySchema>;

/**
 * Lab-handoff production artifacts for engineered S. boulardii secretion.
 */
export const LabHandoffManifestSchema = z.object({
  mature_fasta: z.string(),
  precursor_fasta: z.string(),
  dna_gblock: z.string(),
  gc_content: z.number(),
  mw_da: z.number(),
  pi: z.number(),
  order_metadata: z.record(z.string(), z.any()),
  cdna_sequence: z.string(),
  gibson_5p_arm: z.string(),
  gibson_3p_arm: z.string(),
  cai: z.number(),
  restriction_scrub: RestrictionScrubSchema,
  synthesis_order: SynthesisOrderSchema,
  yeast_chassis: z.string(),
  secretion_leader: z.string(),
  synthesis_difficulty: SynthesisDifficultySchema.optional(),
  order_csv: z.string().optional(),
});
export type LabHandoffManifest = z.infer<typeof LabHandoffManifestSchema>;

/**
 * One agentic tool invocation against an accepted candidate. Tools are
 * stubs until backends land; `not-configured` is the honest default.
 */
export const AgentToolResultSchema = z.object({
  tool: z.string(),
  status: z.enum(["ok", "not-configured", "skipped", "error"]),
  detail: z.string(),
  latency_ms: z.number(),
});
export type AgentToolResult = z.infer<typeof AgentToolResultSchema>;

/**
 * Standard API envelope for all route responses.
 */
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  details: z.any().optional(),
});
export type ApiResponse = z.infer<typeof ApiResponseSchema>;
