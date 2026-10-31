"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import { timeAgo } from "./pipeline-shared";

interface RecentRun {
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
 * Subtle recent-designs strip for the landing demo board. Renders
 * nothing until rows arrive, and hides on any fault — the ledger is
 * ambient, never load-bearing for the page.
 */
export default function Recent(): React.ReactElement | null {
  const [runs, setRuns] = useState<RecentRun[] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    fetch("/api/recent-peptides?limit=3")
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
  return (
    <aside className={styles.recent} aria-label="Recently designed peptides">
      <p className={styles.recentTitle}>Fresh from the pipeline</p>
      <ol className={styles.recentList}>
        {runs.map((run) => (
          <li key={run.id}>
            <code className={styles.recentSeq} title={run.target}>
              {run.candidateSequence ?? run.candidateId ?? "—"}
            </code>
            <span className={styles.recentMeta}>
              {run.target} — {timeAgo(run.createdAt, now)}
              {metaLine(run).length > 0 ? `, ${metaLine(run)}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
