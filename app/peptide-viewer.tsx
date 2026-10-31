"use client";

import { useEffect, useRef, useState } from "react";
import { ESMFOLD_TIMEOUT_MS } from "../lib/esmfold";
import type { GLViewer } from "3dmol";
import styles from "./page.module.css";

type ViewerStatus = "loading" | "ready" | "error";
type ColorScheme = "plddt" | "spectrum";

interface FoldResponse {
  success: boolean;
  pdb?: string;
  plddt?: number;
  error?: string;
  details?: { kind?: string };
}

/** Cold upstream workers answer slowly, then warm: retry those kinds. */
const RETRYABLE_KINDS = new Set(["rate-limited", "timeout"]);
const RETRY_DELAYS_MS = [3000, 6000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyStyles(viewer: GLViewer, scheme: ColorScheme): void {
  viewer.setStyle(
    {},
    scheme === "plddt"
      ? {
          cartoon: {
            colorscheme: { prop: "b", gradient: "ROYGB", min: 50, max: 90 },
          },
        }
      : { cartoon: { color: "spectrum" } }
  );
  // Cysteine sticks in element colors (sulfur renders yellow) so the
  // disulfide core reads against the cartoon.
  viewer.addStyle({ resn: "CYS" }, { stick: { radius: 0.25 } });
  viewer.addStyle(
    { resn: "CYS", atom: "SG" },
    { sphere: { radius: 0.7, color: "yellow" } }
  );
  viewer.render();
}

/**
 * Predicted-structure viewer: renders the backbone cartoon in 3Dmol.js
 * with the cysteine core in sticks. When the parent supplies a stored
 * prediction from the ledger it renders immediately; otherwise it folds
 * on demand through the ESMFold proxy, linking the fold to runId so
 * the fresh prediction is stored for next time. Self-loading with
 * skeleton and error fallback.
 */
export default function PeptideViewer({
  sequence,
  runId = null,
  storedPdb = null,
  storedPlddt = null,
}: {
  sequence: string;
  runId?: string | null;
  storedPdb?: string | null;
  storedPlddt?: number | null;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<GLViewer | null>(null);
  const [status, setStatus] = useState<ViewerStatus>("loading");
  const [message, setMessage] = useState("Folding with ESMFold…");
  const [now, setNow] = useState(() => Date.now());
  const [plddt, setPlddt] = useState<number | null>(null);
  // Attempt clock for the countdown display: which attempt is in
  // flight, when it started, and when a backoff sleep ends. The `now`
  // ticker re-renders twice a second while loading, keeping the
  // countdowns live.
  const [attemptNum, setAttemptNum] = useState(0);
  const [attemptStart, setAttemptStart] = useState(0);
  const [sleepUntil, setSleepUntil] = useState(0);
  // Spin on arrival so the fold reads as 3D at once; users can
  // still stop it, and reduced-motion users start stopped.
  const [spin, setSpin] = useState(
    () =>
      typeof window === "undefined" ||
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [scheme, setScheme] = useState<ColorScheme>("plddt");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;

    const run = async (): Promise<void> => {
      setStatus("loading");
      setNow(Date.now());
      setPlddt(null);
      setAttemptNum(0);
      setSleepUntil(0);
      try {
        // A stored prediction skips ESMFold entirely — same structure,
        // no wait, no upstream load.
        if (storedPdb !== null && storedPdb.length > 0) {
          setMessage("Loading saved structure…");
          const { createViewer } = await import("3dmol");
          if (cancelled) return;
          container.replaceChildren();
          const viewer = createViewer(container, {
            backgroundColor: "white",
          });
          viewerRef.current = viewer;
          viewer.addModel(storedPdb, "pdb");
          applyStyles(viewer, scheme);
          viewer.zoomTo();
          viewer.render();
          viewer.spin(spin);
          setPlddt(storedPlddt);
          setStatus("ready");
          return;
        }
        let body: FoldResponse | null = null;
        let lastError = "Folding failed.";
        let lastKind: string | null = null;
        for (let retry = 0; ; retry += 1) {
          setMessage("Folding with ESMFold…");
          setAttemptNum(retry + 1);
          setAttemptStart(Date.now());
          setSleepUntil(0);
          try {
            const response = await fetch("/api/fold-peptide", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                runId !== null && runId.length > 0
                  ? { sequence, runId }
                  : { sequence }
              ),
            });
            const parsed = (await response.json()) as FoldResponse;
            if (cancelled) return;
            if (
              response.ok &&
              parsed.success &&
              parsed.pdb !== undefined
            ) {
              body = parsed;
              break;
            }
            lastError =
              parsed.error ?? `Folding failed (${response.status}).`;
            lastKind = parsed.details?.kind ?? null;
            const delay = RETRY_DELAYS_MS[retry];
            if (
              lastKind === null ||
              !RETRYABLE_KINDS.has(lastKind) ||
              delay === undefined
            ) {
              break;
            }
            setMessage(
              `ESM Atlas is warming up — retry ${retry + 1} of ${RETRY_DELAYS_MS.length}…`
            );
            setSleepUntil(Date.now() + delay);
            await sleep(delay);
            if (cancelled) return;
          } catch (error) {
            if (cancelled) return;
            lastError =
              error instanceof Error ? error.message : "Folding failed.";
            lastKind = null;
            const delay = RETRY_DELAYS_MS[retry];
            if (delay === undefined) break;
            setMessage(
              `ESM Atlas is warming up — retry ${retry + 1} of ${RETRY_DELAYS_MS.length}…`
            );
            setSleepUntil(Date.now() + delay);
            await sleep(delay);
            if (cancelled) return;
          }
        }
        if (cancelled) return;
        if (body === null) {
          setStatus("error");
          // Overload timeouts are upstream weather, not a bad peptide:
          // say so plainly instead of quoting milliseconds.
          setMessage(
            lastKind !== null && RETRYABLE_KINDS.has(lastKind)
              ? "ESM Atlas is overloaded right now. Your peptide and everything below are unaffected — retry when ready."
              : lastError
          );
          return;
        }
        const { createViewer } = await import("3dmol");
        if (cancelled) return;
        container.replaceChildren();
        const viewer = createViewer(container, { backgroundColor: "white" });
        viewerRef.current = viewer;
        viewer.addModel(body.pdb, "pdb");
        applyStyles(viewer, scheme);
        viewer.zoomTo();
        viewer.render();
        viewer.spin(spin);
        setPlddt(body.plddt ?? null);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "Folding failed."
        );
      }
    };
    void run();

    const containerNow = container;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            viewerRef.current?.resize();
            viewerRef.current?.render();
          });
    observer?.observe(containerNow);
    return () => {
      cancelled = true;
      observer?.disconnect();
      try {
        viewerRef.current?.removeAllModels();
        viewerRef.current?.render();
      } catch {
        // Viewer teardown is best-effort.
      }
      viewerRef.current = null;
    };
    // Intentionally not reactive to spin/scheme: those restyle live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence, attempt, runId, storedPdb, storedPlddt]);

  // Ticks while a fold is in flight so the attempt countdown
  // stays live. Stops the moment the fold resolves or fails.
  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [status, sequence, attempt, runId, storedPdb, storedPlddt]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer === null || status !== "ready") return;
    applyStyles(viewer, scheme);
  }, [scheme, status]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer === null || status !== "ready") return;
    viewer.spin(spin);
  }, [spin, status]);

  // Live progress suffix: which attempt is in flight with its
  // response budget counting down, or the backoff sleep counting
  // down between attempts. Empty for stored-structure loads.
  let loadingSuffix = "";
  if (status === "loading" && attemptNum > 0) {
    if (now < sleepUntil) {
      const retryIn = Math.max(1, Math.ceil((sleepUntil - now) / 1000));
      loadingSuffix = ` (${retryIn}s)`;
    } else {
      const responseLeft = Math.max(
        0,
        Math.ceil((ESMFOLD_TIMEOUT_MS - (now - attemptStart)) / 1000)
      );
      loadingSuffix = ` (attempt ${attemptNum} of ${MAX_ATTEMPTS} · ${responseLeft}s left)`;
    }
  }

  return (
    <div className={styles.viewerwrap}>
      <div
        ref={containerRef}
        className={styles.viewer}
        role="img"
        aria-label={
          status === "ready"
            ? `Predicted 3D structure of a ${sequence.length}-residue peptide`
            : "Predicted structure loading"
        }
        aria-busy={status === "loading"}
      />
      {status === "loading" && (
        <div className={styles.viewerstatus} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <span>
            {message}
            {loadingSuffix}
          </span>
        </div>
      )}
      {status === "error" && (
        <div className={styles.viewerstatus} role="alert">
          <span>Structure unavailable — {message}</span>
          <button
            type="button"
            className={styles.btn}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry folding
          </button>
        </div>
      )}
      {status === "ready" && (
        <>
          <p className={styles.viewerchip}>
            {sequence.length} aa
            {plddt !== null ? `, pLDDT ${plddt.toFixed(1)}` : ""}
          </p>
          <div
            className={styles.viewertoggles}
            role="group"
            aria-label="Viewer controls"
          >
            <button
              type="button"
              aria-pressed={spin}
              className={styles.viewertoggle}
              onClick={() => setSpin((value) => !value)}
            >
              {spin ? "Stop spin" : "Spin"}
            </button>
            <button
              type="button"
              aria-pressed={scheme === "spectrum"}
              className={styles.viewertoggle}
              onClick={() =>
                setScheme((value) =>
                  value === "plddt" ? "spectrum" : "plddt"
                )
              }
            >
              {scheme === "plddt" ? "Color: confidence" : "Color: spectrum"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Biologically grounded guide to the predicted structure: engine,
 * confidence bands, disulfide inspection, and the monomeric-model
 * disclaimer. Static copy adjacent to the viewer.
 */
export function StructureGuide(): React.ReactElement {
  return (
    <section
      className={styles.guide}
      aria-labelledby="structure-guide-title"
    >
      <h3 id="structure-guide-title">Structural Modeling & Confidence Guide</h3>
      <dl className={styles.guidelist}>
        <div>
          <dt>ESMFold engine</dt>
          <dd>
            3D coordinates are predicted in near real time by Meta&apos;s
            ESMFold through the ESM Atlas API, which infers physical
            topology directly from single-sequence representations —
            no slow multiple sequence alignments required. Folding runs
            on demand for each accepted design.
          </dd>
        </div>
        <div>
          <dt>Interpreting pLDDT</dt>
          <dd>
            Predicted Local Distance Difference Test, per-residue
            confidence from 0 to 100 (cartoon color):
            <ul className={styles.plddtbands}>
              <li>
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: "#1a46c8" }}
                  aria-hidden="true"
                />{" "}
                Above 90 (dark blue): very high confidence, well-ordered
                backbone and sidechain orientations.
              </li>
              <li>
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: "#22c3d6" }}
                  aria-hidden="true"
                />{" "}
                70 to 90 (cyan): high confidence, reliable secondary
                structure and overall fold topology.
              </li>
              <li>
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: "#e3c81c" }}
                  aria-hidden="true"
                />{" "}
                50 to 70 (yellow): low confidence, possible flexible loop,
                disordered tail, or unstable scaffold.
              </li>
              <li>
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: "#e2571e" }}
                  aria-hidden="true"
                />{" "}
                Below 50 (orange and red): disordered or non-folding region.
              </li>
            </ul>
          </dd>
        </div>
        <div>
          <dt>Disulfide inspection</dt>
          <dd>
            Cysteines render in stick format with yellow sulfur atoms so
            you can assess whether the 6 cysteine residues cluster in 3D
            space into the characteristic Inhibitor Cystine Knot (ICK)
            disulfide core (C1–C4, C2–C5, C3–C6).
          </dd>
        </div>
        <div>
          <dt>Computational disclaimer</dt>
          <dd>
            ESMFold produces monomeric coordinates without explicitly
            enforcing covalent disulfide crosslinks or cyclic
            head-to-tail restraints. Top designs should undergo targeted
            folding verification (for example Chai-1, Boltz-1, or AF3)
            prior to synthesis.
          </dd>
        </div>
      </dl>
    </section>
  );
}
