import { DEMO_PRESETS } from "./demo-config";
import { CUSTOM_TARGET_MAX_LENGTH } from "./target-guard";

/**
 * Designer deep-link params (client-safe, no secrets). Priority: a
 * ledger run first, then free text, then a preset id. Anything
 * unrecognized falls through to the idle designer with defaults.
 */
export interface DesignParams {
  runId?: string;
  custom?: string;
  presetId?: string;
}

export function parseDesignParams(params: {
  get: (key: string) => string | null;
}): DesignParams {
  const runId = params.get("run") ?? "";
  if (/^[0-9a-fA-F-]{36}$/.test(runId)) return { runId };
  const custom = (params.get("custom") ?? "")
    .trim()
    .slice(0, CUSTOM_TARGET_MAX_LENGTH);
  if (custom.length > 0) return { custom };
  const target = params.get("target") ?? "";
  if (DEMO_PRESETS.some((preset) => preset.id === target)) {
    return { presetId: target };
  }
  return {};
}
