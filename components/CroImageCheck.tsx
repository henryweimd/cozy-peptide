"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../app/page.module.css";

const DEMO_IMAGE = "/demo/cro-demo-nuclei.png";
const DEMO_CAPTION =
  "Demo: Hoechst nuclei field as stand-in for fluorescent reporter cells. Replace with your CRO image. CC0 demo only.";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const PRESETS: Record<string, { label: string; concepts: string[] }> = {
  A: { label: "A · Plate count", concepts: ["bacterial colonies"] },
  B: { label: "B · Reporter expression", concepts: ["cell nuclei", "fluorescent cells"] },
  C: { label: "C · Rescue morphology", concepts: ["round cells", "spread cells"] },
};

interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
  name: string;
  demo: boolean;
  /** sha256 of the raw bytes, "" when subtle crypto is unavailable. */
  hash: string;
}

interface ConceptResult {
  concept: string;
  count: number;
  foreground_pixels: number;
  maskSvg: string;
  width: number | null;
  height: number | null;
  cached: boolean;
}

interface CacheEntry {
  result: ConceptResult;
  savedId: string | null;
  resolvedRun: string | null;
}

interface RecentRow {
  id: string;
  target: string;
}

function readDims(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("decode"));
    img.src = dataUrl;
  });
}

async function sha256Hex(dataUrl: string): Promise<string> {
  try {
    const base64 = dataUrl.split(",", 2)[1] ?? "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("read"));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(blob);
  });
}

export default function CroImageCheck({
  token,
}: {
  token: string;
}): React.ReactElement {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [concepts, setConcepts] = useState<string[]>(["cell nuclei"]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<ConceptResult[] | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showOverlay, setShowOverlay] = useState(true);
  const [runs, setRuns] = useState<RecentRow[]>([]);
  const [runId, setRunId] = useState("");
  const segCache = useRef(new Map<string, CacheEntry>());

  useEffect(() => {
    fetch("/api/analyze-image")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        const data =
          typeof body === "object" && body !== null
            ? (body as { data?: { configured?: unknown } }).data
            : undefined;
        setConfigured(data?.configured === true);
      })
      .catch(() => setConfigured(false));
    fetch("/api/recent-peptides?limit=10")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        const data =
          typeof body === "object" && body !== null
            ? (body as { data?: unknown }).data
            : undefined;
        if (Array.isArray(data)) {
          setRuns(
            data
              .filter(
                (row): row is RecentRow =>
                  typeof row === "object" &&
                  row !== null &&
                  typeof (row as RecentRow).id === "string" &&
                  typeof (row as RecentRow).target === "string"
              )
              .map((row) => ({ id: row.id, target: row.target }))
          );
        }
      })
      .catch(() => setRuns([]));
  }, []);

  async function loadDemoImage(): Promise<void> {
    setError("");
    setResults(null);
    setSavedId(null);
    setSavedRunId(null);
    setRunId("demo");
    try {
      const response = await fetch(DEMO_IMAGE);
      if (!response.ok) throw new Error("fetch");
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      const dims = await readDims(dataUrl);
      setImage({
        dataUrl,
        width: dims.width,
        height: dims.height,
        name: "cro-demo-nuclei.png",
        demo: true,
        hash: await sha256Hex(dataUrl),
      });
      setConcepts(["cell nuclei"]);
    } catch {
      setError("Could not load the demo image.");
    }
  }

  async function onFile(file: File | undefined): Promise<void> {
    setError("");
    setResults(null);
    setSavedId(null);
    setSavedRunId(null);
    if (file === undefined) return;
    setRunId("");
    if (file.size > MAX_IMAGE_BYTES) {
      setError("That file exceeds the 20 MiB limit.");
      return;
    }
    try {
      const dataUrl = await blobToDataUrl(file);
      const dims = await readDims(dataUrl);
      setImage({
        dataUrl,
        width: dims.width,
        height: dims.height,
        name: file.name,
        demo: false,
        hash: await sha256Hex(dataUrl),
      });
    } catch {
      setError("Could not read that file as an image.");
    }
  }

  function setConceptAt(index: number, value: string): void {
    setConcepts((prev) => prev.map((c, i) => (i === index ? value : c)));
    setResults(null);
    setSavedId(null);
  }

  async function analyze(): Promise<void> {
    if (image === null || busy) return;
    if (!image.demo && token.length === 0) {
      setError("Enter your API token above to analyze your own photos.");
      return;
    }
    const clean = concepts.map((c) => c.trim()).filter((c) => c.length > 0);
    if (clean.length === 0) {
      setError("Add at least one concept first.");
      return;
    }
    setBusy(true);
    setError("");
    setResults(null);
    setSavedId(null);
    setSavedRunId(null);
    try {
      const combined: ConceptResult[] = [];
      let saved: string | null = null;
      let resolvedRun: string | null = null;
      for (const concept of clean) {
        const cacheKey = `${image.hash}:${concept.toLowerCase()}`;
        const hit =
          image.hash !== "" ? segCache.current.get(cacheKey) : undefined;
        if (hit !== undefined) {
          combined.push({ ...hit.result, cached: true });
          if (saved === null) saved = hit.savedId;
          if (resolvedRun === null) resolvedRun = hit.resolvedRun;
          continue;
        }
        setProgress(`Segmenting “${concept}”…`);
        const response = await fetch("/api/analyze-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token.length > 0 ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            imageDataUrl: image.dataUrl,
            concepts: [concept],
            ...(runId !== "" ? { runId } : {}),
            width: image.width,
            height: image.height,
          }),
        });
        const body = (await response.json()) as {
          success?: boolean;
          error?: string;
          data?: Record<string, unknown>;
        };
        if (!response.ok || body.success !== true || typeof body.data !== "object" || body.data === null) {
          throw new Error(
            typeof body.error === "string" ? body.error : `HTTP ${response.status}`
          );
        }
        const data = body.data as {
          concept?: unknown;
          count?: unknown;
          foreground_pixels?: unknown;
          maskSvg?: unknown;
          width?: unknown;
          height?: unknown;
          cached?: unknown;
          saved?: { id?: unknown } | null;
          runId?: unknown;
        };
        const entry: ConceptResult = {
          concept: typeof data.concept === "string" ? data.concept : concept,
          count: typeof data.count === "number" ? data.count : 0,
          foreground_pixels:
            typeof data.foreground_pixels === "number" ? data.foreground_pixels : 0,
          maskSvg: typeof data.maskSvg === "string" ? data.maskSvg : "",
          width: typeof data.width === "number" ? data.width : null,
          height: typeof data.height === "number" ? data.height : null,
          cached: data.cached === true,
        };
        combined.push(entry);
        let entrySaved: string | null = null;
        let entryRun: string | null = null;
        if (data.saved !== null && typeof data.saved === "object") {
          const id = (data.saved as { id?: unknown }).id;
          if (typeof id === "string") entrySaved = id;
        }
        if (typeof data.runId === "string") entryRun = data.runId;
        if (saved === null) saved = entrySaved;
        if (resolvedRun === null) resolvedRun = entryRun;
        if (image.hash !== "") {
          segCache.current.set(cacheKey, {
            result: entry,
            savedId: entrySaved,
            resolvedRun: entryRun,
          });
        }
      }
      setResults(combined);
      setSavedId(saved);
      setSavedRunId(resolvedRun);
      setProgress("");
    } catch (thrown) {
      setError(
        thrown instanceof Error ? thrown.message : "Analysis failed."
      );
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  const meanFg =
    results !== null && results.length > 0
      ? Math.round(
          results.reduce((sum, r) => sum + r.foreground_pixels, 0) / results.length
        )
      : null;
  const byConcept = (needle: RegExp): ConceptResult | undefined =>
    results?.find((r) => needle.test(r.concept.toLowerCase()));
  const nuclei = byConcept(/nuclei|nucleus/);
  const fluor = byConcept(/fluorescent/);
  const round = byConcept(/round/);
  const spread = byConcept(/spread/);
  const pctPositive =
    nuclei !== undefined && fluor !== undefined && nuclei.count > 0
      ? ((fluor.count / nuclei.count) * 100).toFixed(1)
      : null;
  const pctRounded =
    round !== undefined &&
    spread !== undefined &&
    round.count + spread.count > 0
      ? ((round.count / (round.count + spread.count)) * 100).toFixed(1)
      : null;

  const canAnalyze =
    image !== null &&
    (image.demo || token.length > 0) &&
    configured === true &&
    !busy;

  return (
    <div className={styles.labUpload}>
      <p className={styles.bioCellTitle}>
        <strong>
          CRO photo check <span className={styles.livebadge}>Optional</span>
        </strong>
      </p>
      <p className={styles.note}>
        Design → Build into host → Verify → Prove. After compiler passes,
        you order DNA + strain build. Your CRO returns photos. Drop them
        here to verify before you pay for next loop.
      </p>
      <div className={styles.croPresets} role="group" aria-label="Check presets">
        {Object.entries(PRESETS).map(([key, preset]) => (
          <button
            key={key}
            type="button"
            className={styles.btn}
            disabled={busy}
            onClick={() => {
              setConcepts([...preset.concepts]);
              setResults(null);
              setSavedId(null);
              setError("");
            }}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={styles.btn}
          disabled={busy}
          onClick={() => void loadDemoImage()}
        >
          Use demo image
        </button>
      </div>
      <label className={styles.optlabel} htmlFor="cro-file">
        CRO photo (or use the demo image)
      </label>
      <input
        id="cro-file"
        className={styles.otherinput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        disabled={busy}
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      {concepts.map((concept, index) => (
        <div className={styles.croConceptRow} key={index}>
          <input
            className={styles.otherinput}
            type="text"
            aria-label={`Concept ${index + 1}`}
            placeholder='Short noun phrase, e.g. "cell nuclei"'
            value={concept}
            maxLength={120}
            disabled={busy}
            onChange={(event) => setConceptAt(index, event.target.value)}
          />
          <button
            type="button"
            className={styles.btn}
            aria-label={`Remove concept ${index + 1}`}
            disabled={busy || concepts.length <= 1}
            onClick={() => {
              setConcepts((prev) => prev.filter((_, i) => i !== index));
              setResults(null);
              setSavedId(null);
            }}
          >
            ×
          </button>
        </div>
      ))}
      {concepts.length < 4 && (
        <button
          type="button"
          className={styles.btn}
          disabled={busy}
          onClick={() => setConcepts((prev) => [...prev, ""])}
        >
          Add concept
        </button>
      )}
      <label className={styles.optlabel} htmlFor="cro-run">
        Save to run ledger
      </label>
      <select
        id="cro-run"
        className={styles.otherinput}
        value={runId}
        disabled={busy || image?.demo === true}
        onChange={(event) => setRunId(event.target.value)}
      >
        <option value="">No run (ephemeral check)</option>
        <option value="demo">Demo run (auto-created)</option>
        {runs.map((run) => (
          <option key={run.id} value={run.id}>
            {run.target.slice(0, 60)} · {run.id.slice(0, 8)}
          </option>
        ))}
      </select>
      {image?.demo === true && (
        <p className={styles.note}>
          Demo images save to the demo run ledger — no API token needed.
        </p>
      )}
      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary}`}
        disabled={!canAnalyze}
        onClick={() => void analyze()}
      >
        {busy ? "Analyzing…" : "Analyze image"}
      </button>
      {progress !== "" && <p className={styles.note}>{progress}</p>}
      {configured === false && (
        <p className={styles.note}>
          Analysis is disabled: no model key (MODEL_API_KEY or META_API_KEY)
          is set on the server.
        </p>
      )}
      {configured === true && token.length === 0 && image?.demo !== true && (
        <p className={styles.note}>
          Enter your API token above to analyze your own photos.
        </p>
      )}
      {error !== "" && (
        <p className={styles.errorbox} role="alert">
          {error}
        </p>
      )}
      {image !== null && (
        <div className={styles.croViewer}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.dataUrl} alt={image.demo ? "Demo nuclei field" : image.name} />
          {showOverlay &&
            results !== null &&
            results.map(
              (result) =>
                result.maskSvg !== "" && (
                  <div
                    key={result.concept}
                    className={styles.croOverlay}
                    // SVG is server-generated path data in frame coordinates.
                    dangerouslySetInnerHTML={{ __html: result.maskSvg }}
                  />
                )
            )}
        </div>
      )}
      {image?.demo === true && (
        <p className={styles.note}>
          {DEMO_CAPTION} Sample image via{" "}
          <a
            href="https://bbbc.broadinstitute.org/"
            target="_blank"
            rel="noreferrer"
          >
            BBBC (Broad Bioimage Benchmark Collection)
          </a>
          .
        </p>
      )}
      {results !== null && (
        <>
          <label className={styles.labCheck}>
            <input
              type="checkbox"
              checked={showOverlay}
              onChange={(event) => setShowOverlay(event.target.checked)}
            />{" "}
            Show segmentation overlay
          </label>
          <table className={styles.croTable}>
            <thead>
              <tr>
                <th>Concept</th>
                <th>Count</th>
                <th>Foreground px</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.concept}>
                  <td>{result.concept}</td>
                  <td>{result.count}</td>
                  <td>{result.foreground_pixels.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {meanFg !== null && (
            <p className={styles.note}>
              Mean foreground pixels: {meanFg.toLocaleString()}.
              {pctPositive !== null && ` ${pctPositive}% positive.`}
              {pctRounded !== null && ` ${pctRounded}% rounded.`}
            </p>
          )}
          {results.some((r) => r.cached) && (
            <p className={styles.note}>
              Loaded from a saved segmentation — no model call.
            </p>
          )}
          {savedId !== null && savedRunId !== null && (
            <p className={styles.note}>
              Saved to {runId === "demo" ? "demo run" : "run"} ledger (
              {savedId.slice(0, 8)}).{" "}
              <a href={`/design?run=${savedRunId}`}>Open the run</a>
            </p>
          )}
          {savedId === null && (
            <p className={styles.note}>Ephemeral result — not saved.</p>
          )}
        </>
      )}
      <p className={styles.note}>
        CRO images only; surrogate non-toxic fragments only; licensed lab /
        CRO only. Research hypothesis only — not a diagnosis, not a
        manufacturing release.
      </p>
    </div>
  );
}
