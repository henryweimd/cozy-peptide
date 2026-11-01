import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import styles from "../page.module.css";
import SiteNav from "../site-nav";
import Designer from "./designer";

export const metadata: Metadata = {
  title: "Design a peptide — cozy-peptide",
  description:
    "Name a gut condition: AI-drafted, compiler-verified peptides with 3D structure and lab-ready DNA orders.",
};

export default function DesignPage() {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <SiteNav
        current="design"
        action={{ href: "#design-controls", label: "Start designing" }}
      />
      <nav className={styles.subnav} aria-label="On this page">
        <div className="container">
          <a href="#design-controls">Controls</a>
          <a href="#design-status">Design status</a>
          <a href="#design-result">Result</a>
          <a href="#recent-runs">Recent runs</a>
          <a href="#providers">Providers</a>
        </div>
      </nav>
      <main className={styles.main} id="main">
        <section className={styles.section} aria-labelledby="design-title">
          <div className="container">
            <div className={styles.headblock}>
              <h1 id="design-title">Design a peptide</h1>
              <p className="lead">
                Name a gut condition. Muse Spark drafts candidates on
                the best scaffold for the job, a symbolic compiler
                verifies them, and you get a sequence, 3D structure,
                and a lab-ready DNA order.
              </p>
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
        <section
          className={styles.section}
          aria-labelledby="providers-title"
        >
          <div className="container" id="providers">
            <div className={styles.headblock}>
              <h2 id="providers-title">Build it: service providers</h2>
              <p className="lead">
                From the downloads above to DNA to a living drug: who
                can make each step real.
              </p>
            </div>
            <h3>Custom DNA synthesis</h3>
            <p>
              Order the DNA order CSV and gBlock FASTA from any
              synthesis house. All six build custom double-stranded
              fragments and sequence-verified genes from pasted
              sequence:
            </p>
            <ul className={styles.providerlist}>
              <li>
                <a href="https://www.twistbioscience.com">
                  Twist Bioscience
                </a>{" "}
                — silicon-platform gene synthesis and oligo pools.
              </li>
              <li>
                <a href="https://www.idtdna.com">
                  Integrated DNA Technologies (IDT)
                </a>{" "}
                — gBlocks gene fragments and custom gene synthesis.
              </li>
              <li>
                <a href="https://www.genscript.com">GenScript</a> —
                custom gene synthesis with cloning into your vector.
              </li>
              <li>
                <a href="https://www.azenta.com">Azenta (GENEWIZ)</a>{" "}
                — gene synthesis plus Sanger and NGS verification.
              </li>
              <li>
                <a href="https://www.eurofinsgenomics.com">
                  Eurofins Genomics
                </a>{" "}
                — gene synthesis and oligonucleotides, EU and US labs.
              </li>
              <li>
                <a href="https://www.camenabio.com">
                  Camena Bioscience
                </a>{" "}
                — enzymatic gene synthesis for long, complex
                constructs.
              </li>
            </ul>
            <h3>Engineered LBP development and manufacturing</h3>
            <p>
              Turning the construct into an engineered live
              biotherapeutic — strain engineering, process
              development, and GMP manufacturing — needs a
              microbiome-capable partner:
            </p>
            <ul className={styles.providerlist}>
              <li>
                <a href="https://www.ginkgo.bio">Ginkgo Bioworks</a>{" "}
                — foundry strain engineering, including Saccharomyces
                yeast chassis development.
              </li>
              <li>
                <a href="https://lallemand-health-solutions.com">
                  Lallemand Health Solutions
                </a>{" "}
                — probiotic yeast manufacturer producing
                Saccharomyces boulardii under GMP.
              </li>
              <li>
                <a href="https://listlabs.com">List Labs</a> —
                microbial CDMO with cGMP live biotherapeutic
                manufacturing for early clinical supply.
              </li>
              <li>
                <a href="https://www.wacker.com">Wacker Biotech</a> —
                microbial CDMO with a dedicated LBP development and
                GMP manufacturing platform.
              </li>
            </ul>
            <p className={styles.providernote}>
              Independent providers, listed for orientation — not
              endorsements. Confirm current capabilities, organism
              scope, and quality systems directly before engaging.
              Engineered LBPs are FDA-regulated drugs: clinical work
              runs through the IND pathway with appropriate
              containment and review.
            </p>
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
