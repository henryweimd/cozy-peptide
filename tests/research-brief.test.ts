import { test } from "node:test";
import assert from "node:assert/strict";

import {
  searchEuropePmc,
  searchPubMed,
  type FetchImpl,
} from "../lib/research/evidence";
import {
  buildResearchSynthesisPrompt,
  clearResearchCache,
  parseResearchSynthesis,
  runResearchBrief,
  screenEvidenceSafety,
} from "../lib/research/brief";
import {
  renderResearchBrief,
  withResearchBrief,
  buildSteeringBrief,
} from "../lib/prompt-steering";
import { generateVerifiedPeptide, type PipelineEvent } from "../lib/meta-spark";
import type { EvidenceItem } from "../lib/research/evidence";

const TARGET = "Clostridioides difficile colonization in the gut";

function stubFetch(handler: (url: string) => unknown): FetchImpl {
  return async (input: string | URL | Request) => ({
    ok: true,
    status: 200,
    json: async () => handler(String(input)),
  });
}

const PUBMED_HANDLER = (url: string): unknown => {
  if (url.includes("esearch.fcgi")) {
    return { esearchresult: { idlist: ["111", "222"], count: "2" } };
  }
  return {
    result: {
      uids: ["111", "222"],
      "111": {
        title: "TcdA receptor-binding domain engages colonic epithelium",
        source: "Nature",
        pubdate: "2024 Jan",
      },
      "222": {
        title: "SlpA adhesin mediates C. difficile colonization",
        source: "Cell Host Microbe",
        pubdate: "2023 May",
      },
    },
  };
};

const EUROPEPMC_HANDLER = (): unknown => ({
  resultList: {
    result: [
      {
        id: "7654321",
        source: "MED",
        title: "Cationic peptides disrupt C. difficile membranes",
        abstractText:
          "Short cationic peptides permeabilize vegetative cell membranes while sparing commensals.",
        pubYear: "2023",
      },
    ],
  },
});

const LITERATURE_HANDLER = (url: string): unknown =>
  url.includes("eutils.ncbi.nlm.nih.gov")
    ? PUBMED_HANDLER(url)
    : EUROPEPMC_HANDLER();

const SYNTHESIS_OK = [
  "TARGET: TcdA receptor-binding domain — blocks toxin adhesion to colonocytes",
  "TARGET: SlpA adhesin — prevents vegetative cell colonization",
  "TARGET: Fimbrial tip protein — occludes surface glycan binding",
  "TARGET: Extra target beyond cap — should be dropped",
  "MECHANISM: Cationic membrane disruption — selective for anionic bacterial surfaces",
  "MECHANISM: Competitive adhesion blockade — occupies colonization factor tips",
  "MECHANISM: Extra mechanism beyond cap — should be dropped",
  "AVOID: hERG channel — cardiac repolarization risk",
  "AVOID: Extra avoid one — dropped",
  "AVOID: Extra avoid two — dropped",
  "AVOID: Extra avoid three — dropped",
  "AVOID: Extra avoid four — dropped",
  "AVOID: Extra avoid five beyond cap — dropped",
  "CITE: pubmed:111 — toxin adhesion study",
  "CITE: pubmed:222 — adhesin study",
  "CITE: europepmc:MED:7654321 — peptide membrane study",
].join("\n");

function shim(item: Partial<EvidenceItem> & { title: string }): EvidenceItem {
  return {
    source: "pubmed",
    id: "1",
    snippet: "",
    url: "https://example.invalid",
    ...item,
  };
}

test("searchPubMed parses esearch plus esummary into evidence", async () => {
  const result = await searchPubMed(TARGET, {
    fetchImpl: stubFetch(PUBMED_HANDLER),
  });
  assert.equal(result.error, undefined);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.id, "111");
  assert.ok((result.items[0]?.title ?? "").includes("TcdA"));
  assert.equal(
    result.items[0]?.url,
    "https://pubmed.ncbi.nlm.nih.gov/111/"
  );
  assert.equal(result.items[0]?.year, "2024");
});

test("searchEuropePmc parses the result list into evidence", async () => {
  const result = await searchEuropePmc(TARGET, {
    fetchImpl: stubFetch(EUROPEPMC_HANDLER),
  });
  assert.equal(result.error, undefined);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.id, "MED:7654321");
  assert.ok((result.items[0]?.snippet ?? "").includes("permeabilize"));
});

test("retrieval never throws on transport failure", async () => {
  const failing: FetchImpl = async () => {
    throw new Error("boom");
  };
  const pubmed = await searchPubMed(TARGET, { fetchImpl: failing });
  const europepmc = await searchEuropePmc(TARGET, { fetchImpl: failing });
  assert.equal(pubmed.items.length, 0);
  assert.ok((pubmed.error ?? "").length > 0);
  assert.equal(europepmc.items.length, 0);
  assert.ok((europepmc.error ?? "").length > 0);
});

test("retrieval tolerates malformed payloads", async () => {
  const weird = stubFetch(() => ({ unexpected: true }));
  const pubmed = await searchPubMed(TARGET, { fetchImpl: weird });
  const europepmc = await searchEuropePmc(TARGET, { fetchImpl: weird });
  assert.equal(pubmed.items.length, 0);
  assert.equal(europepmc.items.length, 0);
  assert.ok((europepmc.error ?? "").length > 0);
});

test("research stage converges evidence into a capped brief", async () => {
  clearResearchCache();
  try {
    const events: PipelineEvent[] = [];
    const provenance = await runResearchBrief(TARGET, undefined, {
      fetchImpl: stubFetch(LITERATURE_HANDLER),
      synthesizeImpl: async () => SYNTHESIS_OK,
      onEvent: (event) => events.push(event),
    });
    assert.equal(provenance.status, "ok");
    assert.equal(provenance.evidenceCount, 3);
    assert.equal(provenance.cached, false);
    assert.equal(provenance.sources.length, 2);
    const brief = provenance.brief;
    assert.ok(brief !== undefined);
    assert.equal(brief.targets.length, 3);
    assert.equal(brief.mechanisms.length, 2);
    assert.equal(brief.avoid.length, 4);
    assert.equal(brief.citations.length, 3);
    assert.ok(brief.targets[0]?.name.includes("TcdA"));
    assert.ok(events.some((event) => event.stage === "research"));
    assert.ok(
      events.some((event) => event.message.includes("converged")),
      "expected a convergence event"
    );
  } finally {
    clearResearchCache();
  }
});

test("research stage falls back when retrieval is empty", async () => {
  clearResearchCache();
  try {
    const empty = stubFetch((url: string) =>
      url.includes("eutils.ncbi.nlm.nih.gov")
        ? { esearchresult: { idlist: [] } }
        : { resultList: { result: [] } }
    );
    const provenance = await runResearchBrief(TARGET, undefined, {
      fetchImpl: empty,
      synthesizeImpl: async () => SYNTHESIS_OK,
    });
    assert.equal(provenance.status, "fallback");
    assert.equal(provenance.brief, undefined);
    assert.ok((provenance.reason ?? "").includes("No literature evidence"));
  } finally {
    clearResearchCache();
  }
});

test("research stage falls back on unparseable synthesis", async () => {
  clearResearchCache();
  try {
    const provenance = await runResearchBrief(TARGET, undefined, {
      fetchImpl: stubFetch(LITERATURE_HANDLER),
      synthesizeImpl: async () => "some freeform prose without any lines",
    });
    assert.equal(provenance.status, "fallback");
    assert.equal(provenance.brief, undefined);
    assert.equal(provenance.evidenceCount, 3);
  } finally {
    clearResearchCache();
  }
});

test("research stage falls back fast on transport failure", async () => {
  clearResearchCache();
  try {
    const failing: FetchImpl = async () => {
      throw new Error("boom");
    };
    const startedAt = Date.now();
    const provenance = await runResearchBrief(TARGET, undefined, {
      budgetMs: 5000,
      fetchImpl: failing,
      synthesizeImpl: async () => SYNTHESIS_OK,
    });
    assert.equal(provenance.status, "fallback");
    assert.ok(Date.now() - startedAt < 5000);
    assert.ok(
      provenance.sources.every(
        (source) => (source.error ?? "").length > 0
      )
    );
  } finally {
    clearResearchCache();
  }
});

test("research cache reuses briefs without refetching", async () => {
  clearResearchCache();
  try {
    let calls = 0;
    const counting = stubFetch((url: string) => {
      calls += 1;
      return LITERATURE_HANDLER(url);
    });
    const first = await runResearchBrief(TARGET, undefined, {
      fetchImpl: counting,
      synthesizeImpl: async () => SYNTHESIS_OK,
    });
    assert.equal(first.status, "ok");
    assert.equal(first.cached, false);
    const callsAfterFirst = calls;
    assert.ok(callsAfterFirst > 0);
    const second = await runResearchBrief(TARGET, undefined, {
      fetchImpl: counting,
      synthesizeImpl: async () => {
        throw new Error("must not synthesize on cache hit");
      },
    });
    assert.equal(second.status, "ok");
    assert.equal(second.cached, true);
    assert.equal(calls, callsAfterFirst);
    assert.deepEqual(second.brief, first.brief);
  } finally {
    clearResearchCache();
  }
});

test("synthesis parser returns null without targets or mechanisms", () => {
  assert.equal(parseResearchSynthesis("nothing here", 2), null);
  const avoidsOnly = parseResearchSynthesis("AVOID: hERG — risk", 1);
  assert.equal(avoidsOnly, null);
});

test("synthesis prompt stays free of hardcoded hazard examples", () => {
  const prompt = buildResearchSynthesisPrompt(
    TARGET,
    undefined,
    [
      shim({ title: "A paper", snippet: "A snippet" }),
    ],
    []
  );
  for (const term of ["herg", "ricin", "anthrax", "hemolysis"]) {
    assert.ok(
      !prompt.toLowerCase().includes(term),
      `prompt must not name ${term}`
    );
  }
  assert.ok(prompt.includes(TARGET));
});

test("safety screen flags high-risk and distant-site passages", () => {
  const flagged = screenEvidenceSafety([
    shim({ title: "hERG channel inhibition study", snippet: "cardiac risk" }),
  ]);
  assert.equal(flagged.length, 1);
  const clean = screenEvidenceSafety([
    shim({ title: "TcdA adhesion in the gut lumen", snippet: "colonization" }),
  ]);
  assert.equal(clean.length, 0);
});

test("enriched steering appends literature lines; null keeps static", () => {
  const { brief } = buildSteeringBrief(TARGET, undefined);
  const parsed = parseResearchSynthesis(SYNTHESIS_OK, 3);
  assert.ok(parsed !== null);
  const enriched = withResearchBrief(brief, parsed);
  assert.ok(enriched.startsWith(brief));
  assert.ok(enriched.includes("TcdA receptor-binding domain"));
  assert.ok(enriched.includes("pubmed:111"));
  assert.equal(withResearchBrief(brief, null), brief);
});

test("rendered brief is capped for prompt safety", () => {
  const parsed = parseResearchSynthesis(SYNTHESIS_OK, 3);
  assert.ok(parsed !== null);
  assert.ok(renderResearchBrief(parsed).length <= 1500);
});

test("generation skips research without a key and still passes", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  const result = await generateVerifiedPeptide(TARGET, 4, 1, undefined, {
    research: { enabled: true },
  });
  assert.equal(result.audit.passed, true);
  assert.equal(result.research.status, "skipped");
});

test("generation defaults research to disabled", async () => {
  delete process.env.META_API_KEY;
  delete process.env.META_SPARK_API_URL;
  const result = await generateVerifiedPeptide(TARGET, 4, 1);
  assert.equal(result.audit.passed, true);
  assert.equal(result.research.status, "disabled");
});
