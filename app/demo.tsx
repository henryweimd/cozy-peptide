"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import styles from "./page.module.css";
import { StructureGuide } from "./peptide-viewer";

const PeptideViewer = dynamic(() => import("./peptide-viewer"), {
  ssr: false,
  loading: () => <p className={styles.note}>Loading 3D viewer…</p>,
});
import {
  DEMO_COOLDOWN_SECONDS,
  DEMO_PRESETS,
} from "../lib/demo-config";

import type { PipelinePayload, StageEvent } from "./pipeline-shared";
import {
  EventLog,
  HandoffDownloads,
  StageDetail,
  StageStrip,
  formatCountdown,
  parseSseFrame,
} from "./pipeline-shared";
import Recent from "./recent";

const COOLDOWN_KEY = "cozy-peptide-demo-cooldown-until";
const LOOP_ORDER = ["L1", "L2", "L3", "L4", "L5"];

export default function Demo() {
  const [presetId, setPresetId] = useState<string>(DEMO_PRESETS[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [events, setEvents] = useState<StageEvent[]>([]);
  const [result, setResult] = useState<PipelinePayload | null>(null);
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

  function handleFrame(frame: string): PipelinePayload | null {
    const parsed = parseSseFrame(frame);
    if (parsed.kind === "stage") {
      const stage = parsed.event;
      setEvents((prev) =>
        prev.length >= 60 ? [...prev.slice(-59), stage] : [...prev, stage]
      );
      return null;
    }
    if (parsed.kind === "result") return parsed.payload;
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
          .catch(() => null)) as PipelinePayload | null;
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
      let outcome: PipelinePayload | null = null;
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

  return (
    <section className={styles.board} id="demo" aria-labelledby="demo-title">
      <h2 className={styles.boardtitle} id="demo-title">
        Design a peptide in your browser
      </h2>
      <p className={styles.boardsub}>
        Pick a gut condition and run the real pipeline, proposal to lab
        handoff.
      </p>
      <div
        className={styles.cells}
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
                ? `${styles.cell} ${styles.cellActive}`
                : styles.cell
            }
            onClick={() => setPresetId(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary} ${styles.designbtn}`}
        disabled={busy}
        aria-busy={loading}
        onClick={() => void generate()}
      >
        {loading
          ? `Designing… ${elapsed}s`
          : cooling
            ? `Next design in ${formatCountdown(remaining)}`
            : "Design my peptide"}
      </button>
      <p className={styles.note}>
        Runs the live pipeline in your browser. One design per minute per
        visitor. Preset conditions only, no token needed.{" "}
        <Link className={styles.designerlink} href="/design">
          Open the full designer
        </Link>
      </p>
      <Recent />

      <div className={styles.feed} aria-live="polite">
        <div className={styles.feedhead}>
          <span className={styles.feedlabel}>Pipeline telemetry</span>
          <span className={styles.feedlive} role="status">
            {loading
              ? `live ${elapsed}s`
              : events.length > 0
                ? `done ${elapsed}s`
                : "standby"}
          </span>
        </div>
        <StageStrip events={events} finished={finished} />
        {showFeed && (
          <>
            <StageDetail events={events} finished={finished} />
            <EventLog events={events} logRef={logRef} />
          </>
        )}
      </div>

      {error !== null && !loading && (
        <p className={styles.errorbox} role="alert">
          {error}
        </p>
      )}

      {result?.success === true &&
        candidate !== undefined &&
        audit !== undefined && (
          <div className={styles.result}>
            <section aria-label="Designed sequence">
              <h3>Designed sequence</h3>
              <p className={styles.sequence}>{candidate.mature_sequence}</p>
              <p className={styles.topology}>{candidate.topology}</p>
            </section>

            <section aria-label="Predicted structure">
              <h3>Predicted structure</h3>
              <PeptideViewer sequence={candidate.mature_sequence} />
              <StructureGuide />
            </section>

            <section aria-label="Loop grammar">
              <h3>Loop grammar</h3>
              <ul className={styles.loopchips}>
                {LOOP_ORDER.map((loop) => (
                  <li key={loop}>
                    <span>{loop}</span>
                    <code>
                      {candidate.grammar_breakdown[loop] ?? "—"}
                    </code>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="Audit ledger">
              <h3>Audit ledger</h3>
              <dl className={styles.metrics}>
                <div>
                  <dt>Charge</dt>
                  <dd>+{audit.charge}</dd>
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
            </section>

            {provenance !== undefined && (
              <section aria-label="Provenance">
                <h3>Provenance</h3>
                <ul className={styles.trace}>
                  {provenance.refinement_trace.map((turn, index) => (
                    <li key={`${turn.turn}-${index}`}>
                      turn {turn.turn}, {turn.source}, {turn.disposition}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {specificity !== undefined && (
              <section aria-label="Specificity review">
                <h3>Specificity review</h3>
                <p className={styles.handoffline}>
                  {specificity.checked
                    ? specificity.pass
                      ? "✓ blinded review confirms the intended target"
                      : `✗ ${specificity.reason}`
                    : `○ not checked, ${specificity.reason}`}
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
              </section>
            )}

            {handoff !== undefined && result !== null && (
              <section aria-label="Lab handoff">
                <h3>Lab handoff</h3>
                <p className={styles.handoffline}>
                  {handoff.synthesis_order.sequence_name},{" "}
                  {handoff.synthesis_order.dna_length} bp, CAI{" "}
                  {handoff.cai}, scrub{" "}
                  {handoff.restriction_scrub.status}
                </p>
                <HandoffDownloads result={result} />
              </section>
            )}

            <details className={styles.rawjson}>
              <summary>Full JSON response</summary>
              <pre>
                <code>{JSON.stringify(result, null, 2)}</code>
              </pre>
            </details>
          </div>
        )}
    </section>
  );
}
