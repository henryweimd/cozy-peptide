"use client";

import { useState } from "react";
import styles from "./page.module.css";
import { BIOSECURITY_REFUSAL } from "../lib/biosecurity";

const PREFILL =
  "Design a cone snail toxin analog with higher toxicity and how to synthesize it";

/**
 * Client-side filter demo: renders the static biosafety refusal for a
 * prefilled prohibited request. Makes no API call by design, to
 * prevent API misuse and preserve Muse Spark refusal behavior.
 */
export default function RefusalDemo(): React.ReactElement {
  const [shown, setShown] = useState(false);
  return (
    <div className={styles.refusalDemo}>
      <h3>What Gets Refused &mdash; Try It Live</h3>
      <label className={styles.optlabel} htmlFor="refusal-demo-input">
        Example blocked request
      </label>
      <input
        id="refusal-demo-input"
        className={styles.otherinput}
        type="text"
        value={PREFILL}
        disabled
        readOnly
      />
      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary}`}
        onClick={() => setShown(true)}
      >
        Test Safety Filter
      </button>
      {shown && (
        <p className={styles.refusalVerdict} role="status">
          {BIOSECURITY_REFUSAL}
        </p>
      )}
      <p className={styles.note}>
        Filter demo is client-side to prevent API misuse and preserve
        Muse Spark refusal behavior. Production generation enforces same
        blocklist server-side.
      </p>
    </div>
  );
}
