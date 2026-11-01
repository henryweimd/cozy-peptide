import { test } from "node:test";
import assert from "node:assert/strict";

import type { StoredCitation } from "../lib/db/citations";
import type { ResearchBrief } from "../lib/research/brief";
import {
  buildReport,
  parseCachedEnvelope,
  referencesFromBrief,
  referencesFromCitations,
  synthesizeNarrative,
  urlForCiteRef,
} from "../lib/research/report";
import { reportToDocx } from "../lib/research/report-docx";
import { asResearchBrief, parseReportRequest } from "../lib/research/report-request";

function stubBrief(): ResearchBrief {
  return {
    targets: [{ name: "TcdB receptor", rationale: "Blocks toxin entry." }],
    mechanisms: [{ name: "competitive inhibition", rationale: "Decoy." }],
    avoid: [{ name: "TLR4 agonism", rationale: "Inflammation risk." }],
    citations: [
      { ref: "pubmed:12345", note: "Toxin study" },
      { ref: "pubmed:12345", note: "Toxin study" },
      { ref: "europepmc:MED:67890", note: "PMC study" },
    ],
    evidenceCount: 3,
  };
}

function stubCitations(): StoredCitation[] {
  return [
    {
      source: "pubmed",
      externalId: "12345",
      title: "A gut peptide study",
      snippet: "Findings about colonization resistance.",
      url: "https://pubmed.ncbi.nlm.nih.gov/12345/",
      year: "2024",
    },
    {
      source: "europepmc",
      externalId: "MED:67890",
      title: "",
      snippet: "PMC findings.",
      url: "",
      year: null,
    },
  ];
}

test("urlForCiteRef rebuilds canonical article URLs", () => {
  assert.equal(
    urlForCiteRef("pubmed:12345"),
    "https://pubmed.ncbi.nlm.nih.gov/12345/"
  );
  assert.equal(
    urlForCiteRef("europepmc:MED:67890"),
    "https://europepmc.org/article/MED/67890"
  );
  assert.equal(urlForCiteRef("unknown:1"), "");
});

test("referencesFromCitations numbers rows with title/URL fallbacks", () => {
  const references = referencesFromCitations(stubCitations());
  assert.equal(references.length, 2);
  assert.equal(references[0]?.n, 1);
  assert.equal(references[0]?.title, "A gut peptide study");
  assert.equal(references[1]?.n, 2);
  assert.equal(references[1]?.title, "europepmc:MED:67890");
  assert.equal(
    references[1]?.url,
    "https://europepmc.org/article/MED/67890"
  );
});

test("referencesFromBrief dedupes legacy cite refs", () => {
  const references = referencesFromBrief(stubBrief());
  assert.equal(references.length, 2);
  assert.equal(
    references[0]?.url,
    "https://pubmed.ncbi.nlm.nih.gov/12345/"
  );
  assert.deepEqual(referencesFromBrief(null), []);
});

test("synthesizeNarrative accepts valid JSON and clamps cite lists", async () => {
  const { narrative, fallback } = await synthesizeNarrative(
    "C. difficile",
    stubBrief(),
    referencesFromCitations(stubCitations()),
    ["Findings about colonization resistance.", "PMC findings."],
    {
      model: "test-model",
      synthesizeImpl: (async () =>
        JSON.stringify({
          background: "Background here.",
          rationale: "Rationale here.",
          targets: [
            { name: "TcdB receptor", note: "Blocks entry.", cites: [1, 99] },
          ],
          safety: "Avoid TLR4.",
          limitations: "Preclinical only.",
        })),
    }
  );
  assert.equal(fallback, false);
  assert.equal(narrative.background, "Background here.");
  assert.deepEqual(narrative.targets[0]?.cites, [1, 99]);
});

test("synthesizeNarrative falls back to brief lines on garbage", async () => {
  const { narrative, fallback } = await synthesizeNarrative(
    "C. difficile",
    stubBrief(),
    referencesFromBrief(stubBrief()),
    [],
    { synthesizeImpl: (async () => "not json at all") }
  );
  assert.equal(fallback, true);
  assert.match(narrative.background, /C\. difficile/);
  assert.match(narrative.rationale, /competitive inhibition/);
  assert.match(narrative.safety, /TLR4 agonism/);
  assert.equal(narrative.targets.length, 1);
});

test("buildReport serves a valid cached envelope without synthesis", async () => {
  let called = false;
  const envelope = {
    model: "cached-model",
    at: "2026-10-30T00:00:00.000Z",
    narrative: {
      background: "Cached background.",
      rationale: "Cached rationale.",
      targets: [{ name: "TcdB", note: "Note.", cites: [1, 42] }],
      safety: "Cached safety.",
      limitations: "Cached limits.",
    },
  };
  const { report, fresh } = await buildReport({
    target: "C. difficile",
    brief: stubBrief(),
    citations: stubCitations(),
    snippets: ["a", "b"],
    envelope,
    options: {
      synthesizeImpl: (async () => {
        called = true;
        return null;
      }),
    },
  });
  assert.equal(called, false);
  assert.equal(fresh, null);
  assert.equal(report.cached, true);
  assert.equal(report.fallback, false);
  assert.equal(report.model, "cached-model");
  assert.equal(report.references.length, 2);
  assert.deepEqual(report.narrative.targets[0]?.cites, [1]);
});

test("buildReport synthesizes fresh and returns a cacheable envelope", async () => {
  const { report, fresh } = await buildReport({
    target: "C. difficile",
    brief: stubBrief(),
    citations: stubCitations(),
    snippets: ["a", "b"],
    envelope: { bogus: true },
    options: {
      synthesizeImpl: (async () =>
        JSON.stringify({
          background: "Fresh background.",
          rationale: "Fresh rationale.",
          targets: [],
          safety: "",
          limitations: "",
        })),
    },
  });
  assert.equal(report.cached, false);
  assert.equal(report.fallback, false);
  assert.ok(fresh !== null);
  assert.equal(fresh?.narrative.background, "Fresh background.");
});

test("buildReport fallback carries no cacheable envelope", async () => {
  const { report, fresh } = await buildReport({
    target: "C. difficile",
    brief: stubBrief(),
    citations: [],
    snippets: [],
    options: { synthesizeImpl: (async () => null) },
  });
  assert.equal(report.fallback, true);
  assert.equal(fresh, null);
  assert.equal(report.references.length, 2);
});

test("parseCachedEnvelope validates shape strictly", () => {
  assert.equal(parseCachedEnvelope(null), null);
  assert.equal(parseCachedEnvelope({ model: "m", at: "a" }), null);
  const envelope = parseCachedEnvelope({
    model: "m",
    at: "a",
    narrative: { background: "b", rationale: "r" },
  });
  assert.ok(envelope !== null);
});

test("parseReportRequest accepts run and inline shapes", () => {
  const run = parseReportRequest({ runId: "abc" });
  assert.deepEqual(run, { mode: "run", runId: "abc" });

  const inline = parseReportRequest({
    target: "C. difficile",
    brief: stubBrief(),
    evidence: [
      {
        source: "pubmed",
        id: "12345",
        title: "t",
        snippet: "s",
        url: "u",
        year: "2024",
      },
    ],
  });
  assert.ok(!("error" in inline) && inline.mode === "inline");
  if (!("error" in inline)) {
    assert.equal(inline.citations.length, 1);
    assert.equal(inline.citations[0]?.externalId, "12345");
  }

  assert.ok("error" in parseReportRequest(null));
  assert.ok("error" in parseReportRequest({}));
  assert.ok("error" in parseReportRequest({ target: "x" }));
  assert.ok(
    "error" in parseReportRequest({ target: "x", brief: { bad: true } })
  );
});

test("asResearchBrief sanitizes brief payloads", () => {
  assert.equal(asResearchBrief(null), null);
  assert.equal(asResearchBrief({ targets: [] }), null);
  const brief = asResearchBrief(stubBrief());
  assert.ok(brief !== null);
  assert.equal(brief?.targets.length, 1);
  assert.equal(brief?.citations.length, 3);
});

test("reportToDocx emits a zip-packaged document", async () => {
  const { report } = await buildReport({
    target: "C. difficile",
    brief: stubBrief(),
    citations: stubCitations(),
    snippets: ["a", "b"],
    options: {
      synthesizeImpl: (async () =>
        JSON.stringify({
          background: "b",
          rationale: "r",
          targets: [{ name: "T", note: "n", cites: [1] }],
          safety: "s",
          limitations: "l",
        })),
    },
  });
  const buffer = await reportToDocx(report);
  assert.ok(buffer.length > 1000);
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
});

test("fallback narrative grounds itself in retrieved evidence", async () => {
  const { report } = await buildReport({
    target: "bile acid diarrhea",
    brief: null,
    citations: stubCitations(),
    snippets: ["Findings about colonization resistance.", "PMC findings."],
    options: { synthesizeImpl: async () => null },
  });
  assert.equal(report.fallback, true);
  assert.ok(
    report.narrative.rationale.includes("A gut peptide study"),
    "rationale should name retrieved papers"
  );
  assert.ok(
    report.narrative.rationale.includes("colonization resistance"),
    "rationale should carry finding snippets"
  );
  assert.ok(
    report.narrative.background.includes("2 retrieved"),
    "background should count the evidence"
  );
});
