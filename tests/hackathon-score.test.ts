import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

interface SignalReport {
  id: string;
  max: number;
  earned: number;
}

interface PillarReport {
  id: string;
  cap: number;
  raw: number;
  score: number;
  signals: SignalReport[];
}

interface ScoreReport {
  total: number;
  pillars: PillarReport[];
}

test("hackathon scorer emits a valid capped 4-pillar report", () => {
  const scorer = path.resolve("scripts/hackathon-score.mjs");
  const raw = execFileSync("node", [scorer, "--json", "--no-network"], {
    encoding: "utf8",
    timeout: 60000,
  });
  const report = JSON.parse(raw) as ScoreReport;
  assert.equal(report.pillars.length, 4);
  for (const pillar of report.pillars) {
    assert.ok(
      pillar.score <= pillar.cap + 1e-9,
      `${pillar.id} exceeds its cap`
    );
    assert.ok(pillar.raw + 1e-9 >= pillar.score, `${pillar.id} raw < score`);
    for (const signal of pillar.signals) {
      assert.ok(
        signal.earned <= signal.max + 1e-9,
        `${signal.id} exceeds its max`
      );
      assert.ok(signal.earned >= 0, `${signal.id} is negative`);
    }
  }
  assert.ok(report.total <= 10 + 1e-9, "total exceeds 10");
  assert.ok(report.total >= 0, "total is negative");
});
