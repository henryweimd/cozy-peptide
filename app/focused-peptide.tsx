"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import styles from "./page.module.css";
import SectionIcon from "./section-icons";
import {
  ChassisTable,
  ContainmentSummary,
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
import { LAB_TOKEN_KEY } from "./lab-guide/guide";

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
  "containment",
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
interface CroAnalysisView {
  id: string;
  createdAt: string;
  imageUrl: string | null;
  concepts: string[];
  count: number;
  foregroundPixels: number;
  maskSvg: string;
}

function asCroAnalyses(value: unknown): CroAnalysisView[] | null {
  const data =
    typeof value === "object" && value !== null
      ? (value as { data?: { analyses?: unknown } }).data?.analyses
      : null;
  if (!Array.isArray(data)) return null;
  return data.flatMap((row): CroAnalysisView[] => {
    if (typeof row !== "object" || row === null) return [];
    const record = row as Record<string, unknown>;
    if (typeof record["id"] !== "string") return [];
    return [
      {
        id: record["id"],
        createdAt:
          typeof record["createdAt"] === "string" ? record["createdAt"] : "",
        imageUrl:
          typeof record["imageUrl"] === "string" ? record["imageUrl"] : null,
        concepts: Array.isArray(record["concepts"])
          ? (record["concepts"] as unknown[]).filter(
              (c): c is string => typeof c === "string"
            )
          : [],
        count: typeof record["count"] === "number" ? record["count"] : 0,
        foregroundPixels:
          typeof record["foregroundPixels"] === "number"
            ? record["foregroundPixels"]
            : 0,
        maskSvg: typeof record["maskSvg"] === "string" ? record["maskSvg"] : "",
      },
    ];
  });
}

function CroLedger({ runId }: { runId: string }): React.ReactElement {
  const [analyses, setAnalyses] = useState<CroAnalysisView[] | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    let token = "";
    try {
      token = window.localStorage.getItem(LAB_TOKEN_KEY) ?? "";
    } catch {
      token = "";
    }
    if (token === "") {
      const frame = requestAnimationFrame(() => {
        if (live) setNote("Save your API token in the Lab Guide to view image checks.");
      });
      return () => {
        live = false;
        cancelAnimationFrame(frame);
      };
    }
    fetch(`/api/analyze-image?run=${encodeURIComponent(runId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("cro"))
      )
      .then((body: unknown) => {
        if (!live) return;
        const parsed = asCroAnalyses(body);
        if (parsed === null) {
          setNote("Couldn't load image checks.");
          return;
        }
        setAnalyses(parsed);
      })
      .catch(() => {
        if (live) setNote("Couldn't load image checks.");
      });
    return () => {
      live = false;
    };
  }, [runId]);

  if (note !== "") return <p className={styles.note}>{note}</p>;
  if (analyses === null)
    return <p className={styles.note}>Loading image checks…</p>;
  if (analyses.length === 0)
    return (
      <p className={styles.note}>
        No CRO image checks saved for this run yet.
      </p>
    );
  return (
    <>
      {analyses.map((analysis) => (
        <div key={analysis.id} className={styles.croThumb}>
          {analysis.imageUrl !== null && (
            <div className={styles.croViewer}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={analysis.imageUrl} alt={analysis.concepts.join(", ")} />
              {analysis.maskSvg !== "" && (
                <div
                  className={styles.croOverlay}
                  dangerouslySetInnerHTML={{ __html: analysis.maskSvg }}
                />
              )}
            </div>
          )}
          <p className={styles.note}>
            {analysis.concepts.join(" + ")} — {analysis.count} found,{" "}
            {analysis.foregroundPixels.toLocaleString()} foreground px
            {analysis.createdAt !== "" &&
              `, ${new Date(analysis.createdAt).toLocaleDateString()}`}
          </p>
        </div>
      ))}
    </>
  );
}

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
  const chassisBlob =
    shown !== null ? asRecord(pick(shown, "chassis", "chassis")) : null;
  const biocontainmentBlob =
    shown !== null
      ? asRecord(pick(shown, "biocontainment", "biocontainment"))
      : null;
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
          ...(chassisBlob !== null
            ? {
                chassis: chassisBlob as PipelinePayload["chassis"],
              }
            : {}),
          ...(biocontainmentBlob !== null
            ? {
                biocontainment:
                  biocontainmentBlob as PipelinePayload["biocontainment"],
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
          <h3>
            <SectionIcon name="ledger" />
            From the ledger
          </h3>
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
          <h4>
            <SectionIcon name="pulse" />
            Design status
          </h4>
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
              <h4>
                <SectionIcon name="list" />
                Parameters
              </h4>
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
                    <dd>{requestBlob["modality"] as string}</dd>
                  </div>
                )}
                {typeof requestBlob["host"] === "string" && (
                  <div>
                    <dt>Chassis</dt>
                    <dd>{requestBlob["host"] as string}</dd>
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
                hostId={
                  handoffBlob !== null
                    ? (asString(handoffBlob["host"]) ?? undefined)
                    : undefined
                }
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
              <h4>
                <SectionIcon name="document" />
                Literature brief
              </h4>
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
                  Read the brief
                </button>
              </div>
            </>
          )}

          {sequence.length > 0 && (
            <>
              <h4>
                <SectionIcon name="cube" />
                Predicted structure
              </h4>
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
              <h4>
                <SectionIcon name="clipboard" />
                Audit ledger
              </h4>
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
              <h4>
                <SectionIcon name="target" />
                Specificity review
              </h4>
              <p className={styles.handoffline}>{specificityLine}</p>
            </>
          )}

          {chassisBlob !== null &&
            Array.isArray(chassisBlob["compatibility"]) && (
              <>
                <h4>
                  <SectionIcon name="microbe" />
                  Chassis compatibility
                </h4>
                <ChassisTable
                  chassis={
                    chassisBlob as unknown as NonNullable<
                      PipelinePayload["chassis"]
                    >
                  }
                />
              </>
            )}

          {biocontainmentBlob !== null &&
            Array.isArray(biocontainmentBlob["auxotrophy"]) && (
              <>
                <h4>
                <SectionIcon name="shield" />
                Biocontainment
              </h4>
                <ContainmentSummary
                  biocontainment={
                    biocontainmentBlob as unknown as NonNullable<
                      PipelinePayload["biocontainment"]
                    >
                  }
                />
              </>
            )}

          {downloadResult !== null && (
            <>
              <h4>
                <SectionIcon name="flask" />
                Lab handoff
              </h4>
              <HandoffDownloads result={downloadResult} />
              <p className={styles.handoffline}>
                <Link href={`/lab-guide?run=${runId}`}>
                  Open the Lab Guide — bench steps plus result upload
                </Link>
              </p>
            </>
          )}

          <>
            <h4>
              <SectionIcon name="document" />
              CRO image checks
            </h4>
            <CroLedger runId={runId} />
          </>

          {refinementTurns > 0 && (
            <>
              <h4>
                <SectionIcon name="link" />
                Provenance
              </h4>
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
