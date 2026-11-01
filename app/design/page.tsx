import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import styles from "../page.module.css";
import SiteNav from "../site-nav";
import SectionIcon from "../section-icons";
import Designer from "./designer";
import { providersByKind } from "../../lib/providers";

export const metadata: Metadata = {
  title: "Design a peptide — cozy-peptide",
  description:
    "Name a gut condition: AI-drafted, compiler-verified peptides with 3D structure and lab-ready DNA orders.",
};

const SYNTHESIS_PROVIDERS = providersByKind("synthesis");
const CRO_PROVIDERS = providersByKind("cro-cdmo");

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
              <h2 id="providers-title">
                <SectionIcon name="briefcase" />
                Build it: service providers
              </h2>
              <p className="lead">
                From the downloads above to DNA to a living drug: who
                can make each step real.
              </p>
            </div>
            <h3>
              <SectionIcon name="dna" />
              Custom DNA synthesis
            </h3>
            <p>
              Order the DNA order CSV and gBlock FASTA from any
              synthesis house. Each builds custom double-stranded
              fragments and sequence-verified genes from pasted
              sequence, and re-optimizes codons for your chassis:
            </p>
            <ul className={styles.providerlist}>
              {SYNTHESIS_PROVIDERS.map((provider) => (
                <li key={provider.name}>
                  <a href={provider.url} target="_blank" rel="noreferrer">
                    {provider.name}
                  </a>
                  , {provider.relevance}
                </li>
              ))}
            </ul>
            <h3>
              <SectionIcon name="factory" />
              Engineered LBP development and manufacturing
            </h3>
            <p>
              Turning the construct into an engineered live
              biotherapeutic (strain engineering, process
              development, and GMP manufacturing) needs a
              microbiome-capable partner — several run dedicated
              live-biotherapeutic platforms across yeast, E. coli,
              Lactococcus, and Bacillus hosts:
            </p>
            <ul className={styles.providerlist}>
              {CRO_PROVIDERS.map((provider) => (
                <li key={provider.name}>
                  <a href={provider.url} target="_blank" rel="noreferrer">
                    {provider.name}
                  </a>
                  , {provider.relevance}
                </li>
              ))}
            </ul>
            <p className={styles.providernote}>
              Independent providers, listed for orientation, not
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
