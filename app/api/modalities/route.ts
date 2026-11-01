import { NextResponse } from "next/server";
import { MODALITIES, specForModality } from "../../../lib/modality";
import { DEFAULT_MODALITY_BY_CLASS } from "../../../lib/prompt-steering";
import type { TargetClass } from "../../../lib/prompt-steering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public capability listing: the design modalities the compiler serves,
 * with length windows, cysteine rules, hydropathy windows, and which
 * therapeutic objectives each scaffold is the Auto default for. Static
 * reference data — no authentication required.
 */
export async function GET(): Promise<NextResponse> {
  const autoFor = new Map<string, { classes: TargetClass[]; reason: string }>();
  for (const [targetClass, entry] of Object.entries(DEFAULT_MODALITY_BY_CLASS)) {
    const list = autoFor.get(entry.modality) ?? {
      classes: [],
      reason: entry.reason,
    };
    list.classes.push(targetClass as TargetClass);
    autoFor.set(entry.modality, list);
  }
  return NextResponse.json(
    {
      success: true,
      data: MODALITIES.map((modality) => {
        const spec = specForModality(modality);
        const auto = autoFor.get(modality);
        return {
          modality: spec.modality,
          noun: spec.noun,
          min_length: spec.minLength,
          max_length: spec.maxLength,
          cysteines: spec.cysteines,
          min_cys_spacing: spec.minCysSpacing,
          gravy_min: spec.gravyMin,
          gravy_max: spec.gravyMax,
          response_id: spec.responseId,
          topology_label: spec.topologyLabel,
          cyclic: spec.cyclic === true,
          ...(spec.momentMin !== undefined ? { moment_min: spec.momentMin } : {}),
          ...(auto !== undefined
            ? {
                auto_default_for: auto.classes,
                auto_default_reason: auto.reason,
              }
            : { auto_default_for: [] }),
        };
      }),
    },
    { status: 200 }
  );
}
