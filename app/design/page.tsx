import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import styles from "../page.module.css";
import Designer from "./designer";

export const metadata: Metadata = {
  title: "Full designer — cozy-peptide",
  description:
    "Design a peptide with full controls: condition, scaffold, charge, and literature research, with live design status.",
};

const PROCESS_STEPS: Array<{
  title: string;
  body: string;
  meta: boolean;
}> = [
  {
    title: "Guard the input",
    body: "Free text is screened for injection, off-topic prompts, and safety, then revised into the most feasible target.",
    meta: false,
  },
  {
    title: "Research the disease",
    body: "Muse Spark condenses PubMed and Europe PMC evidence into molecular targets, mechanisms, and an avoid list.",
    meta: true,
  },
  {
    title: "Propose candidates",
    body: "Muse Spark 1.3 Contributor drafts novel sequences inside the scaffold grammar.",
    meta: true,
  },
  {
    title: "Verify symbolically",
    body: "The compiler checks loop grammar, charge, and chemical liabilities — nothing model-made passes unchecked.",
    meta: false,
  },
  {
    title: "Repair from diagnostics",
    body: "Failing candidates go back to Spark with compiler errors attached until one passes or turns run out.",
    meta: true,
  },
  {
    title: "Review blindly",
    body: "Spark predicts the target without seeing it; a mismatch fails the design as off-target.",
    meta: true,
  },
  {
    title: "Fold the winner",
    body: "Meta ESMFold predicts the 3D structure on demand so the disulfide core can be inspected.",
    meta: true,
  },
  {
    title: "Backstop when needed",
    body: "If upstream proposals fail outright, a deterministic sampler still delivers a grammar-valid design.",
    meta: false,
  },
];

export default function DesignPage() {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.topbar}>
        <div className={`container ${styles.masthead}`}>
          <Link className={styles.wordmark} href="/" aria-label="cozy-peptide home">
            cozy-peptide
          </Link>
          <nav className={styles.navrow} aria-label="Sections">
            <Link className={styles.navlink} href="/#api">
              the API call
            </Link>
            <Link className={styles.navlink} href="/#pipeline">
              the pipeline
            </Link>
            <Link className={styles.navlink} href="/#safety">
              safety
            </Link>
          </nav>
        </div>
      </header>
      <nav className={styles.subnav} aria-label="On this page">
        <div className="container">
          <a href="#how-it-works">How it works</a>
          <a href="#design-controls">Controls</a>
          <a href="#design-status">Design status</a>
          <a href="#design-result">Result</a>
        </div>
      </nav>
      <main className={styles.main} id="main">
        <section className={styles.section} aria-labelledby="design-title">
          <div className="container">
            <div className={styles.headblock}>
              <h1 id="design-title">The full designer</h1>
              <p className="lead">
                Every control the demo holds back: scaffold, charge, and
                the literature research stage.
              </p>
            </div>
            <div id="how-it-works">
              <h2>How a design happens</h2>
              <ol className={styles.howlist}>
                {PROCESS_STEPS.map((step, index) => (
                  <li key={step.title}>
                    <p className={styles.howhead}>
                      <span aria-hidden="true">{index + 1}.</span>{" "}
                      {step.title}{" "}
                      <span
                        className={
                          step.meta ? styles.modelbadge : styles.detbadge
                        }
                      >
                        {step.meta ? "Meta AI" : "Deterministic"}
                      </span>
                    </p>
                    <p className={styles.howbody}>{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
            <Suspense
              fallback={
                <p className={styles.note}>Loading designer…</p>
              }
            >
              <Designer />
            </Suspense>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className="container">
          <p className={styles.footlegal}>
            <a className={styles.footlink} href="#top">
              Back to top
            </a>
            {", "}
            <Link className={styles.footlink} href="/">
              Back to the overview
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
