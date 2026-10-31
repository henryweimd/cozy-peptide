"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import styles from "../page.module.css";
import { StructureGuide } from "../peptide-viewer";

const PeptideViewer = dynamic(() => import("../peptide-viewer"), {
  ssr: false,
  loading: () => <p className={styles.note}>Loading 3D viewer…</p>,
});
import {
  DEMO_CHARGE_TARGET,
  DEMO_COOLDOWN_SECONDS,
  DEMO_PRESETS,
} from "../../lib/demo-config";
import { CUSTOM_TARGET_MAX_LENGTH } from "../../lib/target-guard";
import type { PipelinePayload, StageEvent } from "../pipeline-shared";
import {
  EventLog,
  HandoffDownloads,
  StageDetail,
  formatCountdown,
  parseSseFrame,
} from "../pipeline-shared";

const COOLDOWN_KEY = "cozy-peptide-demo-cooldown-until";
const LOOP_ORDER = ["L1", "L2", "L3", "L4", "L5"];

const MODALITIES = [
  { value: "knottin-6c", label: "Knottin 6C" },
  { value: "disulfide-4c", label: "Disulfide 4C" },
  { value: "disulfide-2c", label: "Disulfide 2C" },
  { value: "linear", label: "Linear" },
] as const;

const CHARGES = [1, 2, 3, 4] as const;

/**
 * Full designer: preset conditions with scaffold, charge, and research
 * controls over the same demo rails (preset allowlist, shared
 * per-visitor cooldown, no token).
 */
export default function Designer() {
  const [presetId, setPresetId] = useState<string>(DEMO_PRESETS[0]?.id ?? "");
  const [custom, setCustom] = useState("");
  const customActive = presetId === "other";
  const [modality, setModality] = useState<string>("knottin-6c");
  const [charge, setCharge] = useState<number>(DEMO_CHARGE_TARGET);
  const [research, setResearch] = useState(true);
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
    cooldownUntil === null ? 0 : Math.ceil((cooldownUntil - now) / 1000);
  const cooling = remaining > 0;
  const busy = loading || cooling;

  function lockCooldown(retryAfterSeconds: number): void {
    const until = Date.now() + retryAfterSeconds * 1000;
    setCooldownUntil(until);
    window.localStorage.setItem(COOLDOWN_KEY, String(until));
  }

  async function generate(): Promise<void> {
    const preset = DEMO_PRESETS.find((entry) => entry.id === presetId);
    const target = customActive ? custom.trim() : (preset?.target ?? "");
    if (target.length === 0 || loading || cooling) {
      if (customActive && custom.trim().length === 0 && !loading && !cooling) {
        setError("Describe a gut condition first.");
      }
      return;
    }
    setLoading(true);
    setElapsed(0);
    setError(null);
    setResult(null);
    setEvents([]);
    try {
      const response = await fetch("/api/demo-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          charge_target: charge,
          modality,
          research,
        }),
      });
      if (!response.ok || response.body === null) {
        const payload = (await response
          .json()
          .catch(() => null)) as PipelinePayload | null;
        setError(payload?.error ?? `Request failed (${response.status}).`);
        // Only rate limits consume the cooldown: validation and safety
        // refusals leave the visitor free to fix their input.
        if (response.status === 429) {
          lockCooldown(
            payload?.details?.retry_after_seconds ?? DEMO_COOLDOWN_SECONDS
          );
        }
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
          const frame = parseSseFrame(buffer.slice(0, split));
          buffer = buffer.slice(split + 2);
          if (frame.kind === "stage") {
            const stage = frame.event;
            setEvents((prev) =>
              prev.length >= 60 ? [...prev.slice(-59), stage] : [...prev, stage]
            );
          } else if (frame.kind === "result") {
            outcome = frame.payload;
          }
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

  const ok = result?.success === true;
  const candidate = ok ? result?.candidate : undefined;
  const audit = ok ? result?.symbolic_audit : undefined;
  const researchBrief = ok ? result?.research_provenance : undefined;
  const provenance = ok ? result?.neurosymbolic_provenance : undefined;
  const handoff = ok ? result?.lab_handoff : undefined;
  const specificity = ok ? result?.specificity : undefined;
  const showFeed = loading || events.length > 0;
  const finished = !loading && (result !== null || error !== null);
  const loopEntries = LOOP_ORDER.filter(
    (loop) => candidate?.grammar_breakdown[loop] !== undefined
  );

  return (
    <div className={styles.designer}>
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
        <button
          key="other"
          type="button"
          aria-pressed={customActive}
          aria-expanded={customActive}
          className={
            customActive
              ? `${styles.cell} ${styles.cellActive}`
              : styles.cell
          }
          onClick={() => setPresetId("other")}
        >
          Other…
        </button>
      </div>
      {customActive && (
        <div className={styles.otherwrap}>
          <label className={styles.optlabel} htmlFor="designer-other-target">
            Describe the gut condition
          </label>
          <input
            id="designer-other-target"
            type="text"
            className={styles.otherinput}
            value={custom}
            maxLength={CUSTOM_TARGET_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. bile acid diarrhea"
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void generate();
            }}
          />
        </div>
      )}

      <div className={styles.optrow}>
        <div
          className={styles.cells}
          role="group"
          aria-label="Peptide scaffold"
        >
          <span className={styles.optlabel} aria-hidden="true">
            Scaffold
          </span>
          {MODALITIES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={modality === entry.value}
              className={
                modality === entry.value
                  ? `${styles.cell} ${styles.cellActive}`
                  : styles.cell
              }
              onClick={() => setModality(entry.value)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div
          className={styles.cells}
          role="group"
          aria-label="Formal charge target"
        >
          <span className={styles.optlabel} aria-hidden="true">
            Charge
          </span>
          {CHARGES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={charge === value}
              className={
                charge === value
                  ? `${styles.cell} ${styles.cellActive}`
                  : styles.cell
              }
              onClick={() => setCharge(value)}
            >
              +{value}
            </button>
          ))}
        </div>
      </div>

      <label className={styles.checkrow}>
        <input
          type="checkbox"
          checked={research}
          onChange={(event) => setResearch(event.target.checked)}
        />
        <span>
          Literature research stage — ground the prompt in PubMed and
          Europe PMC before generating
        </span>
      </label>

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
        Same demo rails as the landing page: presets or your own gut
        condition under Other, one design per minute per visitor,
        cooldown shared across both pages.
      </p>

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
        <StageDetail
          events={events}
          finished={finished}
          failed={error !== null && !loading}
        />
        {showFeed && <EventLog events={events} logRef={logRef} />}
      </div>

      {error !== null && !loading && (
        <p className={styles.errorbox} role="alert">
          {error}
        </p>
      )}

      {ok && candidate !== undefined && audit !== undefined && (
        <div className={styles.result}>
          <section aria-label="Designed sequence">
            <h3>Designed sequence</h3>
            <p className={styles.sequence}>{candidate.mature_sequence}</p>
            <p className={styles.topology}>
              {candidate.id !== undefined ? `${candidate.id}, ` : ""}
              {candidate.topology}
            </p>
            {result?.requested_target !== undefined &&
              result.target !== undefined && (
                <p className={styles.interpreted}>
                  Interpreted as: {result.target}
                </p>
              )}
          </section>

          <section aria-label="Predicted structure">
            <h3>Predicted structure</h3>
            <PeptideViewer sequence={candidate.mature_sequence} />
            <StructureGuide />
          </section>

          {researchBrief !== undefined && (
            <section aria-label="Literature brief">
              <h3>Literature brief</h3>
              <p className={styles.handoffline}>
                {researchBrief.status === "ok"
                  ? `Converged from ${researchBrief.evidence_count ?? 0} papers`
                  : researchBrief.status === "disabled"
                    ? "Disabled — static prompt"
                    : `Fallback to the static prompt (${researchBrief.reason ?? researchBrief.status})`}
              </p>
              {researchBrief.brief !== undefined &&
                researchBrief.brief !== null && (
                  <ul className={styles.trace}>
                    {researchBrief.brief.targets.map((entry) => (
                      <li key={`t-${entry.name}`}>
                        target: {entry.name}
                      </li>
                    ))}
                    {researchBrief.brief.mechanisms.map((entry) => (
                      <li key={`m-${entry.name}`}>
                        mechanism: {entry.name}
                      </li>
                    ))}
                    {researchBrief.brief.avoid.map((entry) => (
                      <li key={`a-${entry.name}`}>avoid: {entry.name}</li>
                    ))}
                  </ul>
                )}
            </section>
          )}

          <section aria-label="Audit ledger">
            <h3>Audit ledger</h3>
            <dl className={styles.metrics}>
              <div>
                <dt>Charge</dt>
                <dd>+{audit.charge}</dd>
              </div>
              <div>
                <dt>Therapeutic</dt>
                <dd>{audit.therapeutic_index?.toFixed(1) ?? "–"}</dd>
              </div>
              <div>
                <dt>Safety</dt>
                <dd>{audit.safety_index?.toFixed(1) ?? "–"}</dd>
              </div>
              <div>
                <dt>GRAVY</dt>
                <dd>{audit.gravy}</dd>
              </div>
            </dl>
            <p className={styles.cleared}>
              {audit.liabilities_cleared.map((name) => (
                <span key={name}>✓ {name}</span>
              ))}
            </p>
          </section>

          {loopEntries.length > 0 && (
            <section aria-label="Loop grammar">
              <h3>Loop grammar</h3>
              <ul className={styles.loopchips}>
                {loopEntries.map((loop) => (
                  <li key={loop}>
                    <span>{loop}</span>
                    <code>
                      {candidate.grammar_breakdown[loop] ?? "—"}
                    </code>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
            </section>
          )}

          {handoff !== undefined && result !== null && (
            <section aria-label="Lab handoff">
              <h3>Lab handoff</h3>
              <p className={styles.handoffline}>
                {handoff.synthesis_order.sequence_name},{" "}
                {handoff.synthesis_order.dna_length} bp, CAI {handoff.cai},
                scrub {handoff.restriction_scrub.status}
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
    </div>
  );
}
