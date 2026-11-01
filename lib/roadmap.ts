/**
 * Roadmap stubs: the major capabilities the platform names honestly
 * before they exist. Each stub renders in the web app with a "Future
 * functionality" badge, a one-line summary, and a tooltip describing
 * how it will be achieved — and each runs in the pipeline's agent-tool
 * array as a `not-configured` result, so the API carries the same
 * roadmap. Client-safe.
 */

export interface RoadmapStub {
  /** Stable id, shared with the agent-tool registry. */
  id: string;
  title: string;
  badge: string;
  /** One line, always visible. */
  summary: string;
  /** How it will be achieved — tooltip and tool detail. */
  how: string;
  /** Present when the capability shipped: links to its live home. */
  liveHref?: string;
}

export const FUTURE_BADGE = "Future functionality";

export const ROADMAP_STUBS: RoadmapStub[] = [
  {
    id: "wetlab-feedback",
    title: "Close the wet-lab loop",
    badge: FUTURE_BADGE,
    summary: "Feed assay results back into design.",
    how: "MIC, cytotoxicity, and expression-titer assays recorded against run IDs in the ledger; active learning re-ranks the next candidate pool by expected information gain.",
    liveHref: "/lab-guide",
  },
  {
    id: "potency-prediction",
    title: "Predict potency",
    badge: FUTURE_BADGE,
    summary: "Score killing power before synthesis.",
    how: "Peptide–target docking plus ML MIC/IC50 models trained on public antimicrobial-peptide data; every prediction ships with calibrated confidence.",
  },
  {
    id: "gut-safety-panel",
    title: "Prove gut safety",
    badge: FUTURE_BADGE,
    summary: "Screen the microbiome, not just the human.",
    how: "Commensal-panel activity prediction across representative flora plus MHC-II immunogenicity screening for chronic gut exposure.",
  },
];

export function roadmapStubById(id: string): RoadmapStub | null {
  return ROADMAP_STUBS.find((stub) => stub.id === id) ?? null;
}
