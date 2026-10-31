import type { Metadata } from "next";
import Link from "next/link";
import styles from "../page.module.css";
import Designer from "./designer";

export const metadata: Metadata = {
  title: "Full designer — cozy-peptide",
  description:
    "Design a peptide with full controls: condition, scaffold, charge, and literature research, with live pipeline telemetry.",
};

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
      <main className={styles.main} id="main">
        <section
          className={styles.section}
          aria-labelledby="design-title"
        >
          <div className="container">
            <div className={styles.headblock}>
              <h1 id="design-title">The full designer</h1>
              <p className="lead">
                Every control the demo holds back: scaffold, charge, and
                the literature research stage.
              </p>
            </div>
            <Designer />
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className="container">
          <p className={styles.footlegal}>
            <Link className={styles.footlink} href="/">
              Back to the overview
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
