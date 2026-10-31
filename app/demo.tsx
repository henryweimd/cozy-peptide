"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";
import {
  DEMO_COOLDOWN_SECONDS,
  DEMO_PRESETS,
} from "../lib/demo-config";

type StageName = "propose" | "verify" | "repair" | "synthesize" | "handoff";

interface StageEvent {
  stage: StageName;
  turn: number;
  message: string;
  source?: string;
  candidate?: string;
  grammarValid?: boolean;
  auditPassed?: boolean;
  issues?: number;
  elapsedMs?: number;
}

interface TraceTurn {
  turn: number;
  candidate: string;
  grammar_valid: boolean;
  audit_passed: boolean;
  disposition: string;
  source: string;
}

interface DemoPayload {
  success: boolean;
  error?: string;
  details?: { retry_after_seconds?: number };
  neurosymbolic_provenance?: {
    compiler_refinement_cycles: number;
    refinement_trace: TraceTurn[];
  };
  candidate?: {
    id: string;
    sequence: string;
    length: number;
    cysteine_indices: number[];
    loop_segments: string[];
    biophysical_profile: {
      net_charge_ph74: number;
      isoelectric_point: number;
      gravy_score: number;
      boman_index: number;
    };
    cloning_payload: {
      dna_sequence: string;
      cassette_format: string;
      full_cassette_dna: string;
      gc_percent_cds: number;
      gc_ok: boolean;
      payload_cai: number;
      restriction_scrub: { status: string };
    };
    verification_report: {
      kex2_clean: boolean;
      glycosylation_clean: boolean;
      charge_window_ok: boolean;
      protease_clean: boolean;
      n_terminus_ok: boolean;
      hydrophobic_runs_ok: boolean;
      gravy_ok: boolean;
      ick_topology_ok: boolean;
      passed: boolean;
    };
    mature_sequence: string;
    topology: string;
    grammar_breakdown: Record<string, string>;
  };
  symbolic_audit?: {
    passed: boolean;
    charge: number;
    net_charge_ph74: number;
    gravy: number;
    boman_index: number;
    aliphatic_index: number;
    liabilities_cleared: string[];
  };
  lab_handoff?: {
    cai: number;
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

const COOLDOWN_KEY = "cozy-peptide-demo-cooldown-until";
const LOOP_ORDER = ["L1", "L2", "L3", "L4", "L5"];

interface StageDef {
  name: StageName;
  title: string;
  sub: string;
}

const STAGES: StageDef[] = [
  { name: "propose", title: "Semantic proposal", sub: "Muse Spark 1.3 drafts candidates" },
  { name: "verify", title: "Grammar + audit", sub: "Loop topology · charge · liabilities" },
  { name: "repair", title: "Compiler repair", sub: "Diagnostics-guided revision" },
  { name: "synthesize", title: "Synthesis backstop", sub: "Deterministic grammar sampler" },
  { name: "handoff", title: "Lab handoff", sub: "Yeast cassette + DNA order" },
];

type StageState = "idle" | "active" | "done" | "bypassed";

function stageState(
  events: StageEvent[],
  finished: boolean,
  stage: StageName
): StageState {
  const seen = events.some((event) => event.stage === stage);
  if (!seen) {
    if (finished && stage === "repair") return "bypassed";
    return "idle";
  }
  if (finished) return "done";
  const latest = events[events.length - 1];
  return latest?.stage === stage ? "active" : "done";
}

function stageElapsed(events: StageEvent[], stage: StageName): string | null {
  const matches = events.filter((event) => event.stage === stage);
  const last = matches[matches.length - 1];
  if (last?.elapsedMs === undefined) return null;
  return `+${Math.floor(last.elapsedMs / 1000)}s`;
}

function mark(value: boolean | undefined): string {
  if (value === undefined) return "·";
  return value ? "✓" : "✗";
}

function logLine(event: StageEvent): string {
  const stamp = `+${Math.floor((event.elapsedMs ?? 0) / 1000)}s`;
  const bits = [`turn ${event.turn}`];
  if (event.candidate !== undefined) bits.push(event.candidate);
  bits.push(event.message);
  if (event.stage === "verify" && event.issues !== undefined) {
    bits.push(
      `grammar ${mark(event.grammarValid)} audit ${mark(event.auditPassed)}`
    );
    if (event.issues > 0) bits.push(`${event.issues} fault(s)`);
  }
  return `[${stamp}] ${bits.join(" · ")}`;
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function Demo() {
  const [presetId, setPresetId] = useState<string>(DEMO_PRESETS[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [events, setEvents] = useState<StageEvent[]>([]);
  const [result, setResult] = useState<DemoPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(COOLDOWN_KEY);
    if (stored !== null) {
      const until = Number.parseInt(stored, 10);
      if (Number.isFinite(until) && until > Date.now()) {
        // Mount-only sync from an external store (localStorage); a lazy
        // useState initializer would mismatch the server render instead.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCooldownUntil(until);
      }
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      500
    );
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    const log = logRef.current;
    if (log !== null) log.scrollTop = log.scrollHeight;
  }, [events.length]);

  const remaining =
    cooldownUntil === null
      ? 0
      : Math.ceil((cooldownUntil - now) / 1000);
  const cooling = remaining > 0;
  const busy = loading || cooling;

  function lockCooldown(retryAfterSeconds: number): void {
    const until = Date.now() + retryAfterSeconds * 1000;
    setCooldownUntil(until);
    window.localStorage.setItem(COOLDOWN_KEY, String(until));
  }

  function handleFrame(frame: string): DemoPayload | null {
    let eventName = "";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return null;
    let data: unknown = null;
    try {
      data = JSON.parse(dataLines.join("\n")) as unknown;
    } catch {
      return null;
    }
    if (eventName === "stage") {
      const stage = data as StageEvent;
      setEvents((prev) =>
        prev.length >= 60 ? [...prev.slice(-59), stage] : [...prev, stage]
      );
      return null;
    }
    if (eventName === "result" || eventName === "error") {
      return data as DemoPayload;
    }
    return null;
  }

  async function generate(): Promise<void> {
    const preset = DEMO_PRESETS.find((entry) => entry.id === presetId);
    if (preset === undefined || loading || cooling) return;
    setLoading(true);
    setElapsed(0);
    setError(null);
    setResult(null);
    setEvents([]);
    try {
      const response = await fetch("/api/demo-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: preset.target }),
      });
      if (!response.ok || response.body === null) {
        const payload = (await response
          .json()
          .catch(() => null)) as DemoPayload | null;
        setError(
          payload?.error ?? `Request failed (${response.status}).`
        );
        lockCooldown(
          payload?.details?.retry_after_seconds ?? DEMO_COOLDOWN_SECONDS
        );
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let outcome: DemoPayload | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf("\n\n");
        while (split !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const payload = handleFrame(frame);
          if (payload !== null) outcome = payload;
          split = buffer.indexOf("\n\n");
        }
      }
      if (outcome !== null && outcome.success) {
        setResult(outcome);
      } else {
        setError(outcome?.error ?? "Stream ended without a result.");
      }
      lockCooldown(DEMO_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      lockCooldown(DEMO_COOLDOWN_SECONDS);
    } finally {
      setLoading(false);
    }
  }

  const audit = result?.success === true ? result.symbolic_audit : undefined;
  const candidate =
    result?.success === true ? result.candidate : undefined;
  const provenance =
    result?.success === true ? result.neurosymbolic_provenance : undefined;
  const handoff = result?.success === true ? result.lab_handoff : undefined;
  const specificity =
    result?.success === true ? result.specificity : undefined;
  const showFeed = loading || events.length > 0;
  const finished = !loading && (result !== null || error !== null);
  const showSynthesis = events.some(
    (event) => event.stage === "synthesize"
  );

  return (
    <div>
      <div
        className={styles.presets}
        role="group"
        aria-label="Condition to design for"
      >
        {DEMO_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={preset.id === presetId}
            className={
              preset.id === presetId
                ? `${styles.pill} ${styles.pillActive}`
                : styles.pill
            }
            onClick={() => setPresetId(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className={styles.generateRow}>
        <button
          type="button"
          className={styles.generateButton}
          disabled={busy}
          onClick={() => void generate()}
        >
          {loading
            ? `Designing… ${elapsed}s`
            : cooling
              ? `Next design in ${formatCountdown(remaining)}`
              : "Design my peptide"}
        </button>
      </div>
      <p className={styles.demoNote}>
        Runs the live pipeline in your browser · one design per minute per
        visitor · preset conditions only · no token needed.
      </p>

      {showFeed && (
        <div className={styles.feed} aria-live="polite">
          <div className={styles.feedHead}>
            <span className={styles.feedTitle}>Pipeline telemetry</span>
            <span className={styles.feedLive}>
              <span
                className={loading ? styles.dot : styles.dotIdle}
                aria-hidden="true"
              />
              {loading ? `live · ${elapsed}s` : `done · ${elapsed}s`}
            </span>
          </div>
          <ol className={styles.stages}>
            {STAGES.filter(
              (stage) => stage.name !== "synthesize" || showSynthesis
            ).map((stage) => {
              const state = stageState(events, finished, stage.name);
              const stamp = stageElapsed(events, stage.name);
              return (
                <li key={stage.name} data-state={state}>
                  <span className={styles.stageMark} aria-hidden="true">
                    {state === "done"
                      ? "✓"
                      : state === "active"
                        ? "●"
                        : state === "bypassed"
                          ? "–"
                          : "○"}
                  </span>
                  <span className={styles.stageText}>
                    <strong>{stage.title}</strong>
                    <span>{stage.sub}</span>
                  </span>
                  {stamp !== null && (
                    <span className={styles.stageStamp}>{stamp}</span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className={styles.log} ref={logRef} aria-label="Event log">
            {events.map((event, index) => (
              <p key={`${event.turn}-${event.stage}-${index}`}>
                {logLine(event)}
              </p>
            ))}
          </div>
        </div>
      )}

      {error !== null && !loading && (
        <p className={styles.errorBox} role="alert">
          {error}
        </p>
      )}

      {result?.success === true &&
        candidate !== undefined &&
        audit !== undefined && (
          <div className={styles.result}>
            <h3>Designed sequence</h3>
            <p className={styles.sequence}>{candidate.mature_sequence}</p>
            <p className={styles.topologyLine}>
              {candidate.id} · {candidate.length} aa · {candidate.topology}
            </p>
            <p className={styles.topologyLine}>
              Cys at [{candidate.cysteine_indices.join(", ")}]
            </p>

            <h3>Loop grammar</h3>
            <ul className={styles.loopChips}>
              {LOOP_ORDER.map((loop, index) => (
                <li key={loop}>
                  <span>{loop}</span>
                  <code>
                    {candidate.loop_segments[index] ??
                      candidate.grammar_breakdown[loop] ??
                      "—"}
                  </code>
                </li>
              ))}
            </ul>

            <h3>Audit ledger</h3>
            <dl className={styles.metrics}>
              <div>
                <dt>Charge</dt>
                <dd>+{audit.charge}</dd>
              </div>
              <div>
                <dt>pH 7.4</dt>
                <dd>+{candidate.biophysical_profile.net_charge_ph74}</dd>
              </div>
              <div>
                <dt>pI</dt>
                <dd>{candidate.biophysical_profile.isoelectric_point}</dd>
              </div>
              <div>
                <dt>GRAVY</dt>
                <dd>{audit.gravy}</dd>
              </div>
              <div>
                <dt>Boman</dt>
                <dd>{audit.boman_index}</dd>
              </div>
              <div>
                <dt>Aliphatic</dt>
                <dd>{audit.aliphatic_index}</dd>
              </div>
            </dl>
            <p className={styles.cleared}>
              {audit.liabilities_cleared.map((name) => (
                <span key={name}>✓ {name}</span>
              ))}
            </p>

            <h3>Verification report</h3>
            <p className={styles.cleared}>
              {(
                [
                  ["Kex2", candidate.verification_report.kex2_clean],
                  ["Glycosylation", candidate.verification_report.glycosylation_clean],
                  ["Charge +1…+4", candidate.verification_report.charge_window_ok],
                  ["Protease", candidate.verification_report.protease_clean],
                  ["N-terminus", candidate.verification_report.n_terminus_ok],
                  ["Runs ≤3", candidate.verification_report.hydrophobic_runs_ok],
                  ["GRAVY", candidate.verification_report.gravy_ok],
                  ["ICK", candidate.verification_report.ick_topology_ok],
                ] as const
              ).map(([label, ok]) => (
                <span key={label}>
                  {ok ? "✓" : "✗"} {label}
                </span>
              ))}
            </p>

            <h3>Cloning payload</h3>
            <p className={styles.handoffLine}>
              {candidate.cloning_payload.cassette_format} ·{" "}
              {candidate.cloning_payload.full_cassette_dna.length} bp · GC{" "}
              {candidate.cloning_payload.gc_percent_cds}% · CAI{" "}
              {candidate.cloning_payload.payload_cai} · scrub{" "}
              {candidate.cloning_payload.restriction_scrub.status}
            </p>

            {provenance !== undefined && (
              <>
                <h3>Provenance</h3>
                <ul className={styles.trace}>
                  {provenance.refinement_trace.map((turn, index) => (
                    <li key={`${turn.turn}-${index}`}>
                      turn {turn.turn} · {turn.source} ·{" "}
                      {turn.disposition}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {specificity !== undefined && (
              <>
                <h3>Specificity review</h3>
                <p className={styles.handoffLine}>
                  {specificity.checked
                    ? specificity.pass
                      ? "✓ blinded review confirms the intended target"
                      : `✗ ${specificity.reason}`
                    : `○ not checked — ${specificity.reason}`}
                </p>
                {specificity.predicted_targets.length > 0 && (
                  <ul className={styles.trace}>
                    {specificity.predicted_targets.map((target) => (
                      <li key={target}>predicted: {target}</li>
                    ))}
                  </ul>
                )}
                {specificity.off_targets.length > 0 && (
                  <ul className={styles.trace}>
                    {specificity.off_targets.map((flag) => (
                      <li key={flag}>off-target flag: {flag}</li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {handoff !== undefined && (
              <>
                <h3>Lab handoff</h3>
                <p className={styles.handoffLine}>
                  {handoff.synthesis_order.sequence_name} ·{" "}
                  {handoff.synthesis_order.dna_length} bp · CAI{" "}
                  {handoff.cai} · scrub{" "}
                  {handoff.restriction_scrub.status}
                </p>
              </>
            )}

            <details className={styles.rawJson}>
              <summary>Full JSON response</summary>
              <pre>
                <code>{JSON.stringify(result, null, 2)}</code>
              </pre>
            </details>
          </div>
        )}
    </div>
  );
}
