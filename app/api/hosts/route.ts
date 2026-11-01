import { NextResponse } from "next/server";
import { HOSTS, specForHost } from "../../../lib/hosts";
import { providersForHost } from "../../../lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public capability listing: the LBP chassis the handoff compiler
 * serves, with secretion systems, containment layers, codon basis,
 * and the order-and-build partners relevant to each host. Static
 * reference data — no authentication required.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: true,
      data: HOSTS.map((host) => {
        const spec = specForHost(host);
        return {
          host: spec.id,
          name: spec.name,
          short_name: spec.shortName,
          strain: spec.strain,
          kind: spec.kind,
          delivery: spec.delivery,
          colonization: spec.colonization,
          colonization_note: spec.colonizationNote,
          secretion_system: spec.secretion.system,
          leader: spec.secretion.leaderName,
          leader_evidence: spec.secretion.leaderEvidence,
          leader_note: spec.secretion.note,
          folding: spec.folding,
          proteases: spec.proteases,
          auxotrophy: spec.containment.auxotrophy,
          kill_switches: spec.containment.killSwitches,
          integration: spec.containment.integration,
          plasmid: spec.plasmid,
          gc_min: spec.gcMin,
          gc_max: spec.gcMax,
          codon_basis: spec.codonBasis,
          codon_note: spec.codonNote,
          blurb: spec.blurb,
          providers: providersForHost(host).map((provider) => ({
            name: provider.name,
            url: provider.url,
            kind: provider.kind,
            relevance: provider.relevance,
          })),
        };
      }),
    },
    { status: 200 }
  );
}
