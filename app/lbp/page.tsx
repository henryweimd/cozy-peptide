import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "../page.module.css";
import SiteNav from "../site-nav";

export const metadata: Metadata = {
  title: "LBP — Living medicines, made of microbes — cozy-peptide",
  description:
    "Live biotherapeutic products explained: what they are, the two FDA-approved LBPs, the late-stage pipeline, and how designed peptides turn microbes into living drug factories.",
};

const STORY: Array<{
  src: string;
  alt: string;
  title: string;
  body: string;
}> = [
  {
    src: "/lbp-design.webp",
    alt: "AI neural mesh above a forming peptide helix",
    title: "AI designs the peptide",
    body: "Muse Spark invents the sequence for the target.",
  },
  {
    src: "/lbp-insert.webp",
    alt: "Pipette placing DNA into a yeast cell",
    title: "DNA goes into the microbe",
    body: "The order is engineered into living yeast.",
  },
  {
    src: "/lbp-produce.webp",
    alt: "Yeast secreting peptides toward pathogens in the gut",
    title: "The microbe drugs the gut",
    body: "It secretes peptide inside you, on site.",
  },
];

export default function LbpPage(): React.ReactElement {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <SiteNav
        current="lbp"
        sections={[
          { href: "#what", label: "what they are" },
          { href: "#approved", label: "approved" },
          { href: "#pipeline", label: "pipeline" },
          { href: "#peptides", label: "peptides" },
        ]}
        action={{ href: "/design", label: "Design a peptide" }}
      />
      <main className={styles.main} id="main">
        <section className={styles.section} aria-labelledby="lbp-title">
          <div className="container">
            <div className={styles.headblock}>
              <h1 id="lbp-title">
                <span className={styles.lbpMark} aria-hidden="true">
                  LBP
                </span>
                <span className={styles.lbpName}>
                  Live Biotherapeutic Products
                </span>
              </h1>
              <p className="lead">
                Living medicines, made of microbes — medicines made of
                living microbes that treat disease from inside the gut.
              </p>
              <p className={styles.heroactions}>
                <Link className={styles.btn} href="#approved">
                  See approved LBPs
                </Link>{" "}
                <Link className={styles.btn} href="/design">
                  Design a peptide
                </Link>
              </p>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="lbp-what">
          <div className="container">
            <h2 id="lbp-what">What an LBP actually is</h2>
            <p>
              A live biotherapeutic product, or LBP, is a medicine
              whose active ingredient is alive: carefully chosen
              bacteria or yeast, given as a pill or enema, that take
              up residence in the gut and do therapeutic work there.
              The FDA treats LBPs as biological drugs — manufactured,
              dosed, and tested in trials like any medicine — which
              sets them apart from yogurt probiotics on one side and
              raw donor-stool transplants on the other.
            </p>
            <p>
              The simplest picture is a garden. Antibiotics are a
              wildfire: they kill the infection, but they also clear
              the ground. Whatever grows back first wins — and too
              often that is a pathogen. An LBP reseeds the ground
              with the right community so the pathogen finds no room
              to invade, a protection doctors call colonization
              resistance.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="lbp-why">
          <div className="container">
            <h2 id="lbp-why">Why living drugs matter</h2>
            <p>
              Antibiotics carpet-bomb. They cannot tell a pathogen
              from the thousand helpful species around it, and every
              course leaves the gut emptier and more invadable than
              before. Nowhere shows this better than{" "}
              <em>Clostridioides difficile</em>: roughly one in four
              patients relapses after antibiotics clear the first
              episode, and the odds worsen with each round, because
              the spores survive treatment and germinate into an
              emptied gut.
            </p>
            <p>
              A landmark 2013 trial proved the alternative: restoring
              the missing community cured most recurrent cases where
              antibiotics alone kept failing. LBPs are that insight
              turned into real products — standardized, screened, and
              dosed — and the same logic now extends toward
              inflammatory bowel disease, bloodstream infections
              after transplant, and beyond.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="lbp-approved">
          <div className="container">
            <h2 id="lbp-approved">Approved today: two products</h2>
            <p>
              Two LBPs have earned full FDA approval so far, both to
              prevent <em>C. difficile</em> from coming back after
              antibiotics — and both made from screened donor
              microbiota rather than engineered strains. No engineered
              LBP has been approved anywhere yet: that is the frontier
              this site builds toward.
            </p>
            <h3>Rebyota — first across the line</h3>
            <p>
              Made by Ferring and approved in November 2022, Rebyota
              is a single rectal dose of screened donor microbiota.
              In its pivotal program it kept about 71% of recurrent
              patients recurrence-free at eight weeks, against 58% on
              placebo.
            </p>
            <h3>Vowst — the first LBP pill</h3>
            <p>
              Developed by Seres Therapeutics (commercial rights moved
              to Nestlé Health Science in 2024) and approved in April
              2023, Vowst is purified bacterial spores in capsules —
              four a day for three days. In the 182-patient ECOSPOR
              III trial, published in the New England Journal of
              Medicine, only 12% of recipients relapsed within eight
              weeks versus 40% on placebo.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="lbp-pipeline">
          <div className="container">
            <h2 id="lbp-pipeline">The late-stage pipeline</h2>
            <p>
              The next wave replaces donor stool with defined,
              manufactured consortia — every strain known, every dose
              identical — and pushes beyond <em>C. difficile</em>{" "}
              into transplant medicine and inflammatory disease.
            </p>
            <table className={styles.apitable}>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Maker</th>
                  <th scope="col">What it is</th>
                  <th scope="col">Stage</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Product">VE303</td>
                  <td data-label="Maker">Vedanta Biosciences</td>
                  <td data-label="What it is">
                    Eight-strain defined oral consortium for recurrent{" "}
                    <em>C. difficile</em>
                  </td>
                  <td data-label="Stage">
                    Phase 3 (RESTORATiVE303; topline expected first
                    half of 2027)
                  </td>
                </tr>
                <tr>
                  <td data-label="Product">MaaT013</td>
                  <td data-label="Maker">MaaT Pharma</td>
                  <td data-label="What it is">
                    Pooled donor microbiota enema for severe
                    graft-versus-host disease
                  </td>
                  <td data-label="Stage">Phase 3 (ARES trial)</td>
                </tr>
                <tr>
                  <td data-label="Product">MaaT033</td>
                  <td data-label="Maker">MaaT Pharma</td>
                  <td data-label="What it is">
                    Oral capsule version to improve survival after stem
                    cell transplant
                  </td>
                  <td data-label="Stage">Phase 2b (PHOEBUS trial)</td>
                </tr>
                <tr>
                  <td data-label="Product">SER-155</td>
                  <td data-label="Maker">Seres Therapeutics</td>
                  <td data-label="What it is">
                    Cultivated multi-strain consortium against
                    bloodstream infections after transplant
                  </td>
                  <td data-label="Stage">
                    Phase 2 ready (77% fewer infections in Phase 1b;
                    Breakthrough designation)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="lbp-peptides">
          <div className="container">
            <h2 id="lbp-peptides">Where peptide design plugs in</h2>
            <p>
              Today&apos;s LBPs work by competition and chemistry they
              happen to make. The engineered generation will carry
              custom payloads: a harmless gut yeast, rewritten to
              secrete a designed peptide exactly where the pathogen
              lives — a living factory with a programmable product.
            </p>
            <ol className={styles.storyrow}>
              {STORY.map((step) => (
                <li key={step.src}>
                  <figure>
                    <Image
                      src={step.src}
                      alt={step.alt}
                      width={1920}
                      height={1280}
                      sizes="(max-width: 60rem) 100vw, 33vw"
                    />
                    <figcaption>
                      <strong>{step.title}</strong>
                      <span>{step.body}</span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ol>
            <p>
              That is what this site designs: the payload. Name a gut
              condition and the pipeline invents peptide candidates
              against its molecular targets, verifies each one with a
              symbolic compiler, folds it in 3D, and hands you the DNA
              order a lab needs to build it into a real LBP chassis.
            </p>
            <p className={styles.heroactions}>
              <Link className={styles.btn} href="/design">
                Design a peptide
              </Link>
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="lbp-sources">
          <div className="container">
            <h2 id="lbp-sources">Sources</h2>
            <ul className={styles.trace}>
              <li>
                <a href="https://www.frontiersin.org/journals/microbiology/articles/10.3389/fmicb.2026.2002085/full">
                  Engineered live biotherapeutic products: design
                  decisions and clinical translation
                </a>{" "}
                — Frontiers in Microbiology (approvals, engineered
                frontier)
              </li>
              <li>
                <a href="https://conferences.medicom-publishers.com/specialisation/gastroenterology/spore-therapy-cuts-c-difficile-reinfection-by-68-in-8-week-study/">
                  ECOSPOR III: spore therapy cuts reinfection by 68%
                </a>{" "}
                — NEJM trial report (Vowst 12% vs 40%)
              </li>
              <li>
                <a href="https://pulse2.com/vedanta-biosciences-raises-60-million-to-advance-phase-3-ve303-study/">
                  Vedanta advances Phase 3 VE303 study
                </a>{" "}
                — RESTORATiVE303 timelines
              </li>
              <li>
                <a href="https://www.globenewswire.com/news-release/2026/08/05/3339196/0/en/seres-therapeutics-reports-second-quarter-2026-financial-results-and-provides-business-updates-including-further-action-to-reduce-ongoing-facilities-costs.html">
                  Seres Q2 2026 update
                </a>{" "}
                — SER-155 Phase 2 readiness
              </li>
              <li>
                <a href="https://www.biospace.com/maat-pharma-announces-first-patient-dosed-in-phase-2b-randomized-clinical-trial-evaluating-maat033-in-patients-receiving-allo-hsct">
                  MaaT Pharma doses first Phase 2b patient
                </a>{" "}
                — MaaT033 PHOEBUS trial
              </li>
            </ul>
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
