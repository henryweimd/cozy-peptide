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
];

export function isDemoPresetTarget(target: string): boolean {
  const normalized = target.trim();
  return DEMO_PRESETS.some((preset) => preset.target === normalized);
}
