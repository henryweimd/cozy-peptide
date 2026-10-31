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
 * Deterministic symbolic verification result for one peptide candidate.
 */
export const SymbolicAuditResultSchema = z.object({
  passed: z.boolean(),
  length: z.number().int(),
  cys_count: z.number().int(),
  formal_charge: z.number().int(),
  gravy_score: z.number(),
  violations: z.array(z.string()),
});
export type SymbolicAuditResult = z.infer<typeof SymbolicAuditResultSchema>;

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
