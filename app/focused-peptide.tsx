"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import styles from "./page.module.css";
import { HandoffDownloads, timeAgo } from "./pipeline-shared";
import type { RecentRun } from "./recent";

const PeptideViewer = dynamic(() => import("./peptide-viewer"), {
  ssr: false,
  loading: () => <p className={styles.note}>Loading 3D viewer…</p>,
});

interface RunDetailBody {
  candidate?: {
    id?: string;
    sequence?: string;
    topology?: string;
  };
  symbolic_audit?: {
    charge?: number;
    therapeutic_index?: number;
    safety_index?: number;
  };
  lab_handoff?: {
    cai: number;
    dna_gblock?: string;
    gblock_manifest?: string;
    order_csv?: string;
    restriction_scrub: { status: string };
    synthesis_order: {
      sequence_name: string;
      dna_length: number;
      gc_percent: number;
    };
  };
}

function isDetailBody(value: unknown): value is RunDetailBody {
  return typeof value === "object" && value !== null;
}

/**
 * Focused past run: sequence, on-demand 3D structure, audit metrics,
 * and lab handoff downloads for a ledger row chosen in the recent
 * strip. Fetches full blobs; degrades to a short note on any fault.
 */
export default function FocusedPeptide({
  run,
  onClose,
}: {
  run: RecentRun;
  onClose: () => void;
}): React.ReactElement {
  const [detail, setDetail] = useState<{
    id: string;
    body: RunDetailBody;
  } | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    const runId = run.id;
    fetch(`/api/peptide-run?id=${encodeURIComponent(runId)}`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("run"))
      )
      .then((body: unknown) => {
        if (!live) return;
        const data =
          typeof body === "object" && body !== null
            ? (body as { data?: unknown }).data
            : null;
        if (!isDetailBody(data)) {
          setFailedId(runId);
          return;
        }
        setDetail({ id: runId, body: data });
      })
      .catch(() => {
        if (live) setFailedId(runId);
      });
    return () => {
      live = false;
    };
  }, [run.id]);

  const shown = detail !== null && detail.id === run.id ? detail.body : null;
  const failed = failedId === run.id;
  const sequence = run.candidateSequence ?? "";
  const audit = shown?.symbolic_audit;

  return (
    <section className={styles.focused} aria-label="Peptide from the ledger">
      <div className={styles.focusedhead}>
        <div>
          <h3>From the ledger</h3>
          <p className={styles.recentMeta}>
            {run.target} — {timeAgo(run.createdAt, now)}
          </p>
        </div>
        <button
          type="button"
          className={styles.btn}
          onClick={onClose}
          aria-label="Close focused peptide"
        >
          Close
        </button>
      </div>

      {sequence.length > 0 && (
        <>
          <p className={styles.sequence}>{sequence}</p>
          <p className={styles.topology}>
            {run.candidateId ?? ""}, {sequence.length} residues
          </p>
          <PeptideViewer key={run.id} sequence={sequence} />
        </>
      )}

      {shown === null && !failed && (
        <p className={styles.note}>Loading run details…</p>
      )}
      {failed && (
        <p className={styles.note}>
          Couldn&apos;t load that run&apos;s details — the structure above
          still folds from its sequence.
        </p>
      )}

      {audit !== undefined && (
        <dl className={styles.metrics}>
          {audit.charge !== undefined && (
            <div>
              <dt>Charge</dt>
              <dd>+{audit.charge}</dd>
            </div>
          )}
          {audit.therapeutic_index !== undefined && (
            <div>
              <dt>Therapeutic</dt>
              <dd>{audit.therapeutic_index.toFixed(1)}</dd>
            </div>
          )}
          {audit.safety_index !== undefined && (
            <div>
              <dt>Safety</dt>
              <dd>{audit.safety_index.toFixed(1)}</dd>
            </div>
          )}
        </dl>
      )}

      {shown?.lab_handoff !== undefined && (
        <HandoffDownloads
          result={{ success: true, lab_handoff: shown.lab_handoff }}
        />
      )}
    </section>
  );
}
