import type { HostId } from "./hosts";

/**
 * Order-and-build partner directory for the lab handoff: DNA synthesis
 * vendors that print the fragment, and CRO/CDMO partners with
 * microbial-engineering and live-biotherapeutic experience that take it
 * from DNA to dosed strain. Every URL below was verified to exist;
 * relevance tags route each host to the right partners.
 */

export type ProviderKind = "synthesis" | "cro-cdmo";

export interface Provider {
  name: string;
  url: string;
  kind: ProviderKind;
  /** One line on why this partner fits an LBP peptide build. */
  relevance: string;
  /** Hosts this partner is most relevant for (`all` implicit). */
  hosts: HostId[] | "all";
}

export const PROVIDERS: Provider[] = [
  {
    name: "Twist Bioscience",
    url: "https://www.twistbioscience.com",
    kind: "synthesis",
    relevance:
      "High-throughput gene fragments and clonal genes; free codon optimization for the destination host.",
    hosts: "all",
  },
  {
    name: "IDT (Integrated DNA Technologies)",
    url: "https://www.idtdna.com",
    kind: "synthesis",
    relevance:
      "gBlocks gene fragments purpose-built for Gibson/Golden Gate assembly into expression vectors.",
    hosts: "all",
  },
  {
    name: "GenScript",
    url: "https://www.genscript.com",
    kind: "synthesis",
    relevance:
      "Gene synthesis plus peptide-synthesis backup: order the DNA and a reference-standard peptide in one place.",
    hosts: "all",
  },
  {
    name: "Thermo Fisher Scientific (GeneArt)",
    url: "https://www.thermofisher.com",
    kind: "synthesis",
    relevance:
      "GeneArt gene synthesis with microbial expression vector options for bacterial hosts.",
    hosts: ["ecoli-nissle", "lactococcus-lactis", "bacillus-subtilis"],
  },
  {
    name: "Azenta (GENEWIZ)",
    url: "https://www.azenta.com",
    kind: "synthesis",
    relevance:
      "Gene synthesis plus Sanger and NGS verification for sequence-confirmed constructs.",
    hosts: "all",
  },
  {
    name: "Eurofins Genomics",
    url: "https://www.eurofinsgenomics.com",
    kind: "synthesis",
    relevance:
      "Gene synthesis and oligonucleotides from EU and US labs.",
    hosts: "all",
  },
  {
    name: "Camena Bioscience",
    url: "https://www.camenabio.com",
    kind: "synthesis",
    relevance:
      "Enzymatic gene synthesis for long, complex constructs.",
    hosts: "all",
  },
  {
    name: "Ginkgo Bioworks",
    url: "https://www.ginkgo.bio",
    kind: "cro-cdmo",
    relevance:
      "Foundry strain engineering, including Saccharomyces yeast chassis development.",
    hosts: "all",
  },
  {
    name: "Lallemand Health Solutions",
    url: "https://lallemand-health-solutions.com",
    kind: "cro-cdmo",
    relevance:
      "Probiotic yeast manufacturer producing Saccharomyces boulardii under GMP.",
    hosts: ["sboulardii"],
  },
  {
    name: "List Labs",
    url: "https://listlabs.com",
    kind: "cro-cdmo",
    relevance:
      "Microbial CDMO with cGMP live biotherapeutic manufacturing for early clinical supply.",
    hosts: "all",
  },
  {
    name: "Biose Industrie",
    url: "https://www.biose.com",
    kind: "cro-cdmo",
    relevance:
      "LBP-specialized CDMO: live-biotherapeutic process development through GMP drug product.",
    hosts: "all",
  },
  {
    name: "Wacker Biotech",
    url: "https://www.wacker.com/biologics",
    kind: "cro-cdmo",
    relevance:
      "The microbial CDMO: fermentation, live microbial products, and E. coli secretion platforms (ESETEC).",
    hosts: ["ecoli-nissle", "lactococcus-lactis", "bacillus-subtilis"],
  },
  {
    name: "Lonza",
    url: "https://www.lonza.com",
    kind: "cro-cdmo",
    relevance:
      "Microbial development and manufacturing at scale, including oral dosage forms and capsules.",
    hosts: "all",
  },
  {
    name: "Cytovance Biologics",
    url: "https://www.cytovance.com",
    kind: "cro-cdmo",
    relevance:
      "Microbial and mammalian CDMO for strain engineering, process development, and cGMP manufacturing.",
    hosts: ["sboulardii", "ecoli-nissle"],
  },
  {
    name: "ReciBioPharm (Recipharm)",
    url: "https://www.recibiopharm.com",
    kind: "cro-cdmo",
    relevance:
      "Live-microbial biopharma development and manufacture, from preclinical strains to commercial supply.",
    hosts: "all",
  },
];

/** Partners of one kind, alphabetical. Powers the full directory. */
export function providersByKind(kind: ProviderKind): Provider[] {
  return PROVIDERS.filter((provider) => provider.kind === kind).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/** Partners relevant to one host, synthesis vendors first. */
export function providersForHost(host: HostId): Provider[] {
  const matches = PROVIDERS.filter(
    (provider) => provider.hosts === "all" || provider.hosts.includes(host)
  );
  return matches.sort((a, b) => {
    if (a.kind === b.kind) return a.name.localeCompare(b.name);
    return a.kind === "synthesis" ? -1 : 1;
  });
}
