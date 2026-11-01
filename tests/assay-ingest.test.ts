import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ASSAY_TEMPLATE_VERSION,
  ASSAY_TEMPLATES,
  ASSAY_TYPES,
  looksLikeFasta,
  parseAssayCsv,
  parseFasta,
  templateCsv,
} from "../lib/assay-ingest";

test("every assay template renders header plus example row", () => {
  assert.deepEqual(ASSAY_TYPES, [
    "mic",
    "cytotoxicity",
    "expression_titer",
    "sequence_verification",
  ]);
  for (const assay of ASSAY_TYPES) {
    const template = ASSAY_TEMPLATES[assay];
    assert.equal(template.version, ASSAY_TEMPLATE_VERSION);
    const csv = templateCsv(assay);
    const [header, example] = csv.trim().split("\n");
    assert.equal(header, template.columns.join(","));
    assert.equal(example?.split(",").length, template.columns.length);
  }
});

test("template CSVs parse back strictly", () => {
  for (const assay of ASSAY_TYPES) {
    const parsed = parseAssayCsv(assay, templateCsv(assay));
    assert.equal(parsed.ok, true, assay);
    assert.equal(parsed.sniffed, false);
    assert.equal(parsed.measurements.length, 1);
  }
});

test("parser reports missing cells and unknown headers", () => {
  const missing = parseAssayCsv(
    "mic",
    "strain,mic_ug_ml,method,replicate\nC. difficile,,broth,1\n"
  );
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => error.includes("mic_ug_ml")));

  const unknown = parseAssayCsv("mic", "a,b,c\n1,2,3\n");
  assert.equal(unknown.ok, false);
  assert.ok(
    unknown.errors.some((error) => error.includes("strain, mic_ug_ml"))
  );

  const empty = parseAssayCsv("mic", "strain,mic_ug_ml,method,replicate\n");
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.some((error) => error.includes("No data rows")));
});

test("sniffer maps raw instrument headers", () => {
  const parsed = parseAssayCsv(
    "mic",
    "Organism,MIC (ug/mL),Protocol,Rep\nC. difficile,8,broth microdilution,1\n"
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sniffed, true);
  assert.equal(parsed.measurements[0]?.fields["mic_ug_ml"], "8");
  assert.equal(
    parsed.measurements[0]?.fields["strain"],
    "C. difficile"
  );
});

test("FASTA parses entries and rejects digits and blanks", () => {
  const good = parseFasta(">pCP-001 read 1\nACGTacgt\nTGCA\n>read2\nAAAA\n");
  assert.equal(good.ok, true);
  assert.equal(good.sequences.length, 2);
  assert.equal(good.sequences[0]?.sequence, "ACGTACGTTGCA");

  const digits = parseFasta(">r1\nACGT123\n");
  assert.equal(digits.ok, false);

  const blanks = parseFasta(">r1\nACGT\n\nTGCA\n");
  assert.equal(blanks.ok, false);

  const none = parseFasta("ACGT\n");
  assert.equal(none.ok, false);

  assert.equal(looksLikeFasta("\n>abc\nACGT"), true);
  assert.equal(looksLikeFasta("strain,mic\n"), false);
});
