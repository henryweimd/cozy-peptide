import type { RefinementTurn } from "../types/peptide";
import type { Modality } from "./modality";
import { DEFAULT_MODALITY, specForModality } from "./modality";
import type { ResearchBrief } from "./research/brief";

/**
 * Therapeutic target classes inferred from the request text. The system
 * steers every proposal with the matching design brief — the caller only
 * names the disease.
 */
export type TargetClass =
  | "bacterial-colonization"
  | "toxin-blockade"
  | "barrier-repair"
  | "inflammation"
  | "pain-motility"
  | "metabolic"
  | "general";

const CLASS_PATTERNS: Array<{ cls: TargetClass; patterns: RegExp[] }> = [
  {
    cls: "bacterial-colonization",
    patterns: [
      /clostrid/i,
      /difficile/i,
      /c\.?\s*diff/i,
      /colonization/i,
      /e\.?\s*coli/i,
      /etec/i,
      /ehec/i,
      /salmonella/i,
      /shigella/i,
      /campylobacter/i,
      /h\.?\s*pylori/i,
      /pylori/i,
      /klebsiella/i,
      /vancomycin-resistant/i,
      /\bvre\b/i,
      /mrsa/i,
      /biofilm/i,
      /adhesin/i,
      /fimbri/i,
    ],
  },
  {
    cls: "toxin-blockade",
    patterns: [
      /tcda/i,
      /tcdb/i,
      /toxin\s*[ab]\b/i,
      /toxin.?mediated/i,
      /enterotoxin/i,
      /shiga-like/i,
      /neutraliz/i,
      /antitoxin/i,
    ],
  },
  {
    cls: "barrier-repair",
    patterns: [
      /barrier/i,
      /leaky\s*gut/i,
      /tight\s*junction/i,
      /claudin/i,
      /occludin/i,
      /zonulin/i,
      /mucosal\s*healing/i,
      /mucositis/i,
      /ulcer/i,
      /fistula/i,
    ],
  },
  {
    cls: "inflammation",
    patterns: [
      /inflam/i,
      /\bibd\b/i,
      /crohn/i,
      /colitis/i,
      /tnf/i,
      /cytokine/i,
      /interleukin/i,
      /autoimmun/i,
    ],
  },
  {
    cls: "pain-motility",
    patterns: [
      /\bibs\b/i,
      /irritable/i,
      /\bpain\b/i,
      /visceral/i,
      /motility/i,
      /constipation/i,
      /diarrhea/i,
      /diarrhoea/i,
      /cramp/i,
      /spasm/i,
      /protease-activated receptor/i,
    ],
  },
  {
    cls: "metabolic",
    patterns: [
      /diabet/i,
      /obes/i,
      /glp-?1/i,
      /incretin/i,
      /metabolic/i,
      /glycemi/i,
      /insulin/i,
      /bile\s*acid/i,
      /cholesterol/i,
      /lipid/i,
    ],
  },
];

/**
 * Infers the therapeutic target class from the target and mechanism
 * text. First matching class wins; order runs from most to least
 * specific. Falls back to `general`.
 */
export function inferTargetClass(
  target: string,
  mechanism?: string
): TargetClass {
  const text = `${target}\n${mechanism ?? ""}`;
  for (const entry of CLASS_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return entry.cls;
    }
  }
  return "general";
}

const CLASS_BRIEFS: Record<TargetClass, string> = {
  "bacterial-colonization":
    "Therapeutic brief (bacterial colonization): aim at plausible gut molecular targets — adhesins, colonization factors, fimbrial tips, or surface glycans of the named pathogen. Bias cationic residues toward the most solvent-exposed loop to engage anionic bacterial surfaces; favor amphipathic balance over raw hydrophobicity; keep the scaffold protease-tight since the gut lumen is the battlefield.",
  "toxin-blockade":
    "Therapeutic brief (toxin blockade): aim at the toxin's receptor-binding surface — design a binding interface, never a toxin fragment — shape a stable loop that can occlude it; prioritize loop rigidity and charge complementarity to the toxin target; no translocation-domain content of any kind.",
  "barrier-repair":
    "Therapeutic brief (barrier repair): aim at tight-junction biology — claudin/occludin interfaces or mucin engagement that supports epithelial integrity. Favor gentle mucosal retention — moderate cationic charge spread across loops, low hydrophobicity, minimal protease footprint — so the peptide lingers at the epithelium; avoid anything membrane-lytic.",
  inflammation:
    "Therapeutic brief (inflammation): aim at a plausible mucosal mediator — TNF-family cytokines, interleukins, or leukocyte integrins active in gut inflammation. Design a compact, stable binding surface for local modulation; keep immunogenic risk low — no aggregation-prone runs, no deamidation hotspots; stability first, since inflamed mucosa is protease-rich.",
  "pain-motility":
    "Therapeutic brief (pain/motility): aim at enteric signaling — protease-activated receptors, serotonin or motilin-pathway receptors in the gut wall — for local luminal or mucosal action with minimal systemic exposure risk. Stable, compact, and clean — no channel-blocking pharmacophores, no hemolytic character; the peptide must calm the gut, never excite it.",
  metabolic:
    "Therapeutic brief (metabolic): aim at gut-axis receptors — GLP-1/incretin pathways or bile-acid signaling — with receptor-engaging loop geometry and high stability for sustained luminal presence; keep the design soluble and non-aggregating; charge placement should aid mucosal dwell without membrane disruption.",
  general:
    "Therapeutic brief (general): aim at a plausible gut molecular target stated in or implied by the request — a pathogen surface, a mucosal receptor, or an epithelial interface. Maximize specific binding potential with a well-ordered loop display; keep charge, solubility, and protease resistance balanced for gut delivery; stability and safety dominate every trade-off.",
};

/**
 * Best-scaffold default per therapeutic objective. Auto doesn't mean
 * "always the knottin" — it means the scaffold whose strengths match
 * the job: hairpins engage anionic bacterial surfaces, cyclotides
 * outlast protease-rich mucosa, helical scaffolds mimic gut-axis
 * peptide hormones, and the knottin's rigid loops occlude binding
 * interfaces. Unknown objectives fall back to the knottin, the
 * safest blind default.
 */
export const DEFAULT_MODALITY_BY_CLASS: Record<
  TargetClass,
  { modality: Modality; reason: string }
> = {
  "bacterial-colonization": {
    modality: "hairpin-2c",
    reason:
      "Hairpin 2C: a compact cationic wedge for anionic bacterial surfaces",
  },
  "toxin-blockade": {
    modality: "knottin-6c",
    reason:
      "Knottin 6C: rigid loops to occlude a toxin's receptor-binding surface",
  },
  "barrier-repair": {
    modality: "cyclotide-6c",
    reason:
      "Cyclotide 6C: the cyclic backbone outlasts protease-rich mucosa",
  },
  inflammation: {
    modality: "cyclotide-6c",
    reason:
      "Cyclotide 6C: maximum stability where inflamed tissue runs protease-hot",
  },
  "pain-motility": {
    modality: "knottin-6c",
    reason:
      "Knottin 6C: compact, stable receptor engagement for enteric signaling",
  },
  metabolic: {
    modality: "helical",
    reason:
      "Helical: gut-axis hormones are alpha-helices, so the mimic is too",
  },
  general: {
    modality: DEFAULT_MODALITY,
    reason:
      "Knottin 6C: most stable in the gut — the safest default when unsure",
  },
};

/**
 * Resolves the Auto scaffold for a target class: the modality most
 * likely to work for the objective set, plus the one-line reason shown
 * in the UI and recorded in the run ledger.
 */
export function selectDefaultModality(targetClass: TargetClass): {
  modality: Modality;
  reason: string;
} {
  return DEFAULT_MODALITY_BY_CLASS[targetClass];
}

/**
 * Safety-first instruction block injected into every proposal prompt.
 * Kept free of human-harm example terms: the upstream API rejects such
 * prompts with content-policy violations, so the preamble steers by
 * exclusion without naming toxins, channels, or hemolysis triggers.
 */
export const SAFETY_PREAMBLE = [
  "Safety contract (non-negotiable): gut-stable, non-toxic design for local mucosal action only.",
  "No toxin, venom, or translocation-domain content; no membrane-lytic or pore-forming character.",
  "No activity against human cardiac, neural, or clotting pathways; flag and avoid any such pharmacophore.",
  "Prefer stable, soluble, non-aggregating compositions a human gut can tolerate continuously.",
].join(" ");

/**
 * Builds the system-authored steering brief for a request: target-class
 * design directives plus the safety preamble. The caller names the
 * disease; the system engineers the rest.
 */
export function buildSteeringBrief(
  target: string,
  mechanism?: string
): { targetClass: TargetClass; brief: string } {
  const targetClass = inferTargetClass(target, mechanism);
  const parts = [CLASS_BRIEFS[targetClass], SAFETY_PREAMBLE];
  if (mechanism !== undefined && mechanism.trim().length > 0) {
    parts.push(`Caller mechanism note (advisory, constraints win): ${mechanism.trim()}`);
  }
  return { targetClass, brief: parts.join(" ") };
}

/**
 * Renders a converged literature brief as compact prompt prose. Capped
 * and citation-tagged so the generation prompt gains grounding without
 * prompt bloat or raw-abstract noise.
 */
export function renderResearchBrief(brief: ResearchBrief): string {
  const parts: string[] = [];
  if (brief.targets.length > 0) {
    parts.push(
      `Literature-grounded targets: ${brief.targets
        .map((entry) =>
          entry.rationale.length > 0
            ? `${entry.name} (${entry.rationale})`
            : entry.name
        )
        .join("; ")}.`
    );
  }
  if (brief.mechanisms.length > 0) {
    parts.push(
      `Supported mechanisms: ${brief.mechanisms
        .map((entry) =>
          entry.rationale.length > 0
            ? `${entry.name} (${entry.rationale})`
            : entry.name
        )
        .join("; ")}.`
    );
  }
  if (brief.avoid.length > 0) {
    parts.push(
      `Explicitly avoid: ${brief.avoid
        .map((entry) =>
          entry.rationale.length > 0
            ? `${entry.name} (${entry.rationale})`
            : entry.name
        )
        .join("; ")}.`
    );
  }
  if (brief.citations.length > 0) {
    parts.push(
      `Evidence: ${brief.citations.map((cite) => cite.ref).join(", ")} ` +
        `(${brief.evidenceCount} papers consulted).`
    );
  }
  return parts.join(" ").slice(0, 1500);
}

/**
 * Appends the literature brief to the static steering brief. A null
 * brief returns the static brief byte-identical — the research fallback
 * path leaves generation behavior exactly as before.
 */
export function withResearchBrief(
  staticBrief: string,
  brief: ResearchBrief | null
): string {
  if (brief === null) return staticBrief;
  const rendered = renderResearchBrief(brief);
  if (rendered.length === 0) return staticBrief;
  return `${staticBrief} ${rendered}`;
}

/**
 * Constraint block for a design modality, in prompt prose. Knottin text
 * is kept byte-identical to the legacy prompt lines so existing prompt
 * contracts hold; other modalities get their own windows.
 */
export function constraintBlockForModality(
  modality: Modality,
  chargeTarget: number
): string[] {
  if (modality === "knottin-6c") {
    return [
      "Knottin cysteine topology: C-X(3,7)-C-X(3,6)-C-X(1,4)-C-X(2,6)-C-X(4,10)-C (exactly 6 cysteines, C1-C4 / C2-C5 / C3-C6); total length 28-36 amino acids.",
      "Zero Kex2 internal cleavage: no KR, RR, PR, or KK motifs anywhere (they fragment during Golgi processing); also no RK dibasic.",
      "Zero N-linked glycosylation: no N[^P][ST] sequon (yeast hyper-mannosylation would occlude binding loops).",
      "Clean N-terminal processing: residue 1 (immediately downstream of the Kex2 cleavage boundary) must be small and unhindered (A, S, G, or C) — never P, F, Y, or W.",
      `Charge and hydropathy: net charge exactly +${chargeTarget} (inside the +1 to +4 window at pH 7.4 for gentle mucosal retention); Kyte-Doolittle GRAVY between -0.40 and +0.10; hydrophobic runs over [VILMFW] at most 3 consecutive residues.`,
      "No exposed chymotrypsin consensus sites ([FYW][^P][KR]).",
      "No deamidation (NG), isomerization (DG), or acid-labile (DP) hotspots; at most one methionine (oxidation risk).",
    ];
  }
  const spec = specForModality(modality);
  const shared = [
    "Zero Kex2 internal cleavage: no KR, RR, PR, or KK motifs anywhere (they fragment during Golgi processing); also no RK dibasic.",
    "Zero N-linked glycosylation: no N[^P][ST] sequon (yeast hyper-mannosylation would occlude binding loops).",
    "Clean N-terminal processing: residue 1 (immediately downstream of the Kex2 cleavage boundary) must be small and unhindered (A, S, G, or C) — never P, F, Y, or W.",
    `Charge and hydropathy: net charge exactly +${chargeTarget} (inside the +1 to +4 window at pH 7.4 for gentle mucosal retention); Kyte-Doolittle GRAVY between ${spec.gravyMin.toFixed(2)} and +${spec.gravyMax.toFixed(2)}; hydrophobic runs over [VILMFW] at most 3 consecutive residues.`,
    "No exposed chymotrypsin consensus sites ([FYW][^P][KR]).",
    "No deamidation (NG), isomerization (DG), or acid-labile (DP) hotspots; at most one methionine (oxidation risk).",
  ];
  if (modality === "cyclotide-6c") {
    return [
      "Cyclotide cysteine topology: C-X(3,7)-C-X(3,6)-C-X(1,4)-C-X(2,6)-C-X(4,10)-C (exactly 6 cysteines, C1-C4 / C2-C5 / C3-C6); total length 28-37 amino acids.",
      "Backbone cyclization: the linear precursor's N- and C-termini are ligated after expression (split-intein or sortase), so keep both termini small and unhindered — residue 1 in {A, S, G, C} as usual, and the C-terminal residue never proline.",
      ...shared,
    ];
  }
  if (modality === "hairpin-2c") {
    return [
      "Beta-hairpin topology: exactly 2 cysteines with at least 6 residues between them, pinning two antiparallel strands; total length 12-20 amino acids. Place a short turn (2-4 residues, favoring G, S, N, T) near the middle of the inter-cysteine loop.",
      ...shared,
    ];
  }
  if (modality === "helical") {
    return [
      "Helical topology: no cysteines at all (unpaired thiols oxidize and dimerize); total length 12-26 amino acids.",
      "Amphipathic alpha-helix: cluster hydrophobic residues (A, V, I, L, M, F) on one helical face with a 3-4 residue periodicity and cationic/polar residues on the opposite face, so the KD-scale hydrophobic moment clears 1.20; avoid proline (helix breaker).",
      ...shared,
    ];
  }
  const cysLine =
    spec.cysteines === 0
      ? "Linear topology: no cysteines at all (unpaired thiols oxidize and dimerize); total length 8-30 amino acids."
      : `Disulfide topology: exactly ${spec.cysteines} cysteines with at least ${spec.minCysSpacing} residues between consecutive cysteines; total length ${spec.minLength}-${spec.maxLength} amino acids.`;
  return [cysLine, ...shared];
}

/**
 * Repair steering: summarizes failure modes across the refinement
 * history so the repair prompt prioritizes whatever keeps failing.
 * Returns null when there is no history to learn from.
 */
export function buildRepairSteering(
  history: RefinementTurn[]
): string | null {
  const counts = new Map<string, number>();
  for (const entry of history) {
    for (const mode of entry.failure_modes ?? []) {
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked
    .slice(0, 3)
    .map(([mode, count]) => `${mode} (x${count})`)
    .join(", ");
  return `Repair steering: across ${history.length} prior turn(s) the recurring faults are ${top}. Fix these first; do not trade a recurring fault for a new one.`;
}
