"use client";

import type { RefObject } from "react";
import styles from "./page.module.css";

/**
 * Shared pipeline UI vocabulary for the landing demo and the full
 * designer page: stage model, SSE frame parsing, telemetry widgets,
 * and time formatting. Pure helpers plus presentational components —
 * each page keeps its own run state and result layout.
 */

export type StageName =
  | "research"
  | "propose"
  | "verify"
  | "repair"
  | "synthesize"
  | "handoff";

export interface StageEvent {
  stage: StageName;
  turn: number;
  message: string;
  source?: string;
  candidate?: string;
  grammarValid?: boolean;
  auditPassed?: boolean;
  issues?: number;
  diagnostic?: string;
  temperature?: number;
  elapsedMs?: number;
}

export interface TraceTurn {
  turn: number;
  candidate: string;
  grammar_valid: boolean;
  audit_passed: boolean;
  disposition: string;
  source: string;
}

export interface ResearchEntry {
  name: string;
  rationale: string;
}

export interface PipelinePayload {
  success: boolean;
  run_id?: string;
  error?: string;
  details?: { retry_after_seconds?: number };
  target?: string;
  requested_target?: string;
  modality?: string;
  neurosymbolic_provenance?: {
    proposer_model?: string;
    compiler_refinement_cycles: number;
    target_class?: string;
    refinement_trace: TraceTurn[];
  };
  research_provenance?: {
    status: string;
    reason?: string;
    latency_ms?: number;
    evidence_count?: number;
    cached?: boolean;
    brief?: {
      targets: ResearchEntry[];
      mechanisms: ResearchEntry[];
      avoid: ResearchEntry[];
      citations: Array<{ ref: string; note: string }>;
    } | null;
    evidence?: Array<{
      source: string;
      id: string;
      title: string;
      snippet: string;
      url: string;
      year: string | null;
    }>;
  };
  candidate?: {
    id?: string;
    sequence?: string;
    mature_sequence: string;
    length?: number;
    topology: string;
    grammar_breakdown: Record<string, string>;
  };
  symbolic_audit?: {
    passed: boolean;
    charge: number;
    charge_target?: number;
    gravy: number;
    boman_index: number;
    aliphatic_index: number;
    therapeutic_index?: number;
    safety_index?: number;
    liabilities_cleared: string[];
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
  specificity?: {
    checked: boolean;
    pass: boolean;
    predicted_targets: string[];
    off_targets: string[];
    warnings: string[];
    reason: string;
  };
}

export interface StageDef {
  name: StageName;
  title: string;
  sub: string;
}

export const STAGES: StageDef[] = [
  {
    name: "research",
    title: "Literature research",
    sub: "Targets and mechanisms from papers",
  },
  {
    name: "propose",
    title: "Semantic proposal",
    sub: "Muse Spark 1.3 drafts candidates",
  },
  {
    name: "verify",
    title: "Grammar + audit",
    sub: "Loop topology, charge, liabilities",
  },
  {
    name: "repair",
    title: "Compiler repair",
    sub: "Diagnostics-guided revision",
  },
  {
    name: "synthesize",
    title: "Synthesis backstop",
    sub: "Deterministic grammar sampler",
  },
  { name: "handoff", title: "Lab handoff", sub: "Yeast cassette and DNA order" },
];

export type StageState =
  | "idle"
  | "active"
  | "done"
  | "bypassed"
  | "error"
  | "unreached";

export function stageState(
  events: StageEvent[],
  finished: boolean,
  stage: StageName,
  failed = false
): StageState {
  const seen = events.some((event) => event.stage === stage);
  if (!seen) {
    if (failed) return "unreached";
    if (finished && (stage === "repair" || stage === "research")) {
      return "bypassed";
    }
    // A finished, unfailed run necessarily passed through its core
    // stages; unseen ones aged out of the capped event window.
    if (finished) return "done";
    return "idle";
  }
  if (failed && events[events.length - 1]?.stage === stage) return "error";
  if (finished) return "done";
  const latest = events[events.length - 1];
  return latest?.stage === stage ? "active" : "done";
}

export function stageElapsed(
  events: StageEvent[],
  stage: StageName
): string | null {
  const matches = events.filter((event) => event.stage === stage);
  const last = matches[matches.length - 1];
  if (last?.elapsedMs === undefined) return null;
  return `+${Math.floor(last.elapsedMs / 1000)}s`;
}

function mark(value: boolean | undefined): string {
  if (value === undefined) return "–";
  return value ? "✓" : "✗";
}

export function logLine(event: StageEvent): string {
  const stamp = `+${Math.floor((event.elapsedMs ?? 0) / 1000)}s`;
  const bits = [`turn ${event.turn}`];
  if (event.candidate !== undefined) bits.push(event.candidate);
  bits.push(event.message);
  if (event.stage === "verify" && event.issues !== undefined) {
    const checks = `grammar ${mark(event.grammarValid)}, audit ${mark(event.auditPassed)}`;
    bits.push(event.issues > 0 ? `${checks}, ${event.issues} faults` : checks);
  }
  return `[${stamp}] ${bits.join(", ")}`;
}

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Compact relative time for the recent-designs strip. */
export function timeAgo(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export type SseFrame =
  | { kind: "stage"; event: StageEvent }
  | { kind: "result"; payload: PipelinePayload }
  | { kind: "run"; runId: string }
  | { kind: "none" };

/** Parses one SSE frame (events split on blank lines by the caller). */
export function parseSseFrame(frame: string): SseFrame {
  let eventName = "";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return { kind: "none" };
  let data: unknown = null;
  try {
    data = JSON.parse(dataLines.join("\n")) as unknown;
  } catch {
    return { kind: "none" };
  }
  if (eventName === "stage") {
    return { kind: "stage", event: data as StageEvent };
  }
  if (eventName === "result" || eventName === "error") {
    return { kind: "result", payload: data as PipelinePayload };
  }
  if (eventName === "run") {
    const record =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : null;
    const runId = record !== null ? record["runId"] : null;
    if (typeof runId === "string" && runId.length > 0) {
      return { kind: "run", runId };
    }
  }
  return { kind: "none" };
}

/** Safe filename stem from a construct id (alphanumeric, dash, dot). */
export function safeStem(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_.-]+/g, "-");
  return cleaned.length > 0 ? cleaned : "peptide";
}

/** Triggers a client-side text download without a server round-trip. */
export function downloadTextFile(
  filename: string,
  text: string,
  mime = "text/plain"
): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Wraps a gBlock sequence as an 80-column FASTA document. */
export function gblockFasta(name: string, dna: string): string {
  const lines = [`>${name} gblock`];
  for (let i = 0; i < dna.length; i += 80) {
    lines.push(dna.slice(i, i + 80));
  }
  return `${lines.join("\n")}\n`;
}

function stageGlyph(state: StageState): string {
  switch (state) {
    case "done":
      return "✓";
    case "active":
      return "●";
    case "bypassed":
      return "–";
    case "error":
      return "✗";
    default:
      return "○";
  }
}

function stageLabel(state: StageState, isNext: boolean): string {
  if (isNext) return "Next";
  switch (state) {
    case "done":
      return "Done";
    case "active":
      return "Running";
    case "bypassed":
      return "Skipped";
    case "error":
      return "Failed";
    case "unreached":
      return "Not reached";
    default:
      return "Pending";
  }
}

function stageReason(stage: StageName, state: StageState): string | null {
  if (state === "bypassed") {
    return stage === "research"
      ? "Static prompt used"
      : "No repair needed";
  }
  if (state === "error") return "Failed here — see the error below";
  if (state === "unreached") return "Run stopped before this stage";
  return null;
}

/**
 * Vertical pipeline timeline: every stage with an explicit status
 * word (Running, Done, Next, Pending, Skipped, Failed, Not reached),
 * the skip/failure reason inline, and per-stage timestamps.
 */
export function StageDetail({
  events,
  finished,
  failed = false,
}: {
  events: StageEvent[];
  finished: boolean;
  failed?: boolean;
}): React.ReactElement {
  const showSynthesis = events.some(
    (event) => event.stage === "synthesize"
  );
  const visible = STAGES.filter(
    (stage) => stage.name !== "synthesize" || showSynthesis
  );
  const states = visible.map((stage) =>
    stageState(events, finished, stage.name, failed)
  );
  // Next: the first pending stage at or after the running one, or the
  // first stage when the run has emitted nothing yet.
  let nextIndex = -1;
  if (!finished && !failed) {
    const activeIndex = states.findIndex((state) => state === "active");
    nextIndex = visible.findIndex(
      (_stage, index) =>
        index >= activeIndex &&
        (states[index] === "idle" || states[index] === "unreached")
    );
  }
  return (
    <ol className={styles.stages} aria-label="Pipeline stages">
      {visible.map((stage, index) => {
        const state = states[index] ?? "idle";
        const isNext = index === nextIndex;
        const stamp = stageElapsed(events, stage.name);
        const reason = stageReason(stage.name, state);
        return (
          <li
            key={stage.name}
            data-state={state}
            data-next={isNext || undefined}
            aria-current={state === "active" ? "step" : undefined}
          >
            <span className={styles.stagemark} aria-hidden="true">
              {stageGlyph(state)}
            </span>
            <span className={styles.stageline}>
              <span className={styles.stagerow}>
                <strong>{stage.title}</strong>
                <span className={styles.stagepill}>
                  {stageLabel(state, isNext)}
                </span>
              </span>
              <span className={styles.stagesub}>
                {reason ?? stage.sub}
              </span>
            </span>
            {stamp !== null && (
              <span className={styles.stagestamp}>{stamp}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Lab handoff downloads: DNA order CSV, gBlock FASTA, full JSON. */
export function HandoffDownloads({
  result,
}: {
  result: PipelinePayload;
}): React.ReactElement | null {
  const handoff = result.lab_handoff;
  const orderName = handoff?.synthesis_order?.sequence_name;
  if (handoff === undefined || typeof orderName !== "string") return null;
  const stem = safeStem(orderName);
  const gblock = handoff.dna_gblock ?? handoff.gblock_manifest;
  return (
    <div
      className={styles.downloadrow}
      role="group"
      aria-label="Download lab handoff files"
    >
      {handoff.order_csv !== undefined && (
        <button
          type="button"
          className={styles.btn}
          onClick={() =>
            downloadTextFile(`${stem}.order.csv`, handoff.order_csv ?? "", "text/csv")
          }
        >
          DNA order (.csv)
        </button>
      )}
      {gblock !== undefined && (
        <button
          type="button"
          className={styles.btn}
          onClick={() =>
            downloadTextFile(
              `${stem}.gblock.fasta`,
              gblockFasta(orderName, gblock),
              "text/plain"
            )
          }
        >
          gBlock (.fasta)
        </button>
      )}
      <button
        type="button"
        className={styles.btn}
        onClick={() =>
          downloadTextFile(
            `${stem}.result.json`,
            JSON.stringify(result, null, 2),
            "application/json"
          )
        }
      >
        Full result (.json)
      </button>
    </div>
  );
}

/** Scrolling event log. */
export function EventLog({
  events,
  logRef,
}: {
  events: StageEvent[];
  logRef: RefObject<HTMLDivElement | null>;
}): React.ReactElement {
  return (
    <div className={styles.log} ref={logRef} aria-label="Event log">
      {events.map((event, index) => (
        <p key={`${event.turn}-${event.stage}-${index}`}>
          {logLine(event)}
        </p>
      ))}
    </div>
  );
}
