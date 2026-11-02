"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import styles from "../page.module.css";
import Recent, { type RecentRun } from "../recent";
import SectionIcon, { type SectionIconName } from "../section-icons";
import CroImageCheck from "../../components/CroImageCheck";
import {
  ASSAY_TEMPLATE_VERSION,
  ASSAY_TEMPLATES,
  looksLikeFasta,
  parseAssayCsv,
  parseFasta,
  type AssayType,
} from "../../lib/assay-ingest";

interface LabRunHandoff {
  dna_gblock?: unknown;
  order_csv?: unknown;
  host_display?: unknown;
  yeast_chassis?: unknown;
}

interface LabRun {
  id: string;
  target: string;
  modality: string | null;
  candidateId: string | null;
  candidateSequence: string | null;
  labHandoff: LabRunHandoff | null;
}

interface LabProgress {
  ordered: boolean;
  built: boolean;
  submitted: AssayType[];
}

export const LAB_TOKEN_KEY = "cozy-peptide-lab-token";
const TOKEN_KEY = LAB_TOKEN_KEY;

function progressKey(runId: string): string {
  return `cozy-peptide-lab-progress:${runId}`;
}

function loadProgress(runId: string): LabProgress {
  const fallback: LabProgress = { ordered: false, built: false, submitted: [] };
  try {
    const raw = window.localStorage.getItem(progressKey(runId));
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as Partial<LabProgress>;
    return {
      ordered: parsed.ordered === true,
      built: parsed.built === true,
      submitted: Array.isArray(parsed.submitted)
        ? parsed.submitted.filter(
            (entry): entry is AssayType =>
              entry === "mic" ||
              entry === "cytotoxicity" ||
              entry === "expression_titer" ||
              entry === "sequence_verification"
          )
        : [],
    };
  } catch {
    return fallback;
  }
}

function asLabRun(value: unknown): LabRun | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record["id"] !== "string") return null;
  if (typeof record["target"] !== "string") return null;
  const handoff =
    typeof record["labHandoff"] === "object" && record["labHandoff"] !== null
      ? (record["labHandoff"] as LabRunHandoff)
      : null;
  return {
    id: record["id"] as string,
    target: record["target"] as string,
    modality: typeof record["modality"] === "string" ? record["modality"] : null,
    candidateId:
      typeof record["candidateId"] === "string" ? record["candidateId"] : null,
    candidateSequence:
      typeof record["candidateSequence"] === "string"
        ? record["candidateSequence"]
        : null,
    labHandoff: handoff,
  };
}

function StepHead({
  id,
  index,
  title,
  done,
  icon,
  time,
}: {
  id: string;
  index: string;
  title: string;
  done: boolean;
  icon: SectionIconName;
  time?: string;
}): React.ReactElement {
  return (
    <div className={styles.labStepHead} id={id}>
      <h2>
        <SectionIcon name={icon} />
        <span className={styles.labStepNum}>{index}</span> {title}
      </h2>
      {time !== undefined && (
        <span
          className={styles.labTimePill}
          title="Typical turnaround when outsourced — see Plan the run"
        >
          <SectionIcon name="clock" />
          {time}
        </span>
      )}
      {done && <span className={styles.livebadge}>Done</span>}
    </div>
  );
}

const PLAN_SEGMENTS: Array<{
  anchor: string;
  step: string;
  label: string;
  time: string;
  grow: number;
  color: string;
}> = [
  { anchor: "lab-order", step: "1", label: "Order the DNA", time: "5–10 business days", grow: 6, color: "var(--color-glyph-2)" },
  { anchor: "lab-build", step: "2", label: "Build the strain", time: "1–3 weeks", grow: 8, color: "var(--color-glyph-3)" },
  { anchor: "lab-verify", step: "3", label: "Verify the sequence", time: "2–5 days", grow: 2, color: "var(--color-glyph-4)" },
  { anchor: "lab-express", step: "4", label: "Express and measure titer", time: "3–7 days", grow: 3, color: "var(--color-accent-2)" },
  { anchor: "lab-assay", step: "5", label: "Assay function", time: "1–2 weeks", grow: 6, color: "var(--color-accent)" },
];

function PlanStrip(): React.ReactElement {
  return (
    <div className={styles.labPlan} aria-label="Outsourced run planning timeline">
      <p className={styles.bioCellTitle}>
        <strong>Plan the run: ≈ 4–9 weeks from DNA order to assay data</strong>
      </p>
      <div className={styles.labPlanBar} aria-hidden="true">
        {PLAN_SEGMENTS.map((seg) => (
          <span
            key={seg.step}
            className={styles.labPlanSeg}
            style={{ flexGrow: seg.grow, background: seg.color }}
            title={`${seg.label} — ${seg.time}`}
          />
        ))}
      </div>
      <ul className={styles.labPlanLegend}>
        {PLAN_SEGMENTS.map((seg) => (
          <li key={seg.step}>
            <span
              className={styles.labPlanSwatch}
              style={{ background: seg.color }}
              aria-hidden="true"
            />
            <a href={`#${seg.anchor}`}>
              {seg.step} · {seg.label}
            </a>{" "}
            — {seg.time}
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        Planning ranges for an outsourced run: vendor queues, CRO
        scheduling, and strain troubleshooting move these — MIC and
        cytotoxicity already run in parallel inside step 5. Steps 0, 6,
        and 7 are bench-free; step 8 is an optional photo check.
      </p>
    </div>
  );
}

function UploadWidget({
  assay,
  runId,
  token,
  consent,
  done,
  demo,
  onSubmitted,
}: {
  assay: AssayType;
  runId: string;
  token: string;
  consent: boolean;
  done: boolean;
  demo: boolean;
  onSubmitted: (assay: AssayType) => void;
}): React.ReactElement {
  const template = ASSAY_TEMPLATES[assay];
  const [fileName, setFileName] = useState("");
  const [contentText, setContentText] = useState<string | null>(null);
  const [contentBase64, setContentBase64] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState("");
  const [previewOk, setPreviewOk] = useState<boolean | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const acceptsFasta = assay === "sequence_verification";

  async function onFile(file: File | undefined): Promise<void> {
    setStatus("");
    setPreview("");
    setPreviewOk(null);
    setContentText(null);
    setContentBase64(null);
    if (file === undefined) {
      setFileName("");
      return;
    }
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let text: string | null = null;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = null;
    }
    if (text === null) {
      if (!acceptsFasta) {
        setPreview("Not decodable text. Binary uploads are accepted for sequence-verification traces only.");
        setPreviewOk(false);
        return;
      }
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i] ?? 0);
      }
      setContentBase64(btoa(binary));
      setPreview("Binary trace: stored unparsed for manual review.");
      setPreviewOk(true);
      return;
    }
    setContentText(text);
    if (acceptsFasta && looksLikeFasta(text)) {
      const fasta = parseFasta(text);
      if (!fasta.ok) {
        setPreview(fasta.errors.join(" "));
        setPreviewOk(false);
        return;
      }
      setPreview(
        `${fasta.sequences.length} FASTA reads ready (${fasta.sequences.reduce((sum, entry) => sum + entry.sequence.length, 0)} bases).`
      );
      setPreviewOk(true);
      return;
    }
    const csv = parseAssayCsv(assay, text);
    if (!csv.ok) {
      setPreview(csv.errors.join(" "));
      setPreviewOk(false);
      return;
    }
    setPreview(
      `${csv.measurements.length} rows ready${csv.sniffed ? " (columns auto-mapped from a raw export)" : ""}.`
    );
    setPreviewOk(true);
  }

  async function submit(): Promise<void> {
    if (!demo && token.length === 0) {
      setStatus("Enter your API token above first.");
      return;
    }
    if (contentText === null && contentBase64 === null) {
      setStatus("Choose a file first.");
      return;
    }
    if (demo) {
      setStatus("Demo submission recorded locally — nothing was sent.");
      onSubmitted(assay);
      return;
    }
    setBusy(true);
    setStatus("Submitting…");
    try {
      const response = await fetch("/api/assay-results", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          run_id: runId,
          assay_type: assay,
          template_version: ASSAY_TEMPLATE_VERSION,
          file_name: fileName,
          ...(contentText !== null
            ? { content_text: contentText }
            : { content_base64: contentBase64 }),
          ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
          consent_community: consent,
        }),
      });
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: { assay_id?: string | null; sniffed?: boolean };
      };
      if (!response.ok || body.success !== true) {
        setStatus(`Rejected: ${body.error ?? `HTTP ${response.status}`}`);
        return;
      }
      setStatus(
        `Recorded${body.data?.sniffed === true ? " (columns auto-mapped)" : ""}${body.data?.assay_id !== null && body.data?.assay_id !== undefined ? ` — ${body.data.assay_id.slice(0, 8)}` : ""}.`
      );
      onSubmitted(assay);
    } catch {
      setStatus("Network error submitting results.");
    } finally {
      setBusy(false);
    }
  }

  const locked = (!demo && token.length === 0) || busy;

  return (
    <div className={styles.labUpload}>
      <p className={styles.bioCellTitle}>
        <strong>{template.hint}</strong>
      </p>
      <p className={styles.note}>
        New here, or sending this to a contract lab?{" "}
        <a href={`/api/assay-templates?type=${assay}`} download>
          Download the {assay.replace(/_/g, " ")} template CSV
        </a>{" "}
        — one example row included. Raw instrument exports are accepted
        too; columns get auto-mapped when recognized.
        {acceptsFasta ? " FASTA reads accepted as well." : ""}
      </p>
      <label className={styles.optlabel} htmlFor={`lab-file-${assay}`}>
        Results file
      </label>
      <input
        id={`lab-file-${assay}`}
        className={styles.otherinput}
        type="file"
        accept={acceptsFasta ? ".csv,.txt,.fasta,.fa,.ab1" : ".csv,.txt"}
        disabled={locked}
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
        }}
      />
      {preview !== "" && (
        <p
          className={styles.note}
          style={previewOk === false ? { color: "var(--color-error)" } : undefined}
        >
          {preview}
        </p>
      )}
      <label className={styles.optlabel} htmlFor={`lab-notes-${assay}`}>
        Notes for the record (optional)
      </label>
      <input
        id={`lab-notes-${assay}`}
        className={styles.otherinput}
        type="text"
        placeholder="e.g. plate 2, edge wells excluded"
        value={notes}
        disabled={locked}
        onChange={(event) => setNotes(event.target.value)}
      />
      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary}`}
        disabled={locked || done}
        onClick={() => {
          void submit();
        }}
      >
        {done ? "Submitted" : busy ? "Submitting…" : "Submit results"}
      </button>
      {status !== "" && <p className={styles.note}>{status}</p>}
    </div>
  );
}

const DEMO_RUN: LabRun = {
  id: "demo",
  target: "C. difficile colonization (demo)",
  modality: "knottin-6c",
  candidateId: "demo-cand-1",
  candidateSequence: "ACDEFGHIKLMNPQRSTVWYACDEFGH",
  labHandoff: { host_display: "S. boulardii (demo)" },
};

const DEMO_DISPATCH = `{
  "schema": "cozy-peptide.lab-dispatch/1",
  "run_id": "demo",
  "note": "Sample work order. Bind a real run and enter a token for live data.",
  "design": {
    "target": "C. difficile colonization (demo)",
    "candidate_sequence": "ACDEFGHIKLMNPQRSTVWYACDEFGH",
    "dna_gblock": "<120-600 bp construct>",
    "order_csv": "<downloadable from the run handoff>"
  },
  "experiment_panel": ["sequence_verification", "expression_titer", "mic", "cytotoxicity"],
  "result_ingest": {
    "endpoint": "/api/assay-results",
    "auth": "Authorization: Bearer <API_BEARER_TOKEN>"
  }
}`;

export default function Guide(): React.ReactElement {
  const params = useSearchParams();
  const [demo, setDemo] = useState(false);
  const [runId, setRunId] = useState<string | null>(() => {
    const fromUrl = params.get("run");
    return fromUrl !== null && fromUrl.length > 0 ? fromUrl : null;
  });
  const [run, setRun] = useState<LabRun | null>(null);
  const [runError, setRunError] = useState("");
  const [token, setToken] = useState(() => {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState<LabProgress>({
    ordered: false,
    built: false,
    submitted: [],
  });
  const [dispatch, setDispatch] = useState("");
  const [dispatchBusy, setDispatchBusy] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (runId === null) {
        setRun(null);
        return;
      }
      if (runId === "demo") {
        setRunError("");
        setProgress(loadProgress("demo"));
        setRun(DEMO_RUN);
        return;
      }
      setRunError("");
      setProgress(loadProgress(runId));
      void fetch(`/api/peptide-run?id=${encodeURIComponent(runId)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return (await response.json()) as { data?: unknown };
        })
        .then((body) => {
          const parsed = asLabRun(body.data);
          if (parsed === null) {
            setRun(null);
            setRunError("That run has no usable design record.");
            return;
          }
          setRun(parsed);
        })
        .catch(() => {
          setRun(null);
          setRunError("Could not load that run. Pick one below.");
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [runId]);

  const saveToken = useCallback((value: string) => {
    setToken(value);
    try {
      if (value.length > 0) window.sessionStorage.setItem(TOKEN_KEY, value);
      else window.sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Private mode: token simply will not persist.
    }
  }, []);

  const markSubmitted = useCallback(
    (assay: AssayType) => {
      if (runId === null) return;
      setProgress((current) => {
        if (current.submitted.includes(assay)) return current;
        const next = {
          ...current,
          submitted: [...current.submitted, assay],
        };
        try {
          window.localStorage.setItem(progressKey(runId), JSON.stringify(next));
        } catch {
          // Private mode: progress simply will not persist.
        }
        return next;
      });
    },
    [runId]
  );

  const toggleManual = useCallback(
    (key: "ordered" | "built") => {
      if (runId === null) return;
      setProgress((current) => {
        const next = { ...current, [key]: !current[key] };
        try {
          window.localStorage.setItem(progressKey(runId), JSON.stringify(next));
        } catch {
          // Private mode: progress simply will not persist.
        }
        return next;
      });
    },
    [runId]
  );

  async function loadDispatch(): Promise<void> {
    if (runId === null) return;
    if (demo || token.length === 0) {
      if (demo) setDispatch(DEMO_DISPATCH);
      return;
    }
    setDispatchBusy(true);
    setDispatch("");
    try {
      const response = await fetch(
        `/api/lab-dispatch?run=${encodeURIComponent(runId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const body = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: unknown;
      };
      setDispatch(
        response.ok && body.success === true
          ? JSON.stringify(body.data, null, 2)
          : `Error: ${body.error ?? `HTTP ${response.status}`}`
      );
    } catch {
      setDispatch("Error: network failure loading the work order.");
    } finally {
      setDispatchBusy(false);
    }
  }

  function pickRun(picked: RecentRun): void {
    setDemo(false);
    setDispatch("");
    setRunId(picked.id);
  }

  function enterDemo(): void {
    setDemo(true);
    setDispatch("");
    setRunId("demo");
  }

  function exitDemo(): void {
    setDemo(false);
    setDispatch("");
    setRunId(null);
  }

  const hostDisplay =
    run !== null &&
    run.labHandoff !== null &&
    typeof run.labHandoff.host_display === "string"
      ? run.labHandoff.host_display
      : null;

  return (
    <>
      <div className={styles.bioProse}>
        <p>
          The designer is a one-shot instrument; this guide makes it a
          learning pipeline. Work the steps in order, upload what the
          bench produces, and every submission sharpens the next round
          of designs — for you first, and, only with your explicit
          permission, for the model-developer community training the
          next generation of design models.
        </p>
      </div>
      <PlanStrip />
      {demo && (
        <p className={styles.note}>
          Demo mode: sample run, simulated submissions — nothing is
          sent and no models run.{" "}
          <button
            type="button"
            className={styles.demolink}
            onClick={exitDemo}
          >
            [Exit demo]
          </button>
        </p>
      )}

      <div className={`${styles.bioSub} ${styles.labStep}`} id="lab-run">
        <StepHead id="lab-run-head" index="0" title="Bind a run" done={run !== null} icon="link" time="minutes" />
        <div className={styles.bioProse}>
          <p>
            {run === null
              ? "Pick the design this lab work belongs to. Everything submitted here is recorded against that run ID."
              : `Working on ${run.candidateId ?? "candidate"} for ${run.target}${run.modality !== null ? ` (${run.modality})` : ""}.`}
          </p>
        </div>
        {runError !== "" && <p className={styles.note}>{runError}</p>}
        <Recent onUse={pickRun} />
      </div>

      <div className={styles.labToken} id="lab-token">
        <label className={styles.optlabel} htmlFor="lab-token-input">
          API token (required for uploads)
        </label>
        <input
          id="lab-token-input"
          className={styles.otherinput}
          type="password"
          autoComplete="off"
          placeholder="Paste your API bearer token"
          value={token}
          onChange={(event) => saveToken(event.target.value.trim())}
        />
        <p className={styles.note}>
          Uploads and lab work orders are restricted to credentialed
          users. The token lives only in this browser tab and is sent
          solely with your submissions. No token?{" "}
          <button
            type="button"
            className={styles.demolink}
            onClick={enterDemo}
          >
            [Demo]
          </button>{" "}
          takes you through with sample data — nothing runs, nothing
          is sent.
        </p>
      </div>

      <div className={`${styles.bioSub} ${styles.labStep}`} id="lab-order">
        <StepHead id="lab-order-head" index="1" title="Order the DNA" done={progress.ordered} icon="dna" time="5–10 business days" />
        <div className={styles.bioProse}>
          <p>
            From your run&apos;s Lab Handoff tab, download the order
            CSV (gBlock plus precursor cDNA, lengths and GC included)
            and place it with a synthesis vendor such as Twist or IDT
            — gene fragments run about $0.07 per base. The construct
            arrives ready to clone.
          </p>
        </div>
        <p className={styles.note}>
          {runId !== null ? (
            <Link href={`/design?run=${runId}`}>Open this run&apos;s handoff</Link>
          ) : (
            "Bind a run above to jump straight to its handoff."
          )}
        </p>
        <label className={styles.labCheck}>
          <input
            type="checkbox"
            checked={progress.ordered}
            disabled={runId === null}
            onChange={() => toggleManual("ordered")}
          />{" "}
          DNA ordered
        </label>
      </div>

      <div className={`${styles.bioSub} ${styles.labStep}`} id="lab-build">
        <StepHead id="lab-build-head" index="2" title="Build the strain" done={progress.built} icon="microbe" time="1–3 weeks" />
        <div className={styles.bioProse}>
          <p>
            Clone the fragment into{" "}
            {hostDisplay ?? "your run's chassis"} following the host
            plan in the handoff (secretion leader, folding, and
            containment notes). Doing this through a contract lab?
            Send them the machine work order below, or pick a vendor
            from the <Link href="/design#providers">provider directory</Link>.
          </p>
        </div>
        <button
          type="button"
          className={styles.btn}
          disabled={runId === null || (!demo && token.length === 0) || dispatchBusy}
          onClick={() => {
            void loadDispatch();
          }}
        >
          {dispatchBusy ? "Loading…" : "Load machine work order"}
        </button>
        {dispatch !== "" && (
          <details className={styles.rawjson} open>
            <summary>lab-dispatch payload</summary>
            <pre>{dispatch}</pre>
          </details>
        )}
        <label className={styles.labCheck}>
          <input
            type="checkbox"
            checked={progress.built}
            disabled={runId === null}
            onChange={() => toggleManual("built")}
          />{" "}
          Strain built
        </label>
      </div>

      <div className={`${styles.bioSub} ${styles.labStep}`} id="lab-verify">
        <StepHead
          id="lab-verify-head"
          index="3"
          title="Verify the sequence"
          done={progress.submitted.includes("sequence_verification")}
          icon="clipboard"
          time="2–5 days"
        />
        <div className={styles.bioProse}>
          <p>
            Confirm the built construct matches the designed DNA
            before expressing anything. Upload Sanger or
            full-plasmid reads as FASTA, or the filled verification
            template.
          </p>
        </div>
        {runId !== null && (
          <UploadWidget
            assay="sequence_verification"
            runId={runId}
            token={token}
            consent={consent}
            done={progress.submitted.includes("sequence_verification")}
            demo={demo}
            onSubmitted={markSubmitted}
          />
        )}
      </div>

      <div className={`${styles.bioSub} ${styles.labStep}`} id="lab-express">
        <StepHead
          id="lab-express-head"
          index="4"
          title="Express and measure titer"
          done={progress.submitted.includes("expression_titer")}
          icon="flask"
          time="3–7 days"
        />
        <div className={styles.bioProse}>
          <p>
            Grow the verified strain, harvest the supernatant, and
            quantify secreted peptide (ELISA, HPLC, or blot). Upload
            the titer table.
          </p>
        </div>
        {runId !== null && (
          <UploadWidget
            assay="expression_titer"
            runId={runId}
            token={token}
            consent={consent}
            done={progress.submitted.includes("expression_titer")}
            demo={demo}
            onSubmitted={markSubmitted}
          />
        )}
      </div>

      <div className={`${styles.bioSub} ${styles.labStep}`} id="lab-assay">
        <StepHead
          id="lab-assay-head"
          index="5"
          title="Assay function"
          done={
            progress.submitted.includes("mic") &&
            progress.submitted.includes("cytotoxicity")
          }
          icon="target"
          time="1–2 weeks"
        />
        <div className={styles.bioProse}>
          <p>
            Two uploads: antimicrobial potency (MIC, broth
            microdilution against the target pathogen) and mammalian
            cytotoxicity (viability at and above the MIC). Both feed
            the learning loop.
          </p>
        </div>
        {runId !== null && (
          <>
            <UploadWidget
              assay="mic"
              runId={runId}
              token={token}
              consent={consent}
              done={progress.submitted.includes("mic")}
              demo={demo}
              onSubmitted={markSubmitted}
            />
            <UploadWidget
              assay="cytotoxicity"
              runId={runId}
              token={token}
              consent={consent}
              done={progress.submitted.includes("cytotoxicity")}
              demo={demo}
              onSubmitted={markSubmitted}
            />
          </>
        )}
      </div>

      <div className={`${styles.bioSub} ${styles.labStep}`} id="lab-consent">
        <StepHead id="lab-consent-head" index="6" title="Review and consent" done={false} icon="shield" time="minutes" />
        <div className={styles.bioProse}>
          <p>
            Your submissions always improve your own next designs:
            recorded outcomes re-rank future candidates away from
            what the bench disproved. Separately, you may let your
            de-identified measurements join the community dataset
            that model developers train on — shared under CC0, with
            notes and raw files never exported. Off by default, per
            submission, changeable any time before you submit.
          </p>
        </div>
        <label className={styles.labCheck}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />{" "}
          Share my de-identified measurements with the model-developer
          community (CC0)
        </label>
      </div>

      <div className={`${styles.bioSub} ${styles.labStep}`} id="lab-done">
        <StepHead
          id="lab-done-head"
          index="7"
          title="Submit and iterate"
          done={progress.submitted.length === 4}
          icon="loop"
          time="as you go"
        />
        <div className={styles.bioProse}>
          <p>
            Each upload above submits independently — nothing waits
            for the rest. Once results land, design the next round:
            the ledger ties every measurement to the run that
            produced it, so future candidates learn from this one.
          </p>
        </div>
        <p className={styles.note}>
          <Link href={runId !== null ? `/design?run=${runId}` : "/design"}>
            Back to the design
          </Link>
        </p>
      </div>

      <div className={`${styles.bioSub} ${styles.labStep}`} id="lab-cro">
        <StepHead
          id="lab-cro-head"
          index="8"
          title="CRO image check"
          done={false}
          icon="document"
          time="minutes"
        />
        <div className={styles.bioProse}>
          <p>
            Optional. When the CRO sends back plate photos or
            microscopy, verify them here before paying for the next
            loop: colony plates prove the build, reporter fields prove
            expression, cell photos prove rescue.
          </p>
        </div>
        <CroImageCheck token={token} />
      </div>

      <div className={`${styles.bioSub} ${styles.labStep}`} id="lab-integrators">
        <StepHead id="lab-integrators-head" index="API" title="For lab integrators" done={false} icon="briefcase" />
        <div className={styles.bioProse}>
          <p>
            Contract labs and CRO pipelines skip the browser: every
            step above is an API call with the same bearer token.
            Pull the work order, fetch templates, submit results,
            export the consented dataset.
          </p>
        </div>
        <details className={styles.rawjson} open>
          <summary>programmatic loop</summary>
          <pre>
{`# 1. Pull the machine work order for a run
curl https://cozy-peptide.vercel.app/api/lab-dispatch?run=<uuid> \\
  -H "Authorization: Bearer $API_BEARER_TOKEN"

# 2. Fetch a fillable template (no auth needed)
curl "https://cozy-peptide.vercel.app/api/assay-templates?type=mic" -o mic.csv

# 3. Submit filled results (browser-equivalent JSON)
curl -X POST https://cozy-peptide.vercel.app/api/assay-results \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $API_BEARER_TOKEN" \\
  -d '{"run_id":"<uuid>","assay_type":"mic","template_version":"labguide-1",
       "file_name":"mic.csv","content_text":"<csv>",
       "consent_community":false}'

# 4. Export the consented community dataset
curl "https://cozy-peptide.vercel.app/api/assay-export?format=csv" \\
  -H "Authorization: Bearer $API_BEARER_TOKEN" -o community.csv`}
          </pre>
        </details>
      </div>
    </>
  );
}
