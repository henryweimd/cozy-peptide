"use client";

import { useEffect, useRef, useState } from "react";
import type { GLViewer } from "3dmol";
import styles from "./page.module.css";

type ViewerStatus = "loading" | "ready" | "error";
type ColorScheme = "plddt" | "spectrum";

interface FoldResponse {
  success: boolean;
  pdb?: string;
  plddt?: number;
  error?: string;
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
 * Predicted-structure viewer: folds the sequence on demand through the
 * ESMFold proxy, then renders the backbone cartoon in 3Dmol.js with the
 * cysteine core in sticks. Self-loading with skeleton and error
 * fallback; the parent only passes the accepted sequence.
 */
export default function PeptideViewer({
  sequence,
}: {
  sequence: string;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<GLViewer | null>(null);
  const [status, setStatus] = useState<ViewerStatus>("loading");
  const [message, setMessage] = useState("Folding with ESMFold…");
  const [plddt, setPlddt] = useState<number | null>(null);
  const [spin, setSpin] = useState(false);
  const [scheme, setScheme] = useState<ColorScheme>("plddt");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let cancelled = false;

    const run = async (): Promise<void> => {
      setStatus("loading");
      setMessage("Folding with ESMFold…");
      setPlddt(null);
      try {
        const response = await fetch("/api/fold-peptide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sequence }),
        });
        const body = (await response.json()) as FoldResponse;
        if (cancelled) return;
        if (!response.ok || !body.success || body.pdb === undefined) {
          setStatus("error");
          setMessage(
            body.error ?? `Folding failed (${response.status}).`
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
  }, [sequence, attempt]);

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
          <span>{message}</span>
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
