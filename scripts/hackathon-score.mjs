#!/usr/bin/env node
/**
 * Self-scores this repo against an abstracted 4-pillar hackathon rubric:
 * Impact & Alignment 3.0 / Meta AI Tooling 2.5 / Technical Depth 2.0 /
 * Demo Completeness 2.5. Every signal is checked against real repo
 * evidence (files, code references, git history, live URLs); each pillar
 * caps at its max, so inapplicable signals need not all pass.
 *
 * This is a third-party competitiveness heuristic, not the official
 * judging rubric — treat the total as directional and the per-signal
 * evidence as the actionable part.
 *
 * Usage: node scripts/hackathon-score.mjs [--json] [--no-network]
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WINDOW_SINCE = "2026-10-27";
const WINDOW_UNTIL = "2026-11-05"; // exclusive: covers through Nov 4
const FETCH_TIMEOUT_MS = 8000;

const args = new Set(process.argv.slice(2));
const WANT_JSON = args.has("--json");
const NO_NETWORK = args.has("--no-network");

function readText(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

function fileBytes(rel) {
  try {
    return fs.statSync(path.join(ROOT, rel)).size;
  } catch {
    return 0;
  }
}

function exists(rel) {
  try {
    fs.accessSync(path.join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

function walkExt(dir, exts) {
  const out = [];
  const base = path.join(ROOT, dir);
  const skip = new Set(["node_modules", ".next", ".git"]);
  function walk(current) {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.some((ext) => entry.name.endsWith(ext))) {
        out.push(path.relative(ROOT, full));
      }
    }
  }
  walk(base);
  return out;
}

function git(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      cwd: ROOT,
      timeout: 10000,
    }).trim();
  } catch {
    return null;
  }
}

function fetchStatus(url, redirects = 3) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (!done) {
        done = true;
        resolve(value);
      }
    };
    try {
      const lib = url.startsWith("https:") ? https : http;
      const req = lib.get(
        url,
        {
          timeout: FETCH_TIMEOUT_MS,
          headers: { "user-agent": "cozy-peptide-hackathon-scorer" },
        },
        (res) => {
          res.resume();
          const location = res.headers.location;
          if (
            location !== undefined &&
            redirects > 0 &&
            (res.statusCode ?? 0) >= 300 &&
            (res.statusCode ?? 0) < 400
          ) {
            fetchStatus(new URL(location, url).toString(), redirects - 1).then(
              finish
            );
          } else {
            const status = res.statusCode ?? 0;
            finish({ ok: status >= 200 && status < 400, status, url });
          }
        }
      );
      req.on("timeout", () => {
        req.destroy();
        finish({ ok: false, status: 0, url, error: "timeout" });
      });
      req.on("error", (error) =>
        finish({ ok: false, status: 0, url, error: error.message })
      );
    } catch (error) {
      finish({ ok: false, status: 0, url, error: String(error) });
    }
  });
}

// ---- evidence context (computed once) ----
const readme = readText("README.md") ?? "";
const packageJson = (() => {
  try {
    return JSON.parse(readText("package.json") ?? "{}");
  } catch {
    return {};
  }
})();
const libFiles = walkExt("lib", [".ts"]).filter((f) => !f.endsWith(".test.ts"));
const appFiles = walkExt("app", [".ts", ".tsx"]).filter(
  (f) => !f.endsWith(".test.ts")
);
const testFiles = walkExt("tests", [".test.ts"]);
const libText = libFiles.map((f) => readText(f) ?? "").join("\n");
const appText = appFiles.map((f) => readText(f) ?? "").join("\n");
const docsBytes =
  fileBytes("README.md") +
  walkExt("docs", [".md"]).reduce((sum, f) => sum + fileBytes(f), 0);
const imageBytes = walkExt("public", [".png", ".jpg", ".jpeg", ".webp", ".svg"]).reduce(
  (sum, f) => sum + fileBytes(f),
  0
);
const moduleCount = libFiles.length + appFiles.length;
const windowLog = git([
  "log",
  `--since=${WINDOW_SINCE}`,
  `--until=${WINDOW_UNTIL}`,
  "--format=%H %s",
]);
const windowCommits =
  windowLog === null || windowLog === "" ? 0 : windowLog.split("\n").length;
const windowPrs =
  windowLog === null
    ? 0
    : windowLog.split("\n").filter((line) => /\(#\d+\)/.test(line)).length;
const gitOk = git(["rev-parse", "--is-inside-work-tree"]) === "true";

const videoMatch = (readme + "\n" + appText).match(
  /https?:\/\/(bit\.ly\/cozy-peptide-video|(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)[\w-]+)/
);
const videoUrl = videoMatch !== null ? videoMatch[0] : null;
const deployMatch = readme.match(/https:\/\/[a-z0-9-]+\.vercel\.app\/?/);
const deployUrl = deployMatch !== null ? deployMatch[0] : null;

const META_MODEL_FAMILIES = [
  [/muse spark|spark 1\.\d|meta.?spark/i, "spark"],
  [/llama/i, "llama"],
  [/segment anything|\bsam\b.?\d/i, "sam"],
  [/audioseal/i, "audioseal"],
  [/seamless/i, "seamless"],
];
const pipelineModels = META_MODEL_FAMILIES.filter(([re]) =>
  re.test(libText)
).map(([, name]) => name);

function scaled(count, threshold, max) {
  if (threshold <= 0) return max;
  return Math.min(max, (max * count) / threshold);
}

function r1(value) {
  return Math.round(value * 10) / 10;
}

// Each signal: id, label, max, advice, run() -> { earned, evidence }
const PILLARS = [
  {
    id: "impact",
    name: "Impact & Alignment",
    cap: 3.0,
    signals: [
      {
        id: "base-repo",
        label: "Base hackathon repo",
        max: 1.0,
        advice: "Name the hackathon in README.md so judges can place the entry.",
        run: () =>
          /hackathon/i.test(readme)
            ? { earned: 1.0, evidence: "README.md names the hackathon" }
            : { earned: 0, evidence: "no hackathon mention in README.md" },
      },
      {
        id: "track-push-frontier",
        label: "Track 2 (Push the Frontier)",
        max: 0.4,
        advice: "State the track ('Push the Frontier — accelerate a scientific experiment') in README or site copy.",
        run: () =>
          /push the frontier/i.test(readme + appText)
            ? { earned: 0.4, evidence: "'Push the Frontier' in README/site" }
            : { earned: 0, evidence: "track not stated in README/site" },
      },
      {
        id: "domain-framing",
        label: "High-impact domain: therapeutic framing",
        max: 0.3,
        advice: "Frame the problem as therapeutic impact (disease, patients, trials) in README.",
        run: () =>
          /therapeutic/i.test(readme)
            ? { earned: 0.3, evidence: "therapeutic framing in README" }
            : { earned: 0, evidence: "no therapeutic framing in README" },
      },
      {
        id: "safety-engineering",
        label: "High-impact domain: safety engineering",
        max: 0.3,
        advice: "Ship a visible safety section plus a server-side blocklist module.",
        run: () => {
          const section = appText.includes("responsible-use-meta-ai-tooling");
          const blocklist = exists("lib/biosecurity.ts");
          return section && blocklist
            ? { earned: 0.3, evidence: "safety section + lib/biosecurity.ts" }
            : { earned: 0, evidence: `section:${section} blocklist:${blocklist}` };
        },
      },
      {
        id: "eval-proof",
        label: "Eval & benchmark proof",
        max: 0.3,
        advice: "Add a refusal/eval test (e.g. tests/target-guard.test.ts) proving guardrails hold.",
        run: () =>
          exists("tests/target-guard.test.ts")
            ? { earned: 0.3, evidence: "tests/target-guard.test.ts" }
            : { earned: 0, evidence: "no refusal-eval test found" },
      },
      {
        id: "docker",
        label: "Docker packaging",
        max: 0.4,
        advice: "Add a multi-stage Dockerfile + .dockerignore with documented run commands.",
        run: () =>
          exists("Dockerfile")
            ? { earned: 0.4, evidence: "Dockerfile present" }
            : { earned: 0, evidence: "no Dockerfile" },
      },
      {
        id: "multi-module",
        label: "Multi-module scope",
        max: 0.2,
        advice: "Grow past 10 source modules across lib/ and app/.",
        run: () => ({
          earned: r1(scaled(moduleCount, 10, 0.2)),
          evidence: `${moduleCount} lib/app modules (needs >10)`,
        }),
      },
      {
        id: "module-docs",
        label: "Detailed module docs",
        max: 0.3,
        advice: "Document modules until markdown docs exceed 5 KB.",
        run: () => ({
          earned: r1(scaled(docsBytes, 5120, 0.3)),
          evidence: `${(docsBytes / 1024).toFixed(1)} KB markdown (needs >5 KB)`,
        }),
      },
    ],
  },
  {
    id: "meta-ai",
    name: "Meta AI Tooling",
    cap: 2.5,
    signals: [
      {
        id: "meta-base",
        label: "Base Meta AI tooling",
        max: 0.5,
        advice: "Reference the Meta AI tooling used (README + code).",
        run: () =>
          /muse spark|meta model api|meta ai|muse code/i.test(
            readme + libText + appText
          )
            ? { earned: 0.5, evidence: "Meta AI tooling referenced" }
            : { earned: 0, evidence: "no Meta AI references found" },
      },
      {
        id: "meta-api-sdk",
        label: "Meta Model API / SDK",
        max: 0.5,
        advice: "Call a Meta model API/SDK from lib/ (env-configured endpoint + key).",
        run: () =>
          /META_API_KEY|META_SPARK_API_URL|meta-model-api|metaspark/i.test(libText)
            ? { earned: 0.5, evidence: "Meta API client in lib/" }
            : { earned: 0, evidence: "no Meta API client in lib/" },
      },
      {
        id: "spark-integration",
        label: "Muse Spark integration",
        max: 0.3,
        advice: "Integrate Muse Spark beyond chat (e.g. prompt steering, structured ideation).",
        run: () =>
          exists("lib/meta-spark.ts") || /prompt.?steer/i.test(libText)
            ? { earned: 0.3, evidence: "Spark client / prompt steering in lib/" }
            : { earned: 0, evidence: "no Spark integration in lib/" },
      },
      {
        id: "sam-multimodal",
        label: "SAM / multimodal Muse",
        max: 0.3,
        advice: "Only if it fits the project: add a vision/multimodal Muse (e.g. SAM) stage.",
        run: () =>
          /segment anything|\bsam\b.?\d|multimodal muse/i.test(libText + readme)
            ? { earned: 0.3, evidence: "multimodal Muse referenced" }
            : { earned: 0, evidence: "no SAM/multimodal stage" },
      },
      {
        id: "pipeline-models",
        label: "3+ Meta model pipeline",
        max: 0.2,
        advice: "Only if it fits: wire 3+ distinct Meta models into the pipeline (lib/).",
        run: () =>
          pipelineModels.length >= 3
            ? { earned: 0.2, evidence: `models: ${pipelineModels.join(", ")}` }
            : {
                earned: 0,
                evidence: `${pipelineModels.length} Meta model family in lib/ (${pipelineModels.join(", ") || "none"})`,
              },
      },
      {
        id: "openweights-finetune",
        label: "Open-weights / fine-tuning",
        max: 0.5,
        advice:
          "Train a LoRA adapter (see ml/README.md checklist) so ml/artifacts/<run>/ holds an adapter config + eval report.",
        run: () => {
          // Trained artifacts only: adapter config + eval report from a
          // real run. Scaffolding code and prose never count.
          const artifacts = walkExt("ml/artifacts", [
            "adapter_config.json",
            "eval-report.json",
          ]);
          const hasAdapter = artifacts.some((f) =>
            f.endsWith("adapter_config.json")
          );
          const hasReport = artifacts.some((f) =>
            f.endsWith("eval-report.json")
          );
          return hasAdapter && hasReport
            ? {
                earned: 0.5,
                evidence: `trained adapter + eval in ml/artifacts`,
              }
            : {
                earned: 0,
                evidence: `adapter:${hasAdapter} eval:${hasReport} (code alone doesn't count)`,
              };
        },
      },
      {
        id: "hf-hub",
        label: "Published HF Hub weights",
        max: 0.3,
        advice: "Publish resulting weights to Hugging Face Hub and link them from README.",
        run: () =>
          /huggingface\.co/i.test(readme + appText + libText)
            ? { earned: 0.3, evidence: "Hugging Face link present" }
            : { earned: 0, evidence: "no Hugging Face link" },
      },
    ],
  },
  {
    id: "technical",
    name: "Technical Depth",
    cap: 2.0,
    signals: [
      {
        id: "git-base",
        label: "Base versioned repo",
        max: 0.3,
        advice: "Keep the work in git with real history.",
        run: () =>
          gitOk
            ? { earned: 0.3, evidence: "git history present" }
            : { earned: 0, evidence: "not a git checkout / no history" },
      },
      {
        id: "window-commits",
        label: "50+ window commits",
        max: 0.6,
        advice: "Commit in small steps through the hackathon window (Oct 27–Nov 4).",
        run: () => ({
          earned: r1(scaled(windowCommits, 50, 0.6)),
          evidence: `${windowCommits} commits in window (needs 50+)`,
        }),
      },
      {
        id: "test-suite",
        label: "Automated test suite",
        max: 0.3,
        advice: "Add tests/*.test.ts plus an npm test script.",
        run: () => {
          const hasScript =
            typeof packageJson.scripts?.test === "string" &&
            packageJson.scripts.test.length > 0;
          return hasScript && testFiles.length > 0
            ? {
                earned: 0.3,
                evidence: `${testFiles.length} test files + npm test`,
              }
            : { earned: 0, evidence: `tests:${testFiles.length} script:${hasScript}` };
        },
      },
      {
        id: "modular-src",
        label: "Modular src/ architecture",
        max: 0.3,
        advice: "Split logic into 5+ lib/ modules and 3+ app routes.",
        run: () => {
          const routes = walkExt("app", ["page.tsx"]).length;
          return libFiles.length >= 5 && routes >= 3
            ? {
                earned: 0.3,
                evidence: `${libFiles.length} lib modules, ${routes} routes`,
              }
            : {
                earned: 0,
                evidence: `${libFiles.length} lib modules, ${routes} routes`,
              };
        },
      },
      {
        id: "agent-eval-harness",
        label: "Agent / eval harness",
        max: 0.2,
        advice: "Add an agent-tools module or eval harness script.",
        run: () =>
          exists("lib/agent-tools.ts") ||
          walkExt("scripts", [".ts", ".mjs", ".js"]).some((f) =>
            /eval|agent/i.test(f)
          )
            ? { earned: 0.2, evidence: "agent/eval harness present" }
            : { earned: 0, evidence: "no agent/eval harness" },
      },
      {
        id: "ci-workflow",
        label: "Automated CI workflow",
        max: 0.2,
        advice: "Add .github/workflows/ci.yml running typecheck + lint + tests + build.",
        run: () =>
          walkExt(".github/workflows", [".yml", ".yaml"]).length > 0
            ? { earned: 0.2, evidence: "CI workflow present" }
            : { earned: 0, evidence: "no .github/workflows" },
      },
      {
        id: "pr-workflow",
        label: "PR review workflow",
        max: 0.2,
        advice: "Land work via reviewed pull requests (3+ squash-merged PRs in window).",
        run: () => ({
          earned: r1(scaled(windowPrs, 3, 0.2)),
          evidence: `${windowPrs} window PRs (needs 3+)`,
        }),
      },
    ],
  },
  {
    id: "demo",
    name: "Demo Completeness",
    cap: 2.5,
    signals: [
      {
        id: "demo-base",
        label: "Base live demo",
        max: 0.4,
        advice: "Ship an interactive demo section (app/demo.tsx + #demo anchor).",
        run: () =>
          exists("app/demo.tsx") && appText.includes('id="demo"')
            ? { earned: 0.4, evidence: "demo section present" }
            : { earned: 0, evidence: "no demo section" },
      },
      {
        id: "video-link",
        label: "Video walkthrough linked",
        max: 0.6,
        advice: "Link the video walkthrough from README and the landing page.",
        run: () =>
          videoUrl !== null
            ? { earned: 0.6, evidence: `linked: ${videoUrl}` }
            : { earned: 0, evidence: "no video URL in README/app" },
      },
      {
        id: "video-resolves",
        label: "Video URL resolves",
        max: 0.5,
        advice: "Point the shortlink at the finished video so it resolves to a playable page.",
        run: async () => {
          if (videoUrl === null)
            return { earned: 0, evidence: "no video URL to check" };
          if (NO_NETWORK)
            return { earned: 0, evidence: "not checked (--no-network)" };
          const res = await fetchStatus(videoUrl);
          return res.ok
            ? { earned: 0.5, evidence: `HTTP ${res.status} at ${res.url}` }
            : {
                earned: 0,
                evidence: `unreachable (${res.error ?? `HTTP ${res.status}`})`,
              };
        },
      },
      {
        id: "setup-guide",
        label: "Reproducible setup guide",
        max: 0.4,
        advice: "Document install + run commands (npm and/or Docker) in README.",
        run: () =>
          /npm install/.test(readme) &&
          (/npm run dev/.test(readme) || /docker (build|run)/.test(readme))
            ? { earned: 0.4, evidence: "install + run documented" }
            : { earned: 0, evidence: "setup steps missing from README" },
      },
      {
        id: "deploy-declared",
        label: "Live deployment declared",
        max: 0.2,
        advice: "Deploy the app and put the production URL in README.",
        run: () =>
          deployUrl !== null
            ? { earned: 0.2, evidence: `declared: ${deployUrl}` }
            : { earned: 0, evidence: "no deployment URL in README" },
      },
      {
        id: "deploy-live",
        label: "Live deployment responds",
        max: 0.2,
        advice: "Keep the production deployment healthy (HTTP 200 on /).",
        run: async () => {
          if (deployUrl === null)
            return { earned: 0, evidence: "no deployment URL to check" };
          if (NO_NETWORK)
            return { earned: 0, evidence: "not checked (--no-network)" };
          const res = await fetchStatus(deployUrl);
          return res.ok
            ? { earned: 0.2, evidence: `HTTP ${res.status} at ${res.url}` }
            : {
                earned: 0,
                evidence: `unreachable (${res.error ?? `HTTP ${res.status}`})`,
              };
        },
      },
      {
        id: "visual-docs",
        label: "Visual docs & diagrams",
        max: 0.2,
        advice: "Add diagrams/illustrations until public/ visuals exceed 6 KB.",
        run: () => ({
          earned: r1(scaled(imageBytes, 6144, 0.2)),
          evidence: `${(imageBytes / 1024).toFixed(1)} KB visuals (needs >6 KB)`,
        }),
      },
    ],
  },
];

function bar(score, cap, width = 18) {
  const filled = Math.round((Math.min(score, cap) / cap) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

async function main() {
  const pillars = [];
  for (const pillar of PILLARS) {
    const signals = [];
    for (const signal of pillar.signals) {
      let result;
      try {
        result = await signal.run();
      } catch (error) {
        result = { earned: 0, evidence: `check failed: ${String(error)}` };
      }
      signals.push({
        id: signal.id,
        label: signal.label,
        max: signal.max,
        earned: Math.min(r1(result.earned), signal.max),
        evidence: result.evidence,
        advice: signal.advice,
      });
    }
    const raw = r1(signals.reduce((sum, s) => sum + s.earned, 0));
    pillars.push({
      id: pillar.id,
      name: pillar.name,
      cap: pillar.cap,
      raw,
      score: Math.min(raw, pillar.cap),
      signals,
    });
  }
  const total = r1(pillars.reduce((sum, p) => sum + p.score, 0));
  const improvements = pillars
    .flatMap((p) => p.signals.map((s) => ({ pillar: p.name, ...s })))
    .filter((s) => s.earned < s.max - 1e-9)
    .map((s) => ({ ...s, gap: r1(s.max - s.earned) }))
    .sort((a, b) => b.gap - a.gap || a.label.localeCompare(b.label));

  const report = {
    repo: path.basename(ROOT),
    window: `${WINDOW_SINCE}..${WINDOW_UNTIL} (exclusive)`,
    total,
    pillars,
    improvements: improvements.map((s) => ({
      signal: s.id,
      pillar: s.pillar,
      gap: s.gap,
      advice: s.advice,
      evidence: s.evidence,
    })),
  };

  if (WANT_JSON) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nHackathon self-score — ${report.repo} (${report.window})`);
  for (const pillar of pillars) {
    console.log(
      `\n${pillar.name}  ${bar(pillar.score, pillar.cap)}  ${pillar.score.toFixed(1)} / ${pillar.cap.toFixed(1)}`
    );
    for (const s of pillar.signals) {
      const mark =
        s.earned >= s.max - 1e-9 ? "✓" : s.earned > 0 ? "◐" : "·";
      console.log(
        `  ${mark} ${s.label} +${s.earned.toFixed(1)}/${s.max.toFixed(1)} — ${s.evidence}`
      );
    }
  }
  console.log(`\nTOTAL  ${total.toFixed(1)} / 10.0`);
  if (improvements.length > 0) {
    console.log("\nTop improvements (points left on the table):");
    for (const [index, s] of improvements.slice(0, 8).entries()) {
      console.log(
        `  ${index + 1}. (+${s.gap.toFixed(1)}) ${s.advice} [${s.id}]`
      );
    }
    console.log(
      "\nNote: pillars cap, so inapplicable signals (e.g. SAM for a\nsequence-design tool) can stay at zero without hurting a maxed pillar."
    );
  } else {
    console.log("\nNo gaps — every signal passes.");
  }
}

await main();
