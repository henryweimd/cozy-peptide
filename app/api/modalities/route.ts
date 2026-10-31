import { NextResponse } from "next/server";
import { MODALITIES, specForModality } from "../../../lib/modality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public capability listing: the design modalities the compiler serves,
 * with length windows, cysteine rules, and hydropathy windows. Static
 * reference data — no authentication required.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: true,
      data: MODALITIES.map((modality) => {
        const spec = specForModality(modality);
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
        };
      }),
    },
    { status: 200 }
  );
}
