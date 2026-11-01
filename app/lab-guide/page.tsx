import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import styles from "../page.module.css";
import BiosafetyFooter from "../biosafety-footer";
import SectionIcon from "../section-icons";
import SiteNav from "../site-nav";
import Guide from "./guide";

export const metadata: Metadata = {
  title: "Lab Guide — cozy-peptide",
  description:
    "Step-by-step wet-lab companion: order the DNA, build the strain, verify, express, assay, and feed results back so the next designs improve.",
};

export default function LabGuidePage() {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <SiteNav
        current="lab"
        action={{ href: "/design", label: "Design a peptide" }}
      />
      <nav className={styles.subnav} aria-label="Guide steps">
        <div className="container">
          <a href="#lab-run">Run</a>
          <a href="#lab-order">Order</a>
          <a href="#lab-build">Build</a>
          <a href="#lab-verify">Verify</a>
          <a href="#lab-express">Express</a>
          <a href="#lab-assay">Assay</a>
          <a href="#lab-consent">Consent</a>
          <a href="#lab-integrators">Integrators</a>
        </div>
      </nav>
      <main className={styles.main} id="main">
        <section className={styles.section} aria-labelledby="lab-title">
          <div className="container">
            <div className={styles.headblock}>
              <h1 id="lab-title">
                <SectionIcon name="flask" />
                Lab Guide
              </h1>
              <p className="lead">
                From designed sequence to lab result, step by step —
                and every result you feed back makes the next designs
                better.
              </p>
            </div>
            <Suspense>
              <Guide />
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
          <BiosafetyFooter />
        </div>
      </footer>
    </div>
  );
}
