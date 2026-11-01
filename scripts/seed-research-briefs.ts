/**
 * Seeds the stored literature-brief library: runs the full research
 * stage (PubMed + Europe PMC retrieval, Muse Spark synthesis) once
 * per preset objective and upserts `research_briefs` rows, so runs
 * reuse converged briefs instantly and reports stay rich.
 *
 * Usage: npm run seed:briefs
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or ANON) plus
 * META_API_KEY, from the environment or .env.local.
 *
 * Exit code is 1 when any preset fails to converge or store, so a
 * rerun after an outage (or an API unblock) completes the library.
 * Evidence-only rows still store: the next live run synthesizes
 * fresh over the stored papers and upgrades the row.
 */

import { readFileSync } from "node:fs";
import { DEMO_PRESETS } from "../lib/demo-config";
import {
  researchCacheKey,
  runResearchBrief,
} from "../lib/research/brief";
import { saveStoredBrief } from "../lib/research/brief-store";
import { DEFAULT_MODEL } from "../lib/spark-config";

const SEED_BUDGET_MS = 60000;

function loadDotEnvLocal(): void {
  let text: string;
  try {
    text = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at < 0) continue;
    const name = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    if (
      value.length >= 2 &&
      value.startsWith('"') &&
      value.endsWith('"')
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

async function main(): Promise<number> {
  loadDotEnvLocal();
  if (
    process.env.SUPABASE_URL === undefined ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY === undefined &&
      process.env.SUPABASE_ANON_KEY === undefined)
  ) {
    console.error("seed:briefs: Supabase env (URL + key) is not configured.");
    return 1;
  }
  let failures = 0;
  for (const preset of DEMO_PRESETS) {
    console.log(`\n=== ${preset.id}: ${preset.target} ===`);
    const provenance = await runResearchBrief(preset.target, undefined, {
      budgetMs: SEED_BUDGET_MS,
      forceFresh: true,
      onEvent: (event) => console.log(`  [${event.stage}] ${event.message}`),
    });
    const stored = await saveStoredBrief(researchCacheKey(preset.target), {
      targetDisplay: preset.target,
      status: provenance.status,
      brief: provenance.brief ?? null,
      evidence: provenance.evidence ?? [],
      model: DEFAULT_MODEL,
    });
    console.log(
      `  -> status=${provenance.status} evidence=${provenance.evidenceCount} ` +
        `brief=${provenance.brief !== undefined ? "yes" : "no"} ` +
        `stored=${stored.saved ? "yes" : `NO (${stored.error ?? "unknown"})`}`
    );
    if (provenance.status !== "ok" || !stored.saved) failures += 1;
  }
  console.log(
    `\nseed:briefs: ${DEMO_PRESETS.length - failures}/${DEMO_PRESETS.length} presets converged and stored.`
  );
  return failures > 0 ? 1 : 0;
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(
      `seed:briefs: fatal: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
);
