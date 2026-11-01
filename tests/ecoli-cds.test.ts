import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ECOLI_CODON_TABLE,
  ECOLI_RARE_CODONS,
  findRestrictionSite,
  optimizeForEcoli,
  translateCds,
} from "../lib/codon-optimizer";

const PEPTIDE = "GCKQVLKACRRWVGAC";

test("optimizeForEcoli emits in-frame DNA that translates back", async () => {
  const result = optimizeForEcoli(PEPTIDE);
  assert.equal(result.dna.length, PEPTIDE.length * 3);
  assert.equal(translateCds(result.dna), PEPTIDE);
});

test("E. coli table leads with the most frequent K-12 codons", async () => {
  // Kazusa E. coli K-12 usage: CTG (Leu), CGC (Arg), GCG (Ala),
  // GAA (Glu) are each the most frequent synonym.
  assert.equal(ECOLI_CODON_TABLE["L"]?.[0], "CTG");
  assert.equal(ECOLI_CODON_TABLE["R"]?.[0], "CGC");
  assert.equal(ECOLI_CODON_TABLE["A"]?.[0], "GCG");
  assert.equal(ECOLI_CODON_TABLE["E"]?.[0], "GAA");
});

test("optimizeForEcoli avoids rare codons on a realistic peptide", async () => {
  const result = optimizeForEcoli(PEPTIDE);
  const codons: string[] = [];
  for (let i = 0; i < result.dna.length; i += 3) {
    codons.push(result.dna.slice(i, i + 3));
  }
  assert.ok(
    codons.every((codon) => !ECOLI_RARE_CODONS.has(codon)),
    `rare codon in ${result.dna}`
  );
});

test("optimizeForEcoli silences cloning sites and reports fit", async () => {
  const result = optimizeForEcoli(PEPTIDE);
  assert.equal(findRestrictionSite(result.dna), null);
  assert.ok(result.gcOk);
  assert.ok(result.gcContent >= 0.45 && result.gcContent <= 0.6);
  assert.ok(result.cai > 0.85);
});

test("optimizeForEcoli rejects empty and non-canonical input", async () => {
  assert.throws(() => optimizeForEcoli(""), /empty protein sequence/);
  assert.throws(() => optimizeForEcoli("ACDX"), /unsupported residue 'X'/);
});
