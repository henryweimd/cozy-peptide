"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import { timeAgo } from "./pipeline-shared";

export interface RecentRun {
  id: string;
  createdAt: string;
  target: string;
  modality: string | null;
  chargeTarget: number | null;
  researchStatus: string | null;
  candidateId: string | null;
  candidateSequence: string | null;
  therapeuticIndex: number | null;
  safetyIndex: number | null;
}

function metaLine(run: RecentRun): string {
  const bits: string[] = [];
  if (run.modality !== null) bits.push(run.modality);
  if (run.chargeTarget !== null) bits.push(`charge +${run.chargeTarget}`);
  if (run.therapeuticIndex !== null && run.safetyIndex !== null) {
    bits.push(
      `therapeutic ${run.therapeuticIndex.toFixed(0)}, safety ${run.safetyIndex.toFixed(0)}`
    );
  }
  if (run.researchStatus !== null && run.researchStatus !== "ok") {
    bits.push(`research ${run.researchStatus}`);
  }
  return bits.join(", ");
}

/**
 * Most-recent-design spotlight for the landing demo board: exactly
 * one run, labeled as such, with a link into the Design page's full
 * recent list. Renders nothing until the row arrives, and hides on
 * any fault — the ledger is ambient, never load-bearing.
 */
export default function Recent({
  onUse,
}: {
  onUse?: (run: RecentRun) => void;
}): React.ReactElement | null {
  const [runs, setRuns] = useState<RecentRun[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    fetch("/api/recent-peptides?limit=1")
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("feed"))
      )
      .then((body: unknown) => {
        if (!live) return;
        const data =
          typeof body === "object" && body !== null
            ? (body as { data?: unknown }).data
            : null;
        setRuns(Array.isArray(data) ? (data as RecentRun[]) : []);
      })
      .catch(() => {
        if (live) setRuns([]);
      });
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  if (runs === null || runs.length === 0) return null;
  const run = runs[0] as RecentRun;
  return (
    <aside className={styles.recent} aria-label="Most recently designed peptide">
      <p className={styles.recentTitle}>Most recent design</p>
      <ol className={styles.recentList}>
        <li key={run.id}>
          <code className={styles.recentSeq} title={run.target}>
            {run.candidateSequence ?? run.candidateId ?? "—"}
          </code>
          <span className={styles.recentMeta}>
            {run.target} — {timeAgo(run.createdAt, now)}
            {metaLine(run).length > 0 ? `, ${metaLine(run)}` : ""}
          </span>
          {onUse !== undefined && run.candidateSequence !== null && (
            <button
              type="button"
              className={styles.usebutton}
              onClick={() => onUse(run)}
              aria-label={`View structure of ${run.candidateId ?? "peptide"}`}
            >
              View structure
            </button>
          )}
        </li>
      </ol>
      <p className={styles.recentMeta}>
        <a className={styles.designerlink} href="/design#recent-runs">
          See recently designed peptides
        </a>
      </p>
    </aside>
  );
}
