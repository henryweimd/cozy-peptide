"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import styles from "./page.module.css";
import {
  DesignedPeptideHero,
  EventLog,
  HandoffDownloads,
  StageDetail,
  researchOutcomeLine,
  timeAgo,
  type PipelinePayload,
  type StageEvent,
  type StageName,
} from "./pipeline-shared";
import ReportDialog from "./report-dialog";

const PeptideViewer = dynamic(() => import("./peptide-viewer"), {
  ssr: false,
  loading: () => <p className={styles.note}>Loading 3D viewer…</p>,
});

const STAGE_NAMES: StageName[] = [
  "research",
  "propose",
  "verify",
  "repair",
  "synthesize",
  "handoff",
];

type DetailBody = Record<string, unknown>;

function isDetailBody(value: unknown): value is DetailBody {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** Reads either casing: the detail reader is camelCase, blobs vary. */
function pick(
  body: DetailBody,
  camel: string,
  snake: string
): unknown {
  const direct = body[camel];
  if (direct !== undefined) return direct;
  return body[snake];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStageEvents(value: unknown): StageEvent[] {
  if (!Array.isArray(value)) return [];
  const events: StageEvent[] = [];
  for (const entry of value.slice(0, 100)) {
    const record = asRecord(entry);
    if (record === null) continue;
    const stage = record["stage"];
    const turn = record["turn"];
    const message = record["message"];
    if (
      typeof stage !== "string" ||
      !STAGE_NAMES.includes(stage as StageName) ||
      typeof turn !== "number" ||
      !Number.isFinite(turn) ||
      typeof message !== "string"
    ) {
      continue;
    }
    const event: StageEvent = {
      stage: stage as StageName,
      turn: Math.floor(turn),
      message,
    };
    if (typeof record["source"] === "string") event.source = record["source"];
    if (typeof record["candidate"] === "string") {
      event.candidate = record["candidate"];
    }
    if (typeof record["grammarValid"] === "boolean") {
      event.grammarValid = record["grammarValid"];
    }
    if (typeof record["auditPassed"] === "boolean") {
      event.auditPassed = record["auditPassed"];
    }
    if (typeof record["issues"] === "number") event.issues = record["issues"];
    if (typeof record["diagnostic"] === "string") {
      event.diagnostic = record["diagnostic"];
    }
    if (typeof record["temperature"] === "number") {
      event.temperature = record["temperature"];
    }
    events.push(event);
  }
  return events;
}

/**
 * Focused past run: the full pipeline output reconstructed from the
 * ledger — design status timeline, parameters, sequence with on-demand
 * 3D structure, audit metrics, specificity review, provenance, the
 * literature brief, and every downloadable artifact. Degrades to a
 * short note on any fault.
 */
export default function FocusedPeptide({
  runId,
  onClose,
}: {
  runId: string;
  onClose: () => void;
}): React.ReactElement {
  const [detail, setDetail] = useState<{
    id: string;
    body: DetailBody;
  } | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
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
  }, [runId]);

  const shown = detail !== null && detail.id === runId ? detail.body : null;
  const failed = failedId === runId;

  const target = shown !== null ? asString(shown["target"]) : null;
  const createdAt = shown !== null ? asString(shown["createdAt"]) : null;
  const status = shown !== null ? (asString(shown["status"]) ?? "success") : "success";
  const candidateBlob =
    shown !== null ? asRecord(pick(shown, "candidate", "candidate")) : null;
  const sequence =
    (shown !== null ? asString(shown["candidateSequence"]) : null) ??
    (candidateBlob !== null
      ? (asString(candidateBlob["mature_sequence"]) ??
        asString(candidateBlob["sequence"]))
      : null) ??
    "";
  const candidateId =
    (shown !== null ? asString(shown["candidateId"]) : null) ??
    (candidateBlob !== null ? asString(candidateBlob["id"]) : null);
  const topology =
    candidateBlob !== null ? asString(candidateBlob["topology"]) : null;
  const grammar =
    candidateBlob !== null ? asRecord(candidateBlob["grammar_breakdown"]) : null;
  const auditBlob =
    shown !== null ? asRecord(pick(shown, "symbolicAudit", "symbolic_audit")) : null;
  const handoffBlob =
    shown !== null ? asRecord(pick(shown, "labHandoff", "lab_handoff")) : null;
  const requestBlob =
    shown !== null ? asRecord(pick(shown, "request", "request")) : null;
  const researchBlob =
    shown !== null
      ? asRecord(pick(shown, "researchProvenance", "research_provenance"))
      : null;
  const specificityBlob =
    shown !== null ? asRecord(pick(shown, "specificity", "specificity")) : null;
  const refinementTrace =
    shown !== null ? pick(shown, "refinementTrace", "refinement_trace") : null;
  const refinementTurns = Array.isArray(refinementTrace)
    ? refinementTrace.length
    : 0;
  const stageEvents =
    shown !== null ? asStageEvents(pick(shown, "stageTrace", "stage_trace")) : [];
  const elapsedMs = shown !== null ? asNumber(shown["elapsedMs"]) : null;
  const auditPassed = auditBlob !== null ? auditBlob["passed"] === true : null;

  // Rebuilds the pipeline payload shape so every artifact download —
  // including the full-result JSON — matches a live run's.
  const downloadResult: PipelinePayload | null =
    shown !== null && handoffBlob !== null
      ? ({
          success: status === "success",
          ...(target !== null ? { target } : {}),
          ...(requestBlob !== null &&
          typeof requestBlob["requested_target"] === "string"
            ? { requested_target: requestBlob["requested_target"] as string }
            : {}),
          ...(candidateBlob !== null
            ? { candidate: candidateBlob as PipelinePayload["candidate"] }
            : {}),
          ...(auditBlob !== null
            ? { symbolic_audit: auditBlob as PipelinePayload["symbolic_audit"] }
            : {}),
          neurosymbolic_provenance: {
            ...(requestBlob !== null &&
            typeof requestBlob["model"] === "string"
              ? { proposer_model: requestBlob["model"] as string }
              : {}),
            compiler_refinement_cycles: refinementTurns,
            ...(asString(shown["targetClass"]) !== null
              ? { target_class: asString(shown["targetClass"]) as string }
              : {}),
            refinement_trace: (
              Array.isArray(refinementTrace) ? refinementTrace : []
            ) as Array<{ turn: number; source: string; disposition: string }>,
          },
          ...(researchBlob !== null
            ? {
                research_provenance:
                  researchBlob as PipelinePayload["research_provenance"],
              }
            : {}),
          ...(specificityBlob !== null
            ? {
                specificity:
                  specificityBlob as PipelinePayload["specificity"],
              }
            : {}),
          lab_handoff: handoffBlob as PipelinePayload["lab_handoff"],
        } as PipelinePayload)
      : null;

  const researchStatus =
    researchBlob !== null ? asString(researchBlob["status"]) : null;
  const evidenceCount =
    researchBlob !== null ? asNumber(researchBlob["evidence_count"]) : null;
  const specificityLine =
    specificityBlob === null
      ? null
      : specificityBlob["checked"] === true
        ? specificityBlob["pass"] === true
          ? "✓ blinded review confirms the intended target"
          : `✗ ${asString(specificityBlob["reason"]) ?? "off-target"}`
        : `○ not checked, ${asString(specificityBlob["reason"]) ?? "unknown"}`;

  return (
    <section className={styles.focused} aria-label="Peptide from the ledger">
      <div className={styles.focusedhead}>
        <div>
          <h3>From the ledger</h3>
          {target !== null && (
            <p className={styles.recentMeta}>
              {target}
              {createdAt !== null && `, ${timeAgo(createdAt, now)}`}
              {elapsedMs !== null && `, ${(elapsedMs / 1000).toFixed(1)}s`}
            </p>
          )}
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

      {shown === null && !failed && (
        <p className={styles.note}>Loading run details…</p>
      )}
      {failed && (
        <p className={styles.note}>
          Couldn&apos;t load that run. It may have been removed.
        </p>
      )}

      {shown !== null && (
        <>
          <h4>Design status</h4>
          {stageEvents.length > 0 ? (
            <>
              <StageDetail
                events={stageEvents}
                finished
                failed={status !== "success"}
              />
              <details className={styles.rawjson}>
                <summary>Full step log</summary>
                <EventLog events={stageEvents} logRef={{ current: null }} />
              </details>
            </>
          ) : (
            <p className={styles.note}>
              {status !== "success"
                ? "This run failed; a step-by-step trace was not recorded."
                : "A step-by-step trace was not recorded for this run: "}
              {status === "success" &&
                `research ${researchStatus ?? "unknown"}, ${refinementTurns} refinement turn${refinementTurns === 1 ? "" : "s"}, audit ${auditPassed === true ? "passed" : auditPassed === false ? "failed" : "unknown"}, handoff ${handoffBlob !== null ? "compiled" : "missing"}.`}
            </p>
          )}

          {requestBlob !== null && (
            <>
              <h4>Parameters</h4>
              <dl className={styles.metrics}>
                {typeof requestBlob["requested_target"] === "string" && (
                  <div>
                    <dt>Requested</dt>
                    <dd>{requestBlob["requested_target"] as string}</dd>
                  </div>
                )}
                {typeof requestBlob["modality"] === "string" && (
                  <div>
                    <dt>Scaffold</dt>
                    <dd>{requestBlob["modalilty"] as string}</dd>
                  </div>
                )}
                {typeof requestBlob["charge_target"] === "number" && (
                  <div>
                    <dt>Charge</dt>
                    <dd>+{requestBlob["charge_target"] as number}</dd>
                  </div>
                )}
                {typeof requestBlob["model"] === "string" && (
                  <div>
                    <dt>Model</dt>
                    <dd>{requestBlob["model"] as string}</dd>
                  </div>
                )}
                {typeof requestBlob["research"] === "boolean" && (
                  <div>
                    <dt>Research</dt>
                    <dd>
                      {(requestBlob["research"] as boolean) ? "on" : "off"}
                    </dd>
                  </div>
                )}
                {typeof requestBlob["mechanism"] === "string" && (
                  <div>
                    <dt>Mechanism</dt>
                    <dd>{requestBlob["mechanism"] as string}</dd>
                  </div>
                )}
              </dl>
            </>
          )}

          {sequence.length > 0 && (
            <>
              <DesignedPeptideHero
                sequence={sequence}
                heading="Designed peptide"
                constructId={candidateId ?? undefined}
                topology={topology ?? undefined}
              />
              {grammar !== null && Object.keys(grammar).length > 0 && (
                <ul className={styles.loopchips}>
                  {Object.entries(grammar).map(([loop, value]) => (
                    <li key={loop}>
                      <span>{loop}</span>
                      <code>{typeof value === "string" ? value : "—"}</code>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {researchBlob !== null && (
            <>
              <h4>Literature brief</h4>
              <p className={styles.handoffline}>
                {researchOutcomeLine(
                  researchStatus,
                  researchBlob !== null
                    ? asString(researchBlob["reason"])
                    : null,
                  evidenceCount
                )}
              </p>
              <div className={styles.reportactions}>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => setReportOpen(true)}
                >
                  Read the literature brief
                </button>
              </div>
            </>
          )}

          {sequence.length > 0 && (
            <>
              <h4>Predicted structure</h4>
              <PeptideViewer
                key={runId}
                sequence={sequence}
                runId={runId}
                storedPdb={
                  shown !== null ? asString(shown["structurePdb"]) : null
                }
                storedPlddt={
                  shown !== null ? asNumber(shown["structurePlddt"]) : null
                }
              />
            </>
          )}

          {auditBlob !== null && (
            <>
              <h4>Audit ledger</h4>
              <dl className={styles.metrics}>
                {typeof auditBlob["charge"] === "number" && (
                  <div>
                    <dt>Charge</dt>
                    <dd>+{auditBlob["charge"] as number}</dd>
                  </div>
                )}
                {typeof auditBlob["therapeutic_index"] === "number" && (
                  <div>
                    <dt>Therapeutic</dt>
                    <dd>
                      {(auditBlob["therapeutic_index"] as number).toFixed(1)}
                    </dd>
                  </div>
                )}
                {typeof auditBlob["safety_index"] === "number" && (
                  <div>
                    <dt>Safety</dt>
                    <dd>{(auditBlob["safety_index"] as number).toFixed(1)}</dd>
                  </div>
                )}
                {typeof auditBlob["gravy"] === "number" && (
                  <div>
                    <dt>GRAVY</dt>
                    <dd>{auditBlob["gravy"] as number}</dd>
                  </div>
                )}
              </dl>
            </>
          )}

          {specificityLine !== null && (
            <>
              <h4>Specificity review</h4>
              <p className={styles.handoffline}>{specificityLine}</p>
            </>
          )}

          {downloadResult !== null && (
            <>
              <h4>Lab handoff</h4>
              <HandoffDownloads result={downloadResult} />
            </>
          )}

          {refinementTurns > 0 && (
            <>
              <h4>Provenance</h4>
              <ul className={styles.trace}>
                {(refinementTrace as Array<Record<string, unknown>>).map(
                  (turn, index) => (
                    <li key={`${String(turn["turn"] ?? index)}-${index}`}>
                      turn {String(turn["turn"] ?? "?")},{" "}
                      {String(turn["source"] ?? "?")},{" "}
                      {String(turn["disposition"] ?? "?")}
                    </li>
                  )
                )}
              </ul>
            </>
          )}

          {reportOpen && (
            <ReportDialog
              source={{ kind: "run", runId }}
              onClose={() => setReportOpen(false)}
            />
          )}
        </>
      )}
    </section>
  );
}
