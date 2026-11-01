import Link from "next/link";
import styles from "./page.module.css";

/**
 * Always-visible research-use-only footer notice, rendered small in
 * every page footer.
 */
export default function BiosafetyFooter(): React.ReactElement {
  return (
    <p className={styles.biosafety}>
      <small>
        Cozy Peptide &mdash; For Research Use Only. Not medical,
        veterinary, or health advice. Not FDA-approved. No diagnosis,
        treatment, dosage, or synthesis recommendation. AI-generated
        peptide concepts are hypothetical, may be inaccurate, unsafe,
        or non-functional, and require independent verification by a
        qualified professional in a licensed facility. Do not
        synthesize, test, self-administer, or use for human or animal
        use. We block high-risk categories including known toxins,
        venoms, pathogens, select agents, and optimization for
        toxicity, infectivity, or immune evasion, and do not provide
        wet-lab protocols for flagged sequences. Built with Meta Model
        API (Muse Spark). Outputs may be logged for safety review. 18+
        only.{" "}
        <Link href="/#responsible-use-meta-ai-tooling">
          See Safety &amp; Intended Use.
        </Link>
      </small>
    </p>
  );
}
