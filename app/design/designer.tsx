"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import styles from "../page.module.css";
import FocusedPeptide from "../focused-peptide";
import {
  parseDesignParams,
  type DesignParams,
} from "../../lib/design-params";

const PeptideViewer = dynamic(() => import("../peptide-viewer"), {
  ssr: false,
  loading: () => <p className={styles.note}>Loading 3D viewer…</p>,
});
import {
  DEMO_CHARGE_TARGET,
  DEMO_COOLDOWN_SECONDS,
  DEMO_PRESETS,
  GUARD_RECOVERY_SUGGESTIONS,
} from "../../lib/demo-config";
import { CUSTOM_TARGET_MAX_LENGTH } from "../../lib/target-guard";
import {
  AUTO_MODALITY,
  AUTO_MODALITY_REASON,
  modalityLabel,
} from "../../lib/modality";
import type { PipelinePayload, StageEvent } from "../pipeline-shared";
import ReportDialog, { type ReportSource } from "../report-dialog";
import RecentRunsTable from "../recent-runs-table";
import {
  DesignedPeptideHero,
  EventLog,
  HandoffDownloads,
  SparkStatusPill,
  StageDetail,
  formatCountdown,
  parseSseFrame,
  researchOutcomeLine,
  useSparkStatus,
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
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  return (
    <DesignerInner
      key={query}
      initial={parseDesignParams(searchParams)}
    />
  );
}

function DesignerInner({ initial }: { initial: DesignParams }) {
  const [presetId, setPresetId] = useState<string>(
    initial.presetId ??
      (initial.custom !== undefined ? "other" : (DEMO_PRESETS[0]?.id ?? ""))
  );
  const [custom, setCustom] = useState(initial.custom ?? "");
  const [focusRunId, setFocusRunId] = useState<string | null>(
    initial.runId ?? null
  );
  const customActive = presetId === "other";
  // Deep-linked sessions chose on the overview: the top renders as a
  // read-only summary, never as controls. Direct visits stay fully
  // interactive.
  const locked =
    initial.presetId !== undefined || initial.custom !== undefined;
  const [modality, setModality] = useState<string>("auto");
  const resolvedModality = modality === "auto" ? AUTO_MODALITY : modality;
  const scaffoldSummary =
    modality === "auto"
      ? `Auto (${modalityLabel(AUTO_MODALITY)})`
      : (MODALITIES.find((entry) => entry.value === modality)?.label ??
        modality);
  const [charge, setCharge] = useState<number | "auto">("auto");
  const resolvedCharge = charge === "auto" ? DEMO_CHARGE_TARGET : charge;
  const chargeSummary =
    charge === "auto" ? `Auto (+${DEMO_CHARGE_TARGET})` : `+${charge}`;
  const [research, setResearch] = useState(true);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [events, setEvents] = useState<StageEvent[]>([]);
  const [result, setResult] = useState<PipelinePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"validation" | "pipeline" | null>(
    null
  );
  const [streamRunId, setStreamRunId] = useState<string | null>(null);
  const [reportSource, setReportSource] = useState<ReportSource | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const sparkStatus = useSparkStatus();

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
  // Deep-linked arrivals chose on the overview; everyone else's
  // controls freeze while a design is running.
  const controlsDisabled = locked || loading;

  // Deep-link auto-run: arrivals from the landing page start their
  // design at once; direct visits stay idle. Cooling arrivals wait
  // for the countdown instead. The outer key remounts per query, so
  // mount-only is correct here.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    const target =
      initial.custom ??
      DEMO_PRESETS.find((entry) => entry.id === initial.presetId)?.target;
    if (target === undefined) return;
    const stored = window.localStorage.getItem(COOLDOWN_KEY);
    const until =
      stored === null ? Number.NaN : Number.parseInt(stored, 10);
    if (Number.isFinite(until) && until > Date.now()) return;
    void generate(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function lockCooldown(retryAfterSeconds: number): void {
    const until = Date.now() + retryAfterSeconds * 1000;
    setCooldownUntil(until);
    window.localStorage.setItem(COOLDOWN_KEY, String(until));
  }

  async function generate(explicit?: string): Promise<void> {
    const preset = DEMO_PRESETS.find((entry) => entry.id === presetId);
    const target =
      explicit ?? (customActive ? custom.trim() : (preset?.target ?? ""));
    if (target.length === 0 || loading || cooling) {
      if (customActive && custom.trim().length === 0 && !loading && !cooling) {
        setError("Describe a gut condition first.");
        setErrorKind("validation");
      }
      return;
    }
    setLoading(true);
    setElapsed(0);
    setError(null);
    setErrorKind(null);
    setResult(null);
    setEvents([]);
    setStreamRunId(null);
    try {
      const response = await fetch("/api/demo-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          charge_target: resolvedCharge,
          modality: resolvedModality,
          research,
        }),
      });
      if (!response.ok || response.body === null) {
        const payload = (await response
          .json()
          .catch(() => null)) as PipelinePayload | null;
        setError(payload?.error ?? `Request failed (${response.status}).`);
        setErrorKind(
          response.status === 400 || response.status === 422
            ? "validation"
            : "pipeline"
        );
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
          } else if (frame.kind === "run") {
            setStreamRunId(frame.runId);
          }
          split = buffer.indexOf("\n\n");
        }
      }
      if (outcome !== null && outcome.success) {
        setResult(outcome);
      } else {
        setError(outcome?.error ?? "Stream ended without a result.");
        setErrorKind("pipeline");
      }
      lockCooldown(DEMO_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      setErrorKind("pipeline");
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
  const started =
    loading || events.length > 0 || result !== null || error !== null;
  const loopEntries = LOOP_ORDER.filter(
    (loop) => candidate?.grammar_breakdown[loop] !== undefined
  );

  return (
    <div className={styles.designer}>
      <div
        id="design-controls"
        className={`${styles.cells} ${styles.cellsGrid}`}
        role="group"
        aria-label="Condition to design for"
      >
        {DEMO_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={preset.id === presetId}
            disabled={controlsDisabled}
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
          disabled={controlsDisabled}
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
            disabled={controlsDisabled}
            placeholder="e.g. bile acid diarrhea"
            onChange={(event) => {
              setCustom(event.target.value);
              setError(null);
              setErrorKind(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void generate();
            }}
          />
        </div>
      )}
      {error !== null && errorKind === "validation" && !loading && (
        <div className={styles.guardbox} role="alert">
          <p className={styles.guardtitle}>That condition won&apos;t work</p>
          <p>{error}</p>
          <p className={styles.guardsub}>
            Try one of these instead — tapping one runs it immediately:
          </p>
          <div className={styles.guardchips} role="group" aria-label="Suggested conditions">
            {GUARD_RECOVERY_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className={styles.cell}
                disabled={locked}
                onClick={() => {
                  setCustom(suggestion);
                  setError(null);
                  setErrorKind(null);
                  void generate(suggestion);
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.optrow}>
        {locked ? (
          <p className={styles.note}>Scaffold: {scaffoldSummary}</p>
        ) : (
          <details className={styles.optdetails}>
            <summary>Scaffold: {scaffoldSummary} (change)</summary>
            <p className={styles.note}>
              {AUTO_MODALITY_REASON}. Pick one to override.
            </p>
            <div
              className={styles.cells}
              role="group"
              aria-label="Peptide scaffold"
            >
              {[{ value: "auto", label: "Auto" }, ...MODALITIES].map(
                (entry) => (
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
                )
              )}
            </div>
          </details>
        )}
        {locked ? (
          <p className={styles.note}>Charge: {chargeSummary}</p>
        ) : (
          <details className={styles.optdetails}>
            <summary>Charge: {chargeSummary} (change)</summary>
            <p className={styles.note}>
              +{DEMO_CHARGE_TARGET}: the standard default, balancing
              antimicrobial punch with safety. Pick one to override.
            </p>
            <div
              className={styles.cells}
              role="group"
              aria-label="Formal charge target"
            >
              {(["auto", ...CHARGES] as const).map((value) => (
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
                  {value === "auto" ? "Auto" : `+${value}`}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>

      <label className={styles.checkrow}>
        <input
          type="checkbox"
          checked={research}
          disabled={locked}
          onChange={(event) => setResearch(event.target.checked)}
        />
        <span>
          Literature research stage — ground the prompt in PubMed and
          Europe PMC before generating
        </span>
      </label>

      {(!locked || !started) && (
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
      )}
      <p className={styles.note}>
        {locked
          ? "Chosen on the overview — return there to pick a different condition. One design per minute per visitor."
          : "Presets or your own gut condition under Other, one design per minute per visitor, cooldown shared across both pages."}
      </p>

      <div className={styles.feed} id="design-status" aria-live="polite">
        <div className={styles.feedhead}>
          <span className={styles.feedlabel}>Design status</span>
          <span className={styles.feedside}>
            <SparkStatusPill status={sparkStatus} />
            <span className={styles.feedlive} role="status">
              {loading
                ? `live ${elapsed}s`
                : events.length > 0
                  ? `done ${elapsed}s`
                  : "standby"}
            </span>
          </span>
        </div>
        <p className={styles.feedsub}>
          What&apos;s happening right now, stage by stage.
        </p>
        <StageDetail
          events={events}
          finished={finished}
          failed={error !== null && !loading}
        />
        {showFeed && <EventLog events={events} logRef={logRef} />}
      </div>

      {sparkStatus !== null && sparkStatus.state !== "ok" && (
        <p className={styles.providerbanner} role="status">
          <strong>
            Meta API {sparkStatus.state.replace("_", " ")} (
            {sparkStatus.detail}):
          </strong>{" "}
          research and proposals are running on deterministic fallbacks.
          Designs still verify through the symbolic compiler
          {sparkStatus.state === "blocked"
            ? " — only the AI drafting is degraded; check the API key's standing."
            : sparkStatus.state === "rate_limited"
              ? " — retry shortly; the brief library keeps reports rich meanwhile."
              : sparkStatus.state === "unconfigured"
                ? " — set META_API_KEY on the server to enable model drafting."
                : " — the brief library and compiler hold meanwhile."}
        </p>
      )}

      {error !== null && errorKind !== "validation" && !loading && (
        <p className={styles.errorbox} role="alert">
          {error}
        </p>
      )}

      {focusRunId !== null && (
        <div id="design-focus">
          <FocusedPeptide
            runId={focusRunId}
            onClose={() => setFocusRunId(null)}
          />
        </div>
      )}

      {ok && candidate !== undefined && audit !== undefined && (
        <div className={styles.result} id="design-result">
          <DesignedPeptideHero
            sequence={candidate.mature_sequence}
            constructId={candidate.id}
            topology={candidate.topology}
            interpreted={
              result?.requested_target !== undefined
                ? result.target
                : undefined
            }
          />

          {researchBrief !== undefined && (
            <section aria-label="Literature brief">
              <h3>Literature brief</h3>
              <p className={styles.handoffline}>
                {researchOutcomeLine(
                  researchBrief.status,
                  researchBrief.reason,
                  researchBrief.evidence_count
                )}
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
              {(researchBrief.status === "ok" ||
                researchBrief.brief !== undefined ||
                (researchBrief.evidence?.length ?? 0) > 0) && (
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() =>
                    setReportSource({
                      kind: "inline",
                      target:
                        result?.requested_target ??
                        result?.target ??
                        "current design",
                      brief: researchBrief.brief ?? null,
                      evidence: researchBrief.evidence ?? [],
                    })
                  }
                >
                  Read the full literature brief
                </button>
              )}
            </section>
          )}
          {reportSource !== null && (
            <ReportDialog
              source={reportSource}
              onClose={() => setReportSource(null)}
            />
          )}

          <section aria-label="Predicted structure">
            <h3>Predicted structure</h3>
            <PeptideViewer
              sequence={candidate.mature_sequence}
              runId={result?.run_id ?? streamRunId}
              guide
            />
          </section>

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

          <details className={styles.rawjson}>
            <summary>Full JSON response</summary>
            <pre>
              <code>{JSON.stringify(result, null, 2)}</code>
            </pre>
          </details>
        </div>
      )}
      <div id="recent-runs">
        <RecentRunsTable
          onSelect={(id) => {
            setFocusRunId(id);
            document
              .getElementById("design-focus")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      </div>
    </div>
  );
}
