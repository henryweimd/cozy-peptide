import type { Modality } from "./modality";
import type { AgentToolResult } from "../types/peptide";
import { ROADMAP_STUBS } from "./roadmap";

/**
 * Agentic tool stubs: the pipeline's seam for invoking external models
 * and systems (binding prediction, structure folding, off-target
 * panels, plus the roadmap capabilities). Each tool is a stub today —
 * registered, described, and callable through one dispatcher, but
 * returning `not-configured` until a real backend is wired. Adding a
 * backend means replacing one `invoke` implementation; callers and the
 * response shape stay put.
 */

export interface AgentToolInput {
  candidate: string;
  target: string;
  modality: Modality;
  charge_target: number;
}

export interface AgentTool {
  name: string;
  description: string;
  invoke: (input: AgentToolInput) => Promise<AgentToolResult>;
}

function stubResult(tool: string, detail: string, startedAt: number): AgentToolResult {
  return {
    tool,
    status: "not-configured",
    detail,
    latency_ms: Date.now() - startedAt,
  };
}

/**
 * Binding-affinity stub: score the candidate against the intended
 * target with a docking or ML affinity model (e.g., a peptide-protein
 * docking run or a learned binding predictor).
 */
const bindingAffinityTool: AgentTool = {
  name: "binding-affinity",
  description:
    "Predict candidate-target binding affinity via docking or a learned scorer. Stub: no backend configured.",
  invoke: async (input) => {
    const startedAt = Date.now();
    void input;
    return stubResult(
      "binding-affinity",
      "No binding model configured — wire a docking or affinity backend here.",
      startedAt
    );
  },
};

/**
 * Structure-fold stub: predict the folded structure and disulfide
 * connectivity (e.g., ESMFold/AlphaFold-style inference or a
 * disulfide-pairing model) to confirm the designed topology.
 */
const structureFoldTool: AgentTool = {
  name: "structure-fold",
  description:
    "Predict folded structure and disulfide connectivity. Stub: no backend configured.",
  invoke: async (input) => {
    const startedAt = Date.now();
    void input;
    return stubResult(
      "structure-fold",
      "No folding model configured — wire a structure backend here.",
      startedAt
    );
  },
};

/**
 * Off-target panel stub: screen the candidate against a human protein
 * panel (sequence or structure similarity) for promiscuity flags beyond
 * the blinded specificity review.
 */
const offTargetPanelTool: AgentTool = {
  name: "off-target-panel",
  description:
    "Screen the candidate against a human protein panel. Stub: no backend configured.",
  invoke: async (input) => {
    const startedAt = Date.now();
    void input;
    return stubResult(
      "off-target-panel",
      "No panel backend configured — wire an off-target screening service here.",
      startedAt
    );
  },
};

/**
 * Roadmap tools: wet-lab feedback, potency prediction, and the gut
 * safety panel, built from the shared roadmap registry so the API
 * detail and the web app's "Future functionality" cards can never
 * disagree about what each capability will do.
 */
const roadmapTools: AgentTool[] = ROADMAP_STUBS.map((stub) => ({
  name: stub.id,
  description: `${stub.title}: ${stub.summary} Stub: no backend configured.`,
  invoke: async (input) => {
    const startedAt = Date.now();
    void input;
    return stubResult(stub.id, `${stub.how} Stub: no backend configured.`, startedAt);
  },
}));

/** Tool registry, in run order. Append new tools here. */
export const AGENT_TOOLS: AgentTool[] = [
  bindingAffinityTool,
  structureFoldTool,
  offTargetPanelTool,
  ...roadmapTools,
];

export function agentToolNames(): string[] {
  return AGENT_TOOLS.map((tool) => tool.name);
}

/**
 * Runs every registered tool against an accepted candidate. Never
 * throws and never blocks acceptance: tool failures are reported as
 * `error` results alongside the verdict.
 */
export async function runAgentTools(
  input: AgentToolInput
): Promise<AgentToolResult[]> {
  const results: AgentToolResult[] = [];
  for (const tool of AGENT_TOOLS) {
    const startedAt = Date.now();
    try {
      results.push(await tool.invoke(input));
    } catch (error) {
      results.push({
        tool: tool.name,
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
        latency_ms: Date.now() - startedAt,
      });
    }
  }
  return results;
}
