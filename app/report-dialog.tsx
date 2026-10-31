"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

/**
 * Literature brief reader: fetches the referenced report for a
 * stored run or the current in-memory design, renders it with a
 * numbered references section, and offers .docx / .html / print-PDF
 * downloads.
 */

export type ReportSource =
  | { kind: "run"; runId: string }
  | {
      kind: "inline";
      target: string;
      brief: unknown;
      evidence: unknown;
    };

interface ReportModel {
  target: string;
  generatedAt: string;
  model: string;
  cached: boolean;
  fallback: boolean;
  evidenceCount: number;
  narrative: {
    background: string;
    rationale: string;
    targets: Array<{ name: string; note: string; cites: number[] }>;
    safety: string;
    limitations: string;
  };
  references: Array<{
    n: number;
    title: string;
    source: string;
    year: string | null;
    url: string;
  }>;
}

function isReportModel(value: unknown): value is ReportModel {
  if (typeof value !== "object" || value === null) return false;
  const report = value as Record<string, unknown>;
  const narrative = report["narrative"];
  return (
    typeof report["target"] === "string" &&
    typeof narrative === "object" &&
    narrative !== null &&
    Array.isArray(report["references"])
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportToHtml(report: ReportModel): string {
  const narrative = report.narrative;
  const targets = narrative.targets
    .map(
      (entry) =>
        `<li><strong>${escapeHtml(entry.name)}</strong>: ${escapeHtml(entry.note)}${
          entry.cites.length > 0 ? ` [${entry.cites.join(", ")}]` : ""
        }</li>`
    )
    .join("\n");
  const references = report.references
    .map(
      (ref) =>
        `<li id="ref-${ref.n}">[${ref.n}] ${
          ref.url.length > 0
            ? `<a href="${escapeHtml(ref.url)}">${escapeHtml(ref.title)}</a>`
            : escapeHtml(ref.title)
        } <em>— ${escapeHtml(ref.source)}${ref.year !== null ? `, ${escapeHtml(ref.year)}` : ""}</em></li>`
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Literature Brief — ${escapeHtml(report.target)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:0 1rem;line-height:1.6}h1{font-size:1.5rem}.meta{color:#555;font-style:italic}ol.refs li{margin-bottom:.4rem}</style>
</head>
<body>
<h1>Literature Brief — ${escapeHtml(report.target)}</h1>
<p class="meta">Generated ${escapeHtml(report.generatedAt)} · ${escapeHtml(report.model)} · ${report.evidenceCount} references${report.cached ? " · cached" : ""}${report.fallback ? " · synthesis fallback" : ""}</p>
<h2>Background</h2>
<p>${escapeHtml(narrative.background)}</p>
<h2>Biological rationale</h2>
<p>${escapeHtml(narrative.rationale)}</p>
<h2>Supported targets</h2>
<ul>${targets}</ul>
<h2>Safety: what to avoid</h2>
<p>${escapeHtml(narrative.safety.length > 0 ? narrative.safety : "No avoid list converged.")}</p>
<h2>Limitations</h2>
<p>${escapeHtml(narrative.limitations.length > 0 ? narrative.limitations : "No limitations recorded.")}</p>
<h2>References</h2>
<ol class="refs">${references}</ol>
</body>
</html>
`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(target: string): string {
  const slug = target
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "report";
}

export default function ReportDialog({
  source,
  onClose,
}: {
  source: ReportSource;
  onClose: () => void;
}): React.ReactElement {
  const [report, setReport] = useState<ReportModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const body =
      source.kind === "run"
        ? { runId: source.runId }
        : {
            target: source.target,
            brief: source.brief,
            evidence: source.evidence,
          };
    fetch("/api/research-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || typeof payload !== "object" || payload === null) {
          throw new Error(
            typeof payload === "object" &&
              payload !== null &&
              typeof (payload as { error?: unknown }).error === "string"
              ? ((payload as { error: string }).error as string)
              : `Report failed (${response.status}).`
          );
        }
        const data = (payload as { report?: unknown }).report;
        if (!isReportModel(data)) throw new Error("Malformed report.");
        if (live) setReport(data);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "Failed.");
      });
    return () => {
      live = false;
    };
  }, [source]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const downloadDocx = (): void => {
    if (report === null || busy !== null) return;
    setBusy("docx");
    const body =
      source.kind === "run"
        ? { runId: source.runId }
        : {
            target: source.target,
            brief: source.brief,
            evidence: source.evidence,
          };
    fetch("/api/research-report/docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload: unknown = await response
            .json()
            .catch(() => null);
          const message =
            typeof payload === "object" &&
            payload !== null &&
            typeof (payload as { error?: unknown }).error === "string"
              ? (payload as { error: string }).error
              : `Download failed (${response.status}).`;
          throw new Error(message);
        }
        const blob = await response.blob();
        downloadBlob(blob, `literature-brief-${slugify(report.target)}.docx`);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Download failed.");
      })
      .finally(() => setBusy(null));
  };

  const downloadHtml = (): void => {
    if (report === null) return;
    const blob = new Blob([reportToHtml(report)], { type: "text/html" });
    downloadBlob(blob, `literature-brief-${slugify(report.target)}.html`);
  };

  return (
    <div
      className={styles.reportoverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Literature brief"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`${styles.reportpanel} report-print`}>
        <div className={`${styles.reporthead} report-actions`}>
          <h3>Literature brief</h3>
          <button
            type="button"
            className={styles.btn}
            onClick={onClose}
            aria-label="Close literature brief"
          >
            Close
          </button>
        </div>

        {report === null && error === null && (
          <p className={styles.note}>
            Synthesizing the referenced brief with Muse Spark…
          </p>
        )}
        {error !== null && (
          <p className={styles.note} role="alert">
            {error}
          </p>
        )}

        {report !== null && (
          <>
            <p className={styles.recentMeta}>
              {report.target} — {report.evidenceCount} references ·{" "}
              {report.model}
              {report.cached ? " · cached" : ""}
              {report.fallback ? " · model synthesis unavailable" : ""}
            </p>
            <h4>Background</h4>
            <p>{report.narrative.background}</p>
            <h4>Biological rationale</h4>
            <p>{report.narrative.rationale}</p>
            <h4>Supported targets</h4>
            <ul className={styles.trace}>
              {report.narrative.targets.map((entry) => (
                <li key={entry.name}>
                  <strong>{entry.name}</strong>: {entry.note}
                  {entry.cites.length > 0 && ` [${entry.cites.join(", ")}]`}
                </li>
              ))}
            </ul>
            <h4>Safety: what to avoid</h4>
            <p>
              {report.narrative.safety.length > 0
                ? report.narrative.safety
                : "No avoid list converged."}
            </p>
            <h4>Limitations</h4>
            <p>
              {report.narrative.limitations.length > 0
                ? report.narrative.limitations
                : "No limitations recorded."}
            </p>
            <h4>References</h4>
            <ol className={styles.reportrefs}>
              {report.references.map((ref) => (
                <li key={ref.n}>
                  {ref.url.length > 0 ? (
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {ref.title}
                    </a>
                  ) : (
                    ref.title
                  )}{" "}
                  <span className={styles.recentMeta}>
                    — {ref.source}
                    {ref.year !== null ? `, ${ref.year}` : ""}
                  </span>
                </li>
              ))}
            </ol>

            <div className={`${styles.reportactions} report-actions`}>
              <button
                type="button"
                className={styles.btn}
                disabled={busy !== null}
                aria-busy={busy === "docx"}
                onClick={downloadDocx}
              >
                {busy === "docx" ? "Preparing…" : "Download .docx"}
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={downloadHtml}
              >
                Download .html
              </button>
              <button
                type="button"
                className={styles.btn}
                onClick={() => window.print()}
              >
                Print / PDF
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
