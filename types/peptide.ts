import { z } from "zod";

/**
 * Incoming client request for a gut-delivered knottin (28-36 aa).
 */
export const PeptideRequestSchema = z.object({
  target: z.string().min(1).max(500),
  mechanism: z.string().max(2000).optional(),
  charge_target: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
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
        message: z
          .object({
            role: z.string().optional(),
            content: z.string(),
          })
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
export const RefinementTurnSchema = z.object({
  turn: z.number().int(),
  candidate: z.string(),
  grammar_valid: z.boolean(),
  syntax_errors: z.array(z.string()),
  audit_passed: z.boolean(),
  violations: z.array(z.string()),
  compiler_diagnostic: z.string(),
  disposition: z.enum(["accepted", "repaired", "exhausted"]),
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
  gravy_score: z.number(),
  violations: z.array(z.string()),
  boman_index: z.number(),
  aliphatic_index: z.number(),
  isoelectric_point: z.number(),
  mucosal_adhesion_ratio: z.number(),
  cleavage_susceptibility_index: z.number(),
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
});
export type LabHandoffManifest = z.infer<typeof LabHandoffManifestSchema>;

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
