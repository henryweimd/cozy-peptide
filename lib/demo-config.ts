/**
 * Public demo configuration. Safe to import from client components:
 * contains no secrets, only the preset allowlist and cooldown policy.
 */

/** Seconds each visitor must wait between demo generations. */
export const DEMO_COOLDOWN_SECONDS = 60;

/** Fixed formal charge target for demo generations. */
export const DEMO_CHARGE_TARGET = 4;

export interface DemoPreset {
  id: string;
  label: string;
  target: string;
}

/**
 * Pre-screened gut conditions for the public demo. Each target passes the
 * biosecurity filter and suits the knottin modality; the demo API route
 * rejects anything outside this allowlist.
 */
export const DEMO_PRESETS: DemoPreset[] = [
  {
    id: "c-diff",
    label: "C. difficile gut infection",
    target: "Clostridioides difficile colonization in the gut",
  },
  {
    id: "ibd",
    label: "IBD gut inflammation",
    target: "Inflammatory bowel disease gut inflammation",
  },
  {
    id: "ibs",
    label: "IBS pain & constipation",
    target: "Irritable bowel syndrome abdominal pain and constipation",
  },
  {
    id: "barrier",
    label: "Leaky gut barrier repair",
    target: "Intestinal barrier dysfunction and mucosal healing",
  },
  {
    id: "etec",
    label: "Traveler's diarrhea (E. coli)",
    target: "Enterotoxigenic E. coli gut colonization blockade",
  },
  {
    id: "bile-acid",
    label: "Bile acid diarrhea",
    target: "bile acid diarrhea",
  },
  {
    id: "sibo",
    label: "SIBO overgrowth",
    target: "small intestinal bacterial overgrowth",
  },
  {
    id: "uc",
    label: "Ulcerative colitis",
    target: "ulcerative colitis gut inflammation",
  },
  {
    id: "cjejuni",
    label: "C. jejuni infection",
    target: "Campylobacter jejuni gut colonization",
  },
  {
    id: "salmonella",
    label: "Salmonella blockade",
    target: "pathogenic salmonella gut colonization",
  },
  {
    id: "dysbiosis",
    label: "Post-antibiotic dysbiosis",
    target: "gut dysbiosis after antibiotics",
  },
  {
    id: "cholera",
    label: "Cholera colonization",
    target: "Vibrio cholerae gut colonization",
  },
];

/**
 * Recovery suggestions offered when free-text input fails the guard:
 * valid gut conditions deliberately outside the presets and the
 * stock examples, so a rejected visitor has somewhere to go.
 * Covered by a test asserting each one passes the guard.
 */
export const GUARD_RECOVERY_SUGGESTIONS: string[] = [
  "small intestinal bacterial overgrowth",
  "ulcerative colitis gut inflammation",
  "gut dysbiosis after antibiotics",
  "C. jejuni gut colonization",
  "microscopic colitis diarrhea",
  "cholera gut colonization",
];

export function isDemoPresetTarget(target: string): boolean {
  const normalized = target.trim();
  return DEMO_PRESETS.some((preset) => preset.target === normalized);
}
