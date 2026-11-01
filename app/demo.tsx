"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { DEMO_PRESETS } from "../lib/demo-config";
import { CUSTOM_TARGET_MAX_LENGTH } from "../lib/target-guard";
import {
  SparkStatusPill,
  formatCountdown,
  useSparkStatus,
} from "./pipeline-shared";
import Recent from "./recent";

const COOLDOWN_KEY = "cozy-peptide-demo-cooldown-until";

/**
 * Landing launcher: pick a preset or describe a condition, then
 * continue to the designer page where the run happens. No pipeline
 * here — the landing page stays quiet.
 */
export default function Demo() {
  const router = useRouter();
  const [presetId, setPresetId] = useState<string>(DEMO_PRESETS[0]?.id ?? "");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const customActive = presetId === "other";
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

  const remaining =
    cooldownUntil === null ? 0 : Math.ceil((cooldownUntil - now) / 1000);
  const cooling = remaining > 0;

  function go(): void {
    if (cooling) return;
    if (customActive) {
      const target = custom.trim();
      if (target.length === 0) {
        setError("Describe a gut condition first.");
        return;
      }
      router.push(
        `/design?custom=${encodeURIComponent(target)}&tour=1`
      );
      return;
    }
    router.push(`/design?target=${encodeURIComponent(presetId)}&tour=1`);
  }

  return (
    <section className={styles.board} id="demo" aria-labelledby="demo-title">
      <h2 className={styles.boardtitle} id="demo-title">
        Design a peptide
      </h2>
      <p className={styles.boardsub}>
        Pick a gut condition and continue to the designer to run the
        live pipeline.
      </p>
      <p className={styles.boardsub}>
        <SparkStatusPill status={sparkStatus} />
      </p>
      <div
        className={`${styles.cells} ${styles.cellsGrid}`}
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
            onClick={() => {
              setPresetId(preset.id);
              setError(null);
            }}
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
          onClick={() => {
            setPresetId("other");
            setError(null);
          }}
        >
          Other…
        </button>
      </div>
      {customActive && (
        <div className={styles.otherwrap}>
          <label className={styles.optlabel} htmlFor="demo-other-target">
            Describe the gut condition
          </label>
          <input
            id="demo-other-target"
            type="text"
            className={styles.otherinput}
            value={custom}
            maxLength={CUSTOM_TARGET_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. bile acid diarrhea"
            onChange={(event) => {
              setCustom(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") go();
            }}
          />
        </div>
      )}
      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary} ${styles.designbtn}`}
        disabled={cooling}
        onClick={go}
      >
        {cooling
          ? `Next design in ${formatCountdown(remaining)}`
          : "Design your first peptide with Pep"}
      </button>
      {error !== null && (
        <p className={styles.errorbox} role="alert">
          {error}
        </p>
      )}
      <p className={styles.note}>
        One design per minute per visitor. Presets or your own
        condition under Other. Guarded input, no token needed.
      </p>
      <Recent onUse={(run) => router.push(`/design?run=${run.id}`)} />
    </section>
  );
}
