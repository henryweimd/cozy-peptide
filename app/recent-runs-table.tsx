"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import { timeAgo } from "./pipeline-shared";

const PAGE_SIZE = 10;

interface RunRow {
  id: string;
  createdAt: string;
  target: string;
  modality: string | null;
  researchStatus: string | null;
  candidateId: string | null;
  candidateSequence: string | null;
  therapeuticIndex: number | null;
  safetyIndex: number | null;
  elapsedMs: number | null;
}

function isRunRow(value: unknown): value is RunRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row["id"] === "string" &&
    typeof row["createdAt"] === "string" &&
    typeof row["target"] === "string"
  );
}

function shortSequence(sequence: string | null): string {
  if (sequence === null || sequence.length === 0) return "—";
  return sequence.length > 18
    ? `${sequence.slice(0, 8)}…${sequence.slice(-8)}`
    : sequence;
}

function indexes(run: RunRow): string {
  if (run.therapeuticIndex === null || run.safetyIndex === null) return "—";
  return `${run.therapeuticIndex.toFixed(0)} / ${run.safetyIndex.toFixed(0)}`;
}

/**
 * Compact ledger table for the design page: the 10 most recent
 * successful designs, newest first, with a Show more pager that
 * appends older pages without growing the initial footprint.
 * Selecting a row opens the full pipeline reconstruction.
 */
export default function RecentRunsTable({
  onSelect,
}: {
  onSelect: (id: string) => void;
}): React.ReactElement | null {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    fetch(`/api/recent-peptides?limit=${PAGE_SIZE}`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("feed"))
      )
      .then((body: unknown) => {
        if (!live) return;
        const data =
          typeof body === "object" && body !== null
            ? (body as { data?: unknown }).data
            : null;
        const rows = Array.isArray(data)
          ? data.filter(isRunRow)
          : [];
        setRuns(rows);
        setExhausted(rows.length < PAGE_SIZE);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (failed) return null;

  const showMore = (): void => {
    if (runs === null || loadingMore || exhausted) return;
    setLoadingMore(true);
    fetch(`/api/recent-peptides?limit=${PAGE_SIZE}&offset=${runs.length}`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("feed"))
      )
      .then((body: unknown) => {
        const data =
          typeof body === "object" && body !== null
            ? (body as { data?: unknown }).data
            : null;
        const rows = Array.isArray(data) ? data.filter(isRunRow) : [];
        setRuns((prev) => [...(prev ?? []), ...rows]);
        if (rows.length < PAGE_SIZE) setExhausted(true);
      })
      .catch(() => setExhausted(true))
      .finally(() => setLoadingMore(false));
  };

  return (
    <section aria-label="Recent designs">
      <h3>Recent designs</h3>
      {runs === null ? (
        <p className={styles.note}>Loading recent designs…</p>
      ) : runs.length === 0 ? (
        <p className={styles.note}>
          No saved designs yet — run one above and it lands here.
        </p>
      ) : (
        <>
          <table className={styles.apitable}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Target</th>
                <th scope="col">Sequence</th>
                <th scope="col">TI / SI</th>
                <th scope="col">Research</th>
                <th scope="col">
                  <span className="visually-hidden">Review</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td data-label="When">
                    {timeAgo(run.createdAt, now)}
                  </td>
                  <td data-label="Target">{run.target}</td>
                  <td data-label="Sequence">
                    <code>{shortSequence(run.candidateSequence)}</code>
                  </td>
                  <td data-label="TI / SI">{indexes(run)}</td>
                  <td data-label="Research">
                    {run.researchStatus ?? "—"}
                  </td>
                  <td data-label="Review">
                    <button
                      type="button"
                      className={styles.btn}
                      onClick={() => onSelect(run.id)}
                      aria-label={`Review design for ${run.target}`}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!exhausted && (
            <button
              type="button"
              className={styles.btn}
              disabled={loadingMore}
              aria-busy={loadingMore}
              onClick={showMore}
            >
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
