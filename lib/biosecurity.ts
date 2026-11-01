import { assessGutSite } from "./gut-targets";

export type SafetyCategory =
  | "catalytic-enzyme"
  | "biosecurity"
  | "off-site";

export interface SafetyVerdict {
  safe: boolean;
  reason?: string;
  category?: SafetyCategory;
}

/**
 * Toxic-agent motifs blocked upfront. Covers ricin, abrin, and botulinum
 * (including translocation-domain constructs) plus other high-risk toxins.
 */
const TOXIC_PATTERNS: RegExp[] = [
  /ricin/i,
  /abrin/i,
  /botulin/i,
  /\bbont\b/i,
  /translocation\s*(domain|motif|region)/i,
  /diphtheria\s*toxin/i,
  /shiga(\s*toxin)?/i,
  /anthrax(\s*(toxin|lethal\s*factor|protective\s*antigen))?/i,
  /tetanus\s*toxin/i,
  /saxitoxin/i,
  /tetrodotoxin/i,
  /aflatoxin/i,
  /t-?2\s*(myc)?toxin/i,
];

/**
 * Catalytic-enzyme targets that cannot be served as short de novo peptides.
 * Catalytic pockets require large globular folds from natural homologs.
 */
const CATALYTIC_ENZYME_PATTERNS: RegExp[] = [
  /\blactase\b/i,
  /\bamylase\b/i,
  /\bprotease\b/i,
  /\blipase\b/i,
  /\bcellulase\b/i,
  /\bsucrase\b/i,
  /\bpolymerase\b/i,
  /\bkinase\b/i,
  /\bphosphatase\b/i,
  /\bcatalase\b/i,
  /\blysozyme\b/i,
  /\btrypsin\b/i,
  /\bchymotrypsin\b/i,
  /\bpepsin\b/i,
  /\belastase\b/i,
  /\bhelicase\b/i,
  /\bnuclease\b/i,
  /\bligase\b/i,
  /\btransferase\b/i,
  /\bisomerase\b/i,
  /\bhydrolase\b/i,
  /\boxidase\b/i,
  /\breductase\b/i,
  /\bsynthase\b/i,
  /catalytic\s+(enzyme|triad|pocket|domain|site)/i,
  /enzyme\s+replacement/i,
  /\benzyme\b/i,
];

export const CATALYTIC_LENGTH_CUTOFF = 45;

/**
 * Extracts an explicit requested length (in aa) from free text such as
 * "50 aa", "120 amino acids", or "60-mer".
 */
export function extractRequestedLength(text: string): number | undefined {
  const match = text.match(
    /(\d+)\s*(?:aa|amino[\s-]?acids?|residues?|-?mer)\b/i
  );
  if (!match) return undefined;
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : undefined;
}

export const OFF_SITE_GUIDANCE =
  "Gut-secreted peptides act in the digestive tract: they suit gut infections, " +
  "barrier repair, mucosal inflammation, motility, and gut-axis metabolic targets, " +
  "not distant organs. Restate the request around a target reachable from the gut lumen.";

export const CATALYTIC_ENZYME_GUIDANCE =
  "Catalytic pockets require large globular folds sourced from natural " +
  "homologs (UniProt), not short de novo peptides (8-37 aa). Gut-delivered " +
  "peptides are suited to binding, blockade, or local modulation of a " +
  "target, not to de novo catalysis. For enzyme function, express a natural " +
  "homolog identified via UniProt/BLAST instead of requesting a peptide.";

/**
 * Upfront safety screen for an incoming generation request.
 * Returns unsafe for toxic-agent motifs, for off-site (non-gut) targets,
 * and for catalytic-enzyme requests (explicit enzyme targets or requested
 * lengths above 45 aa).
 */
export function validateRequestSafety(
  target: string,
  requestedLength?: number
): SafetyVerdict {
  const text = target.trim();
  if (text.length === 0) {
    return { safe: false, reason: "Empty target.", category: "biosecurity" };
  }

  for (const pattern of TOXIC_PATTERNS) {
    if (pattern.test(text)) {
      return {
        safe: false,
        category: "biosecurity",
        reason:
          `Request blocked by the biosecurity filter: the target matches a prohibited toxic-agent motif (${pattern.source}). ` +
          "This API only designs therapeutic gut-delivered peptides and refuses toxin, translocation-domain, and bioweapon-adjacent requests.",
      };
    }
  }

  const gutSite = assessGutSite(text);
  if (!gutSite.plausible) {
    return {
      safe: false,
      category: "off-site",
      reason: `${gutSite.reason ?? "Off-site target."} ${OFF_SITE_GUIDANCE}`,
    };
  }

  const lengthHint = requestedLength ?? extractRequestedLength(text);
  if (lengthHint !== undefined && lengthHint > CATALYTIC_LENGTH_CUTOFF) {
    return {
      safe: false,
      category: "catalytic-enzyme",
      reason:
        `Requested length ${lengthHint} aa exceeds the short-peptide modalities (8-37 aa) and implies a catalytic enzyme fold. ` +
        CATALYTIC_ENZYME_GUIDANCE,
    };
  }

  for (const pattern of CATALYTIC_ENZYME_PATTERNS) {
    if (pattern.test(text)) {
      return {
        safe: false,
        category: "catalytic-enzyme",
        reason:
          `Target matches a catalytic-enzyme request (${pattern.source}). ` +
          CATALYTIC_ENZYME_GUIDANCE,
      };
    }
  }

  return { safe: true };
}
