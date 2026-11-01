import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "../page.module.css";
import SiteNav from "../site-nav";

export const metadata: Metadata = {
  title: "Bio & Business — cozy-peptide",
  description:
    "Living medicines end to end: what LBPs are, the two FDA approvals, the late-stage pipeline, the hidden debt in every payload, how the AI designer clears it, and the business case with market figures and build costs.",
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
    body: "The order is engineered into a living chassis.",
  },
  {
    src: "/lbp-produce.webp",
    alt: "Yeast secreting peptides toward pathogens in the gut",
    title: "The microbe drugs the gut",
    body: "It secretes peptide inside you, on site.",
  },
];

function IconTarget() {
  return (
    <svg className={styles.paraIcon} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" className={styles.paraIconDot} />
    </svg>
  );
}

function IconScaffold() {
  return (
    <svg className={styles.paraIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />
      <path d="M12 3v18M4.2 7.5l15.6 9" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg className={styles.paraIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l7 2.8v6.1c0 4.4-2.9 7.3-7 9.1-4.1-1.8-7-4.7-7-9.1V5.8z" />
      <path d="M9 11.8l2.2 2.2 4-4.2" />
    </svg>
  );
}

function IconSecrete() {
  return (
    <svg className={styles.paraIcon} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="11" width="13" height="9.5" rx="4.75" />
      <path d="M10 11V4.5M7.5 7L10 4.5 12.5 7" />
      <circle cx="16.5" cy="6" r="1.2" className={styles.paraIconDot} />
      <circle cx="20" cy="9.5" r="1.2" className={styles.paraIconDot} />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg className={styles.paraIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20.5C7.2 16.6 3.5 13.3 3.5 9.6A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 8.5 2.4c0 3.7-3.7 7-8.5 10.9z" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg className={styles.paraIcon} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export default function BiologyPage() {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <SiteNav
        current="biology"
        action={{ href: "/design", label: "Design a peptide" }}
      />
      <nav className={styles.subnav} aria-label="On this page">
        <div className="container">
          <a href="#lbp">LBP</a>
          <a href="#biology">Biology</a>
          <a href="#hidden-debt">Hidden debt</a>
          <a href="#designer">Designer</a>
          <a href="#market">Market</a>
          <a href="#costs">Costs</a>
          <a href="#solo">Solo path</a>
          <a href="#universe">Vision</a>
          <a href="#sources">Sources</a>
        </div>
      </nav>
      <main className={styles.main} id="main">
        <section className={styles.section} aria-labelledby="biology-title">
          <div className="container">
            <div className={styles.headblock}>
              <h1 id="biology-title">Bio &amp; Business</h1>
              <p className="lead">
                Microbes are factories. Peptides are the product. A wrong
                product is hidden debt &mdash; and hidden debt is what
                this site clears.
              </p>
              <p className={styles.heroactions}>
                <Link className={styles.btn} href="#lbp">
                  Living medicines
                </Link>{" "}
                <Link className={styles.btn} href="/design">
                  Design a peptide
                </Link>
              </p>
            </div>
            <div id="lbp">
              <h2>Living medicines, made of microbes</h2>
              <div className={styles.bioProse}>
                <p>
                  A live biotherapeutic product &mdash; an LBP &mdash; is a
                  medicine whose active ingredient is alive: chosen
                  bacteria or yeast, taken as a pill or enema, that take
                  up residence and do therapeutic work. The FDA regulates
                  LBPs as biological drugs &mdash; manufactured, dosed,
                  and trialed like any medicine &mdash; which sets them
                  apart from yogurt probiotics on one side and raw
                  donor-stool transplants on the other.
                </p>
                <p>
                  Picture a garden. Antibiotics are a wildfire: they kill
                  the infection and clear the ground, and whatever grows
                  back first wins &mdash; too often a pathogen. An LBP
                  reseeds the ground with the right community so invaders
                  find no room, a protection doctors call colonization
                  resistance.
                </p>
                <p>
                  Nowhere shows this better than{" "}
                  <em>Clostridioides difficile</em>: roughly one in four
                  patients relapses after antibiotics, with worsening
                  odds each round, because spores survive treatment and
                  germinate into an emptied gut. A landmark 2013 trial
                  proved the alternative &mdash; restoring the community
                  cured most recurrent cases &mdash; and LBPs are that
                  insight turned into standardized, screened, dosed
                  products.
                </p>
                <p>
                  <strong>Approved today: two products.</strong> Both
                  prevent <em>C.&nbsp;difficile</em> recurrence after
                  antibiotics, and both are made from screened donor
                  microbiota &mdash; no engineered strain has been
                  approved anywhere yet. That is the frontier this site
                  builds toward.
                </p>
                <p>
                  <strong>Rebyota (Ferring, November 2022).</strong> A
                  single rectal dose of donor microbiota; kept about 71%
                  of recurrent patients recurrence-free at eight weeks,
                  against 58% on placebo.
                </p>
                <p>
                  <strong>Vowst (Seres, April 2023).</strong> Purified
                  bacterial spores in capsules, four a day for three
                  days. In the 182-patient ECOSPOR III trial, published
                  in the New England Journal of Medicine, only 12% of
                  recipients relapsed within eight weeks versus 40% on
                  placebo.
                </p>
                <p>
                  <strong>The late-stage pipeline.</strong> The next wave
                  replaces donor stool with defined, manufactured
                  consortia &mdash; every strain known, every dose
                  identical &mdash; and pushes beyond{" "}
                  <em>C.&nbsp;difficile</em> into transplant medicine and
                  inflammatory disease.
                </p>
              </div>
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
              <div className={styles.bioProse}>
                <p>
                  <strong>Where peptide design plugs in.</strong>{" "}
                  Today&apos;s LBPs work by competition and chemistry they
                  happen to make. The engineered generation carries
                  custom payloads: a harmless resident, rewritten to
                  secrete a designed peptide exactly where disease
                  lives &mdash; a living factory with a programmable
                  product.
                </p>
              </div>
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
              <div className={styles.bioProse}>
                <p>
                  That payload is what this site designs &mdash; and
                  designing it is the hard part. The rest of this page:
                  the factory, the hidden debt, and the designer that
                  clears it.
                </p>
              </div>
            </div>
            <div id="biology">
              <h2>The biology: medicine brewed where disease lives</h2>
              <div className={styles.bioSplit}>
                <div className={styles.bioProse}>
                  <p>
                    Swallowed peptides rarely survive the trip: stomach
                    acid shreds them, and pancreatic proteases finish the
                    job. So the winning design never travels as a pill.
                    It ships as DNA, installed in a resident microbe
                    &mdash; a yeast like{" "}
                    <em>Saccharomyces boulardii</em>, or a gut bacterium
                    like E.&nbsp;coli Nissle &mdash; that brews the
                    medicine where the disease lives. The microbe is the
                    factory; the DNA cassette is the product line.
                  </p>
                  <p>
                    The gut is only the first factory floor: every
                    colonized surface of the body is a site waiting for
                    tenants, as <a href="#universe">the vision</a>{" "}
                    below shows.
                  </p>
                </div>
                <figure className={styles.bioFigure}>
                  <Image
                    src="/yeast-sem.jpg"
                    alt="Scanning electron micrograph of budding baker's yeast cells"
                    width={1280}
                    height={826}
                    sizes="(max-width: 60rem) 100vw, 288px"
                    loading="lazy"
                  />
                  <figcaption>
                    Baker&apos;s yeast budding under the electron
                    microscope: each cell a miniature factory. Micrograph:{" "}
                    <a
                      href="https://commons.wikimedia.org/wiki/File:Saccharomyces_cerevisiae_SEM.jpg"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Murtey and Ramasamy, CC BY 3.0, via Wikimedia Commons
                    </a>
                    .
                  </figcaption>
                </figure>
              </div>
            </div>
            <div id="outputs">
              <h2>What the factories make</h2>
              <div className={styles.bioProse}>
                <p>
                  LBPs stop looking like probiotics and start looking
                  like drugs the moment their outputs do. Three output
                  classes are already on the path to the clinic:
                </p>
                <p>
                  <strong>Metabolic sinks &mdash; living dialysis.</strong>{" "}
                  Engineered E.&nbsp;coli Nissle strains SYNB1618 and
                  SYNB1934 consume phenylalanine in the gut for
                  phenylketonuria: a 14-day study cut labeled-phenylalanine
                  exposure 34% and 43%. The pivotal trial was later
                  stopped &mdash; target engagement is not efficacy &mdash;
                  but the factory model reached the bloodstream without
                  ever entering it.
                </p>
                <p>
                  <strong>
                    Secreted biologics &mdash; drugs brewed on site.
                  </strong>{" "}
                  IL-10-secreting <em>Lactococcus lactis</em> set the
                  clinical precedent for cytokine delivery. GLP-1 analogs,
                  antimicrobial peptides, and replacement enzymes are the
                  obvious next products: conventional mechanisms,
                  manufactured at the mucosa instead of in a steel tank.
                </p>
                <p>
                  <strong>
                    Immune programming &mdash; the long-range thesis.
                  </strong>{" "}
                  Roughly 70% of the body&apos;s immune cells live in
                  gut-associated lymphoid tissue. Peptides delivered to
                  mucosal sampling machinery can re-educate immunity
                  locally and project the benefit systemically: calm a
                  joint, quiet skin, reset an allergy &mdash; all from
                  medicine brewed in the gut.
                </p>
              </div>
            </div>
            <div id="hidden-debt">
              <h2>The hidden debt: designing the wrong peptide</h2>
              <div className={styles.bioProse}>
                <p>
                  Building the factory is becoming routine. Chassis
                  engineering is increasingly commoditized: standard
                  genetic parts, published protocols, and contract labs
                  that will build you a verified strain for a few
                  thousand dollars. What kills LBP programs is the{" "}
                  <em>payload</em> &mdash; the actual peptide molecule
                  the factory is supposed to make.
                </p>
                <p>
                  A therapeutic peptide has to satisfy six constraints
                  at once, and they fight each other:
                </p>
                <p>
                  <IconTarget />
                  <strong>It must work.</strong> The peptide has to act
                  on a target that is actually causal in the disease,
                  active in the right cell state, and druggable in a
                  human &mdash; not just plausible in a pathway diagram.
                  Most clinical failures are target failures, not
                  chemistry failures.
                </p>
                <p>
                  <IconScaffold />
                  <strong>It must fold.</strong> Small constrained
                  peptides only work when their disulfide bonds pair
                  correctly and the backbone holds its shape. A
                  misfolded peptide is expensive cellular garbage.
                </p>
                <p>
                  <IconShield />
                  <strong>It must survive.</strong> The gut is a
                  demolition site: acid, bile, and a gauntlet of
                  proteases. A peptide that degrades in minutes never
                  reaches its target, however elegant its design.
                </p>
                <p>
                  <IconSecrete />
                  <strong>It must express.</strong> The chassis has to
                  manufacture and secrete the peptide without choking
                  on it &mdash; correct secretion signal, tolerable
                  expression burden, clean proteolytic processing. A
                  peptide that kills its own factory is a failed
                  product, whatever its potency.
                </p>
                <p>
                  <IconHeart />
                  <strong>It must be safe.</strong> No hemolysis, no
                  cytotoxicity, no immunogenic red flags, and no
                  broad-spectrum antimicrobial rampage that wipes out
                  the very microbiome the LBP lives in.
                </p>
                <p>
                  <IconLock />
                  <strong>It must be stable and contained.</strong> The
                  DNA cassette has to persist in the strain without
                  being lost or mutated away &mdash; and the engineered
                  microbe needs biocontainment, such as auxotrophy or
                  kill switches, so it cannot persist or spread where
                  it should not.
                </p>
                <p>
                  Traditional discovery optimizes these one at a time:
                  screen a library for binding, then fix stability,
                  then fix expression, then watch potency collapse
                  &mdash; each cycle costing months and a wet-lab loop.
                  The failure point of the field is not brewing
                  peptides in microbes. It is <em>designing</em> a
                  peptide that survives all six constraints on the
                  first serious try.
                </p>
              </div>
              <aside
                className={styles.expertbox}
                aria-labelledby="hidden-debt-expert-title"
              >
                <h3 id="hidden-debt-expert-title">
                  The expert version: biology-first payload design
                </h3>
                <p>
                  The dominant paradigm is target-centric and
                  structure-first: nominate a target, solve or predict
                  its structure, screen chemistry against the pocket.
                  In that frame, AlphaFold-class architectures are best
                  understood as high-resolution hypothesis generators
                  &mdash; superb at proposing <em>how</em> a molecule
                  might bind, silent on <em>whether</em> the target is
                  causal, active in the disease cell state, and
                  druggable in a human. Since target attrition in
                  clinical development is principally an evidence
                  problem, this pipeline front-loads causality,
                  cell-state specificity, and perturbation genetics
                  before burning a single cycle on structural biology:
                  function first, shape second.
                </p>
                <p>
                  For peptides expressed <em>in situ</em> by engineered
                  LBPs, the standard sequence-to-target pipeline inverts
                  completely. The LBP is an active, compartmentalized
                  delivery factory, so the biology of the local
                  microenvironment constrains the solution space before
                  generation: pH and protease exposure, mucus
                  penetration, epithelial proximity, and residence time
                  are design inputs, not downstream liabilities.
                </p>
              </aside>
            </div>
            <div id="designer">
              <h2>How the designer clears the hidden debt</h2>
              <div className={styles.bioProse}>
                <p>
                  This site is a general-purpose small-peptide designer
                  built around the six constraints above. The core
                  insight is borrowed from language: DNA spells genes
                  with four letters, proteins spell themselves with
                  twenty amino-acid letters, and a good protein obeys
                  a grammar &mdash; fold, charge, stability &mdash; the
                  way a good sentence obeys syntax. Chatbots predict
                  the next word; Muse Spark predicts the next building
                  block of a protein, and a proof compiler checks the
                  grammar. Evidence first, invention second, proof
                  always.
                </p>
                <p>
                  <strong>1. Literature grounds the prompt.</strong>{" "}
                  Diseases enter as words. Agents read PubMed and
                  Europe PMC first and synthesize a brief &mdash;
                  targets, mechanisms, and an explicit avoid list
                  &mdash; so generation aims at causal biology instead
                  of hallucinating it.
                </p>
                <p>
                  <strong>2. The scaffold matches the objective.</strong>{" "}
                  Seven small-peptide scaffolds, from knotted
                  knottins and cyclotides down to simple helices,
                  cover the stability&ndash;function trade-off. The
                  designer picks the default for your objective
                  &mdash; nothing over 37 residues &mdash; because
                  most users want a first run to just choose.
                </p>
                <p>
                  <strong>
                    3. The chassis is chosen by compatibility.
                  </strong>{" "}
                  Four oral chassis &mdash; <em>S.&nbsp;boulardii</em>{" "}
                  yeast, E.&nbsp;coli Nissle, <em>L.&nbsp;lactis</em>,
                  and <em>B.&nbsp;subtilis</em> spores &mdash; are
                  scored on secretion-signal fit, expression burden,
                  and proteolytic processing, and the best match
                  becomes the default. The peptide is designed{" "}
                  <em>for</em> its factory, not in the abstract.
                </p>
                <p>
                  <strong>4. The compiler proves, then repairs.</strong>{" "}
                  Every candidate is checked for correct disulfide
                  topology, charge, aggregation and hemolysis
                  liabilities, and gut-protease exposure &mdash; and
                  failures loop back through diagnostics-guided
                  repair until a design passes. Nothing unverified
                  ships.
                </p>
                <p>
                  <strong>
                    5. Containment and stability are designed in.
                  </strong>{" "}
                  Biocontainment &mdash; kill switches, auxotrophy
                  &mdash; and plasmid-stability screens run inside
                  the pipeline, not as an afterthought, and the
                  Safety panel shows exactly what was checked.
                </p>
                <p>
                  <strong>6. The handoff is vendor-ready.</strong>{" "}
                  Output is LBP-ready DNA with a lab-handoff page:
                  orderable synthesis plus a directory of CROs with
                  real experience in these hosts. The honest boundary
                  is labeled too: wet-lab feedback, potency
                  prediction, and the gut-safety panel are marked{" "}
                  <em>Future functionality</em> until they ship.
                </p>
              </div>
              <p className={styles.statement} id="language">
                A model that writes fluent sentences in the language of
                life is no chatbot trick. It is a drug-discovery
                engine.
              </p>
              <div className={styles.bioProse}>
                <p>
                  Diseases enter as words, literature grounds them into
                  targets, Muse Spark drafts candidates at the core,
                  and the compiler admits only designs it can verify
                  &mdash; bound for a living factory.{" "}
                  <Link href="/design">Design a peptide</Link> to watch
                  it happen.
                </p>
              </div>
              <figure className={styles.wrapDiagram}>
                <svg
                  viewBox="0 0 760 216"
                  role="img"
                  aria-labelledby="flowDiagramTitle flowDiagramDesc"
                >
                  <title id="flowDiagramTitle">
                    Literature grounds the prompt, Muse models invent, the
                    compiler proves
                  </title>
                  <desc id="flowDiagramDesc">
                    Five numbered stages left to right: the disease name,
                    literature agents over PubMed and Europe PMC, the
                    Spark brief of targets and avoids, Spark proposing
                    inside the proof compiler, and the peptide shipping
                    to an LBP factory.
                  </desc>
                  <defs>
                    <marker
                      id="flowArrow"
                      viewBox="0 0 10 10"
                      refX="8"
                      refY="5"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto-start-reverse"
                    >
                      <path
                        d="M 0 1 L 9 5 L 0 9 z"
                        style={{ fill: "var(--color-accent)" }}
                      />
                    </marker>
                  </defs>
                  <text
                    x="380"
                    y="26"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      fill: "var(--color-muted)",
                    }}
                  >
                    literature first, Muse models at the core
                  </text>
                  <rect
                    x="462"
                    y="48"
                    width="140"
                    height="114"
                    rx="10"
                    style={{
                      fill: "none",
                      stroke: "var(--color-muted)",
                      strokeWidth: 1.5,
                      strokeDasharray: "6 4",
                    }}
                  />
                  <text
                    x="532"
                    y="40"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fill: "var(--color-muted)",
                    }}
                  >
                    proof compiler
                  </text>
                  {[
                    { x: 14, accent: false, lines: ["name the", "disease"] },
                    {
                      x: 166,
                      accent: false,
                      lines: ["literature agents", "PubMed +", "Europe PMC"],
                    },
                    {
                      x: 318,
                      accent: true,
                      lines: ["Spark brief", "targets · mechs", "avoid list"],
                    },
                    {
                      x: 470,
                      accent: true,
                      lines: [
                        "Spark proposes",
                        "compiler proves",
                        "until it passes",
                      ],
                    },
                    {
                      x: 622,
                      accent: false,
                      lines: ["peptide → LBP", "brewed in", "the gut"],
                    },
                  ].map((node, i) => {
                    const cx = node.x + 62;
                    const ys =
                      node.lines.length === 2 ? [99, 117] : [91, 109, 127];
                    return (
                      <g key={node.lines[0]}>
                        <rect
                          x={node.x}
                          y={64}
                          width={124}
                          height={82}
                          rx={8}
                          style={
                            node.accent
                              ? {
                                  fill: "var(--color-accent-wash)",
                                  stroke: "var(--color-accent)",
                                  strokeWidth: 2,
                                }
                              : {
                                  fill: "var(--color-paper)",
                                  stroke: "var(--color-rule-2)",
                                  strokeWidth: 1.5,
                                }
                          }
                        />
                        {node.lines.map((line, j) => (
                          <text
                            key={line}
                            x={cx}
                            y={ys[j]}
                            textAnchor="middle"
                            style={{
                              fontFamily: "var(--font-display)",
                              fontSize: j === 0 ? 13 : 12,
                              fontWeight: j === 0 ? 600 : 400,
                              fill:
                                j === 0 && node.accent
                                  ? "var(--color-accent-deep)"
                                  : j === 0
                                    ? "var(--color-ink)"
                                    : "var(--color-ink-2)",
                            }}
                          >
                            {line}
                          </text>
                        ))}
                        <circle
                          cx={cx}
                          cy={64}
                          r={13}
                          style={{
                            fill: "var(--color-accent)",
                            stroke: "var(--color-paper)",
                            strokeWidth: 3,
                          }}
                        />
                        <text
                          x={cx}
                          y={69}
                          textAnchor="middle"
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: 13,
                            fontWeight: 600,
                            fill: "var(--color-accent-ink)",
                          }}
                        >
                          {i + 1}
                        </text>
                      </g>
                    );
                  })}
                  {[138, 290, 442, 594].map((x1) => (
                    <line
                      key={x1}
                      x1={x1}
                      y1={105}
                      x2={x1 + 28}
                      y2={105}
                      style={{ stroke: "var(--color-accent)", strokeWidth: 2 }}
                      markerEnd="url(#flowArrow)"
                    />
                  ))}
                  <text
                    x="380"
                    y={200}
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      fill: "var(--color-muted)",
                    }}
                  >
                    literature grounds the prompt; the compiler grounds the
                    molecule
                  </text>
                </svg>
                <figcaption>
                  Reading comes before writing: literature agents and a
                  Spark-synthesized brief aim generation, Muse Spark drafts
                  at the core, and the proof compiler admits only designs
                  it can verify &mdash; bound for a living factory.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>
        <section
          className={`${styles.band} ${styles.bandNavy}`}
          aria-labelledby="market-title"
        >
          <div className="container">
            <div id="market">
              <h2 id="market-title">The business case</h2>
              <div className={styles.bioProse}>
                <p>
                  Two approved <em>C.&nbsp;difficile</em> products proved
                  regulators will buy living medicines. The LBP core
                  market itself is still small &mdash; hundreds of
                  millions, not billions. The business case is not the
                  factory. It is the payloads: engineered strains unlock
                  slices of adjacent drug markets measured in tens of
                  billions, and the design leg of every program in them
                  just fell to zero marginal cost. One condition, worked
                  end to end, shows how.
                </p>
              </div>
              <h3>Worked example: inflammatory bowel disease</h3>
              <div className={styles.bioProse}>
                <p>
                  Crohn&apos;s disease and ulcerative colitis &mdash;
                  together, inflammatory bowel disease &mdash; afflict
                  roughly five to ten million people worldwide, from{" "}
                  <a
                    href="https://tauli.cat/en/institut/actualitat/noticies/2025/05/un-estudi-internacional-publicat-a-nature-analitza-levolucio-global-de-la-malaltia-inflamatoria-intestinal/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    about 5 million in a 2025 Nature epidemiology study
                  </a>{" "}
                  to{" "}
                  <a
                    href="https://www.ovid.com/jnls/sjga/fulltext/10.4103/sjg.sjg_138_26~global-burden-of-inflammatory-bowel-disease-in-asia"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    an estimated 10 million in recent reviews
                  </a>
                  , with prevalence still rising in newly
                  industrialized countries. It is chronic, incurable,
                  and flares for decades.
                </p>
                <p>
                  Treatment climbs a ladder: aminosalicylates,
                  steroids, immunomodulators, then biologics &mdash;
                  anti-TNF, anti-integrin, and anti-IL antibodies
                  &mdash; plus JAK inhibitors. Biologics dominate
                  spending:{" "}
                  <a
                    href="https://pmarketresearch.com/hc/inflammatory-bowel-disease-market/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    about three quarters of IBD drug sales, roughly
                    $17.7 billion, in 2025
                  </a>
                  . The catch is systemic: these drugs suppress
                  immunity everywhere to calm inflammation somewhere,
                  trading efficacy for infection risk &mdash; and many
                  patients cycle through one after another.
                </p>
                <p>
                  <a
                    href="https://www.fortunebusinessinsights.com/inflammatory-bowel-disease-treatment-market-106704"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    The global IBD treatment market was valued near
                    $29.6 billion in 2025, heading to $41.6 billion by
                    2034
                  </a>
                  . An engineered resident that secretes an
                  anti-inflammatory peptide at the lesion &mdash; the
                  IL-10-secreting <em>L.&nbsp;lactis</em> trials set
                  the clinical precedent &mdash; attacks the same
                  disease from inside the tissue, without systemic
                  suppression. That is the payload thesis in one
                  disease: same therapeutic value, local delivery.
                </p>
              </div>
              <h3>Therapeutic markets, worldwide</h3>
              <div className={styles.bioProse}>
                <p>
                  IBD is one row. Every figure below links to its
                  source, opening in a new tab:
                </p>
              </div>
              <div
                className={styles.marketBars}
                role="img"
                aria-label="2025 global therapeutic market sizes, largest to smallest: type 2 diabetes 68.4 billion dollars, IBD 29.6, atopic dermatitis 17, obesity 15.5, IBS 3.1, C. difficile about 1 billion dollars."
              >
                <div className={styles.marketBarRow}>
                  <span className={styles.marketBarLabel}>
                    Type 2 diabetes
                  </span>
                  <span className={styles.marketBarTrack}>
                    <span
                      className={styles.marketBarFill}
                      style={{ width: "100%" }}
                    />
                  </span>
                  <span className={styles.marketBarValue}>$68.4B</span>
                </div>
                <div className={styles.marketBarRow}>
                  <span className={styles.marketBarLabel}>IBD</span>
                  <span className={styles.marketBarTrack}>
                    <span
                      className={styles.marketBarFill}
                      style={{ width: "43.3%" }}
                    />
                  </span>
                  <span className={styles.marketBarValue}>$29.6B</span>
                </div>
                <div className={styles.marketBarRow}>
                  <span className={styles.marketBarLabel}>
                    Atopic dermatitis
                  </span>
                  <span className={styles.marketBarTrack}>
                    <span
                      className={styles.marketBarFill}
                      style={{ width: "24.9%" }}
                    />
                  </span>
                  <span className={styles.marketBarValue}>$17.0B</span>
                </div>
                <div className={styles.marketBarRow}>
                  <span className={styles.marketBarLabel}>Obesity</span>
                  <span className={styles.marketBarTrack}>
                    <span
                      className={styles.marketBarFill}
                      style={{ width: "22.7%" }}
                    />
                  </span>
                  <span className={styles.marketBarValue}>$15.5B</span>
                </div>
                <div className={styles.marketBarRow}>
                  <span className={styles.marketBarLabel}>IBS</span>
                  <span className={styles.marketBarTrack}>
                    <span
                      className={styles.marketBarFill}
                      style={{ width: "4.5%" }}
                    />
                  </span>
                  <span className={styles.marketBarValue}>$3.1B</span>
                </div>
                <div className={styles.marketBarRow}>
                  <span className={styles.marketBarLabel}>
                    C. difficile
                  </span>
                  <span className={styles.marketBarTrack}>
                    <span
                      className={styles.marketBarFill}
                      style={{ width: "1.5%" }}
                    />
                  </span>
                  <span className={styles.marketBarValue}>~$1.0B</span>
                </div>
              </div>
              <table className={styles.paperTable}>
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th>LBP approach</th>
                    <th>Global market, 2025</th>
                    <th>Outlook</th>
                    <th>Payload angle</th>
                    <th>Host · site</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">IBD, worked above</th>
                    <td data-label="LBP approach">
                      colonize inflamed mucosa; secrete therapy on site
                      instead of suppressing immunity system-wide
                    </td>
                    <td data-label="Global market, 2025">
                      <a
                        href="https://www.fortunebusinessinsights.com/inflammatory-bowel-disease-treatment-market-106704"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        $29.6B
                      </a>
                    </td>
                    <td data-label="Outlook">
                      <a
                        href="https://www.fortunebusinessinsights.com/inflammatory-bowel-disease-treatment-market-106704"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        $41.6B by 2034 · 3.7% CAGR
                      </a>
                    </td>
                    <td data-label="Payload angle">
                      anti-inflammatory peptides at the lesion
                    </td>
                    <td data-label="Host · site">
                      E. coli Nissle, <em>L. lactis</em> ◆ · gut
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Type 2 diabetes</th>
                    <td data-label="LBP approach">
                      gut-level incretin secretion for all-day glycemic
                      control, no injections
                    </td>
                    <td data-label="Global market, 2025">
                      <a
                        href="https://dataintelo.com/report/type-2-diabetes-market/amp"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        $68.4B
                      </a>
                    </td>
                    <td data-label="Outlook">
                      <a
                        href="https://dataintelo.com/report/type-2-diabetes-market/amp"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        $124.7B by 2034 · 6.9% CAGR
                      </a>
                    </td>
                    <td data-label="Payload angle">
                      incretin-class peptides brewed in the gut
                    </td>
                    <td data-label="Host · site">
                      <em>L. lactis</em>, E. coli Nissle ◆ · gut
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Obesity</th>
                    <td data-label="LBP approach">
                      continuous gut incretin and satiety signaling; a
                      room-stable oral dose, no cold chain
                    </td>
                    <td data-label="Global market, 2025">
                      <a
                        href="https://www.globenewswire.com/news-release/2026/05/21/3299528/28124/en/Glucagon-Like-Peptide-GLP-1-Agonists-Weight-Loss-Drugs-Market-Report-2026-Featuring-Major-Players-Novo-Nordisk-A-S-Eli-Lilly-and-Company-and-Pfizer-Global-Forecast-to-2030-and-2035.html"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        $15.5B
                      </a>
                    </td>
                    <td data-label="Outlook">
                      <a
                        href="https://www.globenewswire.com/news-release/2026/05/21/3299528/28124/en/Glucagon-Like-Peptide-GLP-1-Agonists-Weight-Loss-Drugs-Market-Report-2026-Featuring-Major-Players-Novo-Nordisk-A-S-Eli-Lilly-and-Company-and-Pfizer-Global-Forecast-to-2030-and-2035.html"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        $32.9B by 2030 · 16.3% CAGR
                      </a>
                    </td>
                    <td data-label="Payload angle">
                      oral incretin and satiety peptide payloads
                    </td>
                    <td data-label="Host · site">
                      <em>B. subtilis</em> spores ◆ · gut
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Atopic dermatitis</th>
                    <td data-label="LBP approach">
                      calm skin via the gut&ndash;skin immune axis; barrier
                      peptides from skin residents
                    </td>
                    <td data-label="Global market, 2025">
                      <a
                        href="https://www.fortunebusinessinsights.com/industry-reports/atopic-dermatitis-treatment-market-100579"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        $17.0B
                      </a>
                    </td>
                    <td data-label="Outlook">
                      <a
                        href="https://www.fortunebusinessinsights.com/industry-reports/atopic-dermatitis-treatment-market-100579"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        $46.8B by 2034 · 11.9% CAGR
                      </a>
                    </td>
                    <td data-label="Payload angle">
                      immune-calming plus barrier-support peptides
                    </td>
                    <td data-label="Host · site">
                      <em>L. lactis</em> ◆ · gut; <em>S. epidermidis</em> ·
                      skin (roadmap)
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">IBS</th>
                    <td data-label="LBP approach">
                      gut-restricted peptides tune motility and visceral
                      pain at the source
                    </td>
                    <td data-label="Global market, 2025">
                      <a
                        href="https://www.imarcgroup.com/irritable-bowel-syndrome-treatment-market"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        $3.1B
                      </a>
                    </td>
                    <td data-label="Outlook">
                      <a
                        href="https://www.imarcgroup.com/irritable-bowel-syndrome-treatment-market"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        $6.1B by 2034 · 7.5% CAGR
                      </a>
                    </td>
                    <td data-label="Payload angle">
                      motility plus visceral-analgesic peptides
                    </td>
                    <td data-label="Host · site">
                      E. coli Nissle ◆ · gut
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">C. difficile</th>
                    <td data-label="LBP approach">
                      targeted antimicrobial action plus colonization
                      resistance at the infection site
                    </td>
                    <td data-label="Global market, 2025">
                      <a
                        href="https://www.coherentmarketinsights.com/press-release/clostridioides-difficile-infection-treatment-market-4821"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ~$1.0B
                      </a>
                    </td>
                    <td data-label="Outlook">
                      <a
                        href="https://www.coherentmarketinsights.com/press-release/clostridioides-difficile-infection-treatment-market-4821"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ~$1.7B by 2032 · 7.1% CAGR
                      </a>
                    </td>
                    <td data-label="Payload angle">
                      narrow-spectrum antimicrobial peptides
                    </td>
                    <td data-label="Host · site">
                      <em>S. boulardii</em>, E. coli Nissle ◆ · colon
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className={styles.bioProse}>
                <p>
                  ◆ marks hosts the designer supports today:{" "}
                  <em>S. boulardii</em>, E. coli Nissle,{" "}
                  <em>L. lactis</em>, and <em>B. subtilis</em> spores.
                </p>
                <p>
                  These are adjacent therapeutic markets, not LBP
                  revenue: the LBP plus microbiome-CDMO core is{" "}
                  <a
                    href="https://www.grandviewresearch.com/press-release/global-live-biotherapeutic-products-microbiome-cdmo-market"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    projected near $400M by 2030
                  </a>
                  . The bet is capturing single-digit shares of the
                  pools above with payloads that cost nothing to
                  design.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className={styles.section} aria-labelledby="costs-title">
          <div className="container">
            <div id="costs">
              <h2 id="costs-title">What a factory costs to build</h2>
              <div className={styles.bioProse}>
                <p>
                  Design is the cheap part &mdash; this site does it for
                  free. Below is the full ladder from sequence to clinic,
                  in 2026 dollars, for a single engineered strain, with
                  each rung tagged by the company stage that usually pays
                  for it. R&amp;D figures are cozy-peptide costing
                  estimates (DIY versus CRO); clinical figures are
                  industry rules of thumb.
                </p>
              </div>
              <table className={styles.apitable}>
                <thead>
                  <tr>
                    <th scope="col">Company stage</th>
                    <th scope="col">Stage</th>
                    <th scope="col">What it buys</th>
                    <th scope="col">Typical cost</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td data-label="Company stage">Bootstrap</td>
                    <td data-label="Stage">AI design</td>
                    <td data-label="What it buys">
                      verified sequence plus vendor-ready DNA order
                    </td>
                    <td data-label="Typical cost">$0, minutes</td>
                  </tr>
                  <tr>
                    <td data-label="Company stage">Bootstrap</td>
                    <td data-label="Stage">DNA fragment</td>
                    <td data-label="What it buys">
                      400&ndash;600 bp gBlock at $0.07/bp
                    </td>
                    <td data-label="Typical cost">$35&ndash;100</td>
                  </tr>
                  <tr>
                    <td data-label="Company stage">Pre-seed</td>
                    <td data-label="Stage">R&amp;D strain build</td>
                    <td data-label="What it buys">
                      cloned, sequence-verified engineered microbe
                    </td>
                    <td data-label="Typical cost">$2&ndash;5k via CRO</td>
                  </tr>
                  <tr>
                    <td data-label="Company stage">Pre-seed / seed</td>
                    <td data-label="Stage">Wet-lab loop, per candidate</td>
                    <td data-label="What it buys">
                      expression plus MIC, cytotoxicity, stability assays
                    </td>
                    <td data-label="Typical cost">
                      $1&ndash;2.5k DIY; $4&ndash;8k CRO
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Company stage">Seed</td>
                    <td data-label="Stage">Lead program</td>
                    <td data-label="What it buys">
                      multi-candidate optimization plus animal proof of
                      concept
                    </td>
                    <td data-label="Typical cost">$50&ndash;150k</td>
                  </tr>
                  <tr>
                    <td data-label="Company stage">Series A</td>
                    <td data-label="Stage">
                      IND-enabling plus first cGMP batch
                    </td>
                    <td data-label="What it buys">
                      tox, cell banks, process dev, GMP lot, QC and release
                    </td>
                    <td data-label="Typical cost">
                      $1&ndash;3M, aerobic single strain
                    </td>
                  </tr>
                  <tr>
                    <td data-label="Company stage">Series A&ndash;B</td>
                    <td data-label="Stage">Phase 1 clinic</td>
                    <td data-label="What it buys">first-in-human safety</td>
                    <td data-label="Typical cost">$3&ndash;10M</td>
                  </tr>
                </tbody>
              </table>
              <figure className={styles.wrapDiagram}>
                <svg
                  viewBox="0 0 760 140"
                  role="img"
                  aria-labelledby="costTitle costDesc"
                >
                  <title id="costTitle">
                    Build costs on a log scale, free to ten million dollars
                  </title>
                  <desc id="costDesc">
                    A log axis from ten dollars to ten million. Dots mark
                    each ladder rung at its midpoint: free AI design, DNA
                    near seventy dollars, strain build near three thousand,
                    wet-lab loop near six thousand, lead program near one
                    hundred thousand, GMP near two million, Phase 1 near
                    six and a half million.
                  </desc>
                  <line
                    x1="60"
                    y1="92"
                    x2="730"
                    y2="92"
                    style={{ stroke: "var(--color-muted)", strokeWidth: 1.5 }}
                  />
                  {[
                    { x: 60, label: "$10" },
                    { x: 172, label: "$100" },
                    { x: 283, label: "$1k" },
                    { x: 395, label: "$10k" },
                    { x: 507, label: "$100k" },
                    { x: 618, label: "$1M" },
                    { x: 730, label: "$10M" },
                  ].map((tick) => (
                    <g key={tick.label}>
                      <line
                        x1={tick.x}
                        y1={86}
                        x2={tick.x}
                        y2={98}
                        style={{
                          stroke: "var(--color-muted)",
                          strokeWidth: 1.5,
                        }}
                      />
                      <text
                        x={tick.x}
                        y={120}
                        textAnchor="middle"
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 12,
                          fill: "var(--color-muted)",
                        }}
                      >
                        {tick.label}
                      </text>
                    </g>
                  ))}
                  {[
                    { x: 24, label: "free", y: 62, hollow: true },
                    { x: 154, label: "DNA", y: 38, hollow: false },
                    { x: 344, label: "strain", y: 62, hollow: false },
                    { x: 370, label: "loop", y: 38, hollow: false },
                    { x: 507, label: "lead", y: 62, hollow: false },
                    { x: 652, label: "GMP", y: 38, hollow: false },
                    { x: 709, label: "Ph1", y: 62, hollow: false },
                  ].map((dot) => (
                    <g key={dot.label}>
                      <circle
                        cx={dot.x}
                        cy={92}
                        r={6}
                        style={
                          dot.hollow
                            ? {
                                fill: "var(--color-paper)",
                                stroke: "var(--color-accent)",
                                strokeWidth: 2.5,
                              }
                            : { fill: "var(--color-accent)" }
                        }
                      />
                      <text
                        x={dot.x}
                        y={dot.y}
                        textAnchor="middle"
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 13,
                          fontWeight: 600,
                          fill: "var(--color-ink)",
                        }}
                      >
                        {dot.label}
                      </text>
                    </g>
                  ))}
                </svg>
                <figcaption>
                  Five orders of magnitude: each dot sits at the midpoint
                  of its table range, from a $35 DNA fragment to a $10M
                  clinic. The hollow dot is this website &mdash; free.
                </figcaption>
              </figure>
              <div className={styles.bioProse}>
                <p>
                  Read the first four rows as the AI dividend. Without
                  machine design, the same ground is covered by expert
                  labor plus shotgun screening: every candidate costs a
                  wet-lab loop &mdash; $1&ndash;2.5k DIY, $4&ndash;8k
                  via CRO, plus weeks &mdash; and an unfocused library
                  burns through dozens of loops before one candidate
                  survives. Focused, compiler-proven design collapses
                  that to a handful of high-quality shots on goal, each
                  cheap enough for a bootstrapped founder. That is not
                  just savings; it is probability of technical success.
                  Preclinical attrition is what kills seed-stage biotech,
                  and investors can underwrite a program whose losers
                  fail in silico instead of in animals.
                </p>
                <p>
                  This is rational drug design, back from exile. The
                  philosophy &mdash; design the molecule for the job
                  instead of screening for it &mdash; lost the last era
                  honestly: display libraries and automation let antibody
                  hunters generate and test tens of thousands of
                  candidates, so generate-and-test won. But antibodies
                  concentrate their cost downstream: mammalian
                  manufacturing, purification, and cold chain make every
                  clinical candidate precious and every late failure
                  catastrophic. LBPs invert the cost stack. Culturing
                  microbes is cheap even with GMP overhead, so the
                  scarce resource is not manufacturing &mdash; it is
                  knowing which payload to brew. A format where the debt
                  hides in the design rewards the oldest idea in the
                  field: think first, build once.
                </p>
                <p>
                  Yeast versus bacteria matters less than air versus no
                  air. All four cozy-peptide chassis &mdash;{" "}
                  <em>S. boulardii</em> yeast, E. coli Nissle,{" "}
                  <em>L. lactis</em>, <em>B. subtilis</em> spores &mdash;
                  are aerotolerant, which dodges the anaerobic-GMP premium
                  that makes strict-anaerobe consortia cost two to five
                  times more. Yeast is the cheapest path (GRAS, aerobic
                  fermentation); spores are the cheapest to ship
                  (room-stable fill-finish). The industry&apos;s direction
                  of travel is visible in the Lonza&ndash;Chr. Hansen joint
                  venture, which committed &euro;90M to build cGMP LBP
                  capacity.
                </p>
              </div>
            </div>
            <div id="solo">
              <h2>The one-person biotech</h2>
              <div className={styles.bioProse}>
                <p>
                  In October 2026, Anthropic disclosed it had acquired
                  Mithril Medicine &mdash; a drug-development company with
                  one full-time employee. Founder Cody Tranbarger used
                  Claude to coordinate 11 external laboratories across
                  contracts, logistics, and experiments, advancing two
                  rare muscular-dystrophy programs from idea to
                  encouraging mouse results in under 18 months. Terms
                  were not disclosed; the work is preclinical and not
                  peer reviewed.
                </p>
                <p>
                  The pattern generalizes. AI designs, CROs build, and a
                  founder coordinates: DNA for $35, a verified strain for
                  a few thousand, a full wet-lab loop for less than a used
                  car. The garage startup can now generate the early data
                  that once required a Series A &mdash; and the next
                  billion-dollar biotech unicorn may never own a lab
                  bench.
                </p>
                <p>
                  The honest boundary: preclinical is not clinical, and
                  GMP plus trials still cost millions. But the entry
                  ticket to credible animal data has collapsed &mdash; and
                  for engineered LBPs, the design leg of that ticket is
                  this website.
                </p>
              </div>
            </div>
            <div id="universe">
              <h2>The vision: factories at every body site</h2>
              <div className={styles.bioProse}>
                <p>
                  Two LBPs are FDA-approved for recurrent{" "}
                  <em>C. difficile</em> (see{" "}
                  <a href="#lbp">Living medicines</a>, above). Everything
                  below is the expansion pack: resident flora, engineered
                  into programmable factories at every body site
                  &mdash; each one hungry for payloads this designer
                  can supply.
                </p>
              </div>
              <table className={styles.paperTable}>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Resident flora</th>
                    <th>Factory vision</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Gut</th>
                    <td data-label="Resident flora">
                      <em>Bacteroides</em>, E. coli Nissle, yeast
                    </td>
                    <td data-label="Factory vision">
                      secrete peptides at the lesion; metabolic sinks
                    </td>
                    <td data-label="Status">
                      2 FDA approvals; engineered strains in trials
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Skin</th>
                    <td data-label="Resident flora">
                      <em>S. epidermidis</em>, <em>Cutibacterium</em>
                    </td>
                    <td data-label="Factory vision">
                      filaggrin and antimicrobials for eczema and acne
                    </td>
                    <td data-label="Status">
                      engineered <em>S. epidermidis</em>, clinical-stage
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Mouth</th>
                    <td data-label="Resident flora">
                      <em>Streptococcus</em> spp.
                    </td>
                    <td data-label="Factory vision">
                      anti-caries effector strains; gum-disease peptides
                    </td>
                    <td data-label="Status">
                      replacement therapy in human safety trials
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Nose</th>
                    <td data-label="Resident flora">
                      <em>S. epidermidis</em>, <em>Corynebacterium</em>
                    </td>
                    <td data-label="Factory vision">
                      decolonize MRSA carriage at the source
                    </td>
                    <td data-label="Status">
                      commensal strains in small trials
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Vagina</th>
                    <td data-label="Resident flora">
                      <em>L. crispatus</em>
                    </td>
                    <td data-label="Factory vision">
                      durable protection against BV recurrence
                    </td>
                    <td data-label="Status">
                      LACTIN-V: 30% vs 45% recurrence, Phase 2b
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div id="sources">
              <h2>Sources</h2>
              <ul className={styles.trace}>
                <li>
                  <a
                    href="https://www.frontiersin.org/journals/microbiology/articles/10.3389/fmicb.2026.2002085/full"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Engineered live biotherapeutic products: design
                    decisions and clinical translation
                  </a>,{" "}Frontiers in Microbiology (approvals, engineered
                  frontier)
                </li>
                <li>
                  <a
                    href="https://conferences.medicom-publishers.com/specialisation/gastroenterology/spore-therapy-cuts-c-difficile-reinfection-by-68-in-8-week-study/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ECOSPOR III: spore therapy cuts reinfection by 68%
                  </a>,{" "}NEJM trial report (Vowst 12% vs 40%)
                </li>
                <li>
                  <a
                    href="https://pulse2.com/vedanta-biosciences-raises-60-million-to-advance-phase-3-ve303-study/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Vedanta advances Phase 3 VE303 study
                  </a>,{" "}RESTORATiVE303 timelines
                </li>
                <li>
                  <a
                    href="https://www.globenewswire.com/news-release/2026/08/05/3339196/0/en/seres-therapeutics-reports-second-quarter-2026-financial-results-and-provides-business-updates-including-further-action-to-reduce-ongoing-facilities-costs.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Seres Q2 2026 update
                  </a>,{" "}SER-155 Phase 2 readiness
                </li>
                <li>
                  <a
                    href="https://www.biospace.com/maat-pharma-announces-first-patient-dosed-in-phase-2b-randomized-clinical-trial-evaluating-maat033-in-patients-receiving-allo-hsct"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    MaaT Pharma doses first Phase 2b patient
                  </a>,{" "}MaaT033 PHOEBUS trial
                </li>
                <li>
                  <a
                    href="https://www.grandviewresearch.com/press-release/global-live-biotherapeutic-products-microbiome-cdmo-market"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Live biotherapeutic products and microbiome CDMO market
                    to $397.5M by 2030
                  </a>,{" "}Grand View Research (38.5% CAGR)
                </li>
                <li>
                  <a
                    href="https://www.techsciresearch.com/news/25082-live-biotherapeutics-market.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Live biotherapeutics market, 14.06% CAGR through 2030
                  </a>,{" "}TechSci Research ($247.7M by 2030)
                </li>
                <li>
                  <a
                    href="https://www.fortunebusinessinsights.com/inflammatory-bowel-disease-treatment-market-106704"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    IBD treatment market, $29.57B in 2025 to $41.64B by
                    2034
                  </a>,{" "}Fortune Business Insights
                </li>
                <li>
                  <a
                    href="https://pmarketresearch.com/hc/inflammatory-bowel-disease-market/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    IBD market with biologics at 75.3% of 2025 sales
                  </a>,{" "}pMarket Research
                </li>
                <li>
                  <a
                    href="https://tauli.cat/en/institut/actualitat/noticies/2025/05/un-estudi-internacional-publicat-a-nature-analitza-levolucio-global-de-la-malaltia-inflamatoria-intestinal/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Global evolution of IBD: about 5 million affected
                    (Nature GIVES-21 study)
                  </a>,{" "}Parc Taulí, May 2025
                </li>
                <li>
                  <a
                    href="https://www.ovid.com/jnls/sjga/fulltext/10.4103/sjg.sjg_138_26~global-burden-of-inflammatory-bowel-disease-in-asia"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Global burden of IBD review, ~10 million affected
                  </a>,{" "}Saudi Journal of Gastroenterology
                </li>
                <li>
                  <a
                    href="https://dataintelo.com/report/type-2-diabetes-market/amp"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Type 2 diabetes market, $68.4B in 2025 to $124.7B by
                    2034 at 6.9% CAGR
                  </a>,{" "}Dataintelo
                </li>
                <li>
                  <a
                    href="https://www.globenewswire.com/news-release/2026/05/21/3299528/28124/en/Glucagon-Like-Peptide-GLP-1-Agonists-Weight-Loss-Drugs-Market-Report-2026-Featuring-Major-Players-Novo-Nordisk-A-S-Eli-Lilly-and-Company-and-Pfizer-Global-Forecast-to-2030-and-2035.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GLP-1 weight-loss drugs at $15.5B in 2025, $32.9B by
                    2030 at 16.3% CAGR
                  </a>,{" "}Research and Markets via GlobeNewswire
                </li>
                <li>
                  <a
                    href="https://www.fortunebusinessinsights.com/industry-reports/atopic-dermatitis-treatment-market-100579"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Atopic dermatitis market, $17.04B in 2025 to $46.77B
                    by 2034
                  </a>,{" "}Fortune Business Insights
                </li>
                <li>
                  <a
                    href="https://www.imarcgroup.com/irritable-bowel-syndrome-treatment-market"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    IBS treatment market, $3.11B in 2025 to $6.12B by
                    2034
                  </a>,{" "}IMARC Group
                </li>
                <li>
                  <a
                    href="https://www.coherentmarketinsights.com/press-release/clostridioides-difficile-infection-treatment-market-4821"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    C. difficile treatment market, ~$1.02B in 2025 to
                    ~$1.66B by 2032
                  </a>,{" "}Coherent Market Insights
                </li>
                <li>
                  <a
                    href="https://azitrainc.gcs-web.com/news-releases/news-release-details/azitra-inc-strengthens-global-intellectual-property-portfolio"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Filaggrin-secreting <em>S. epidermidis</em> patent for
                    atopic dermatitis
                  </a>,{" "}Azitra, July 2024
                </li>
                <li>
                  <a
                    href="https://www.synbiobeta.com/read/adding-to-the-microbial-toolbox-optimizing-skin-microbes-to-treat-skin-disease"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Optimizing skin microbes to treat skin disease
                  </a>,{" "}SynBioBeta (engineered skin commensals)
                </li>
                <li>
                  <a
                    href="https://www.frontiersin.org/journals/cellular-and-infection-microbiology/articles/10.3389/fcimb.2026.1965075/full"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    A translational-readiness framework for natural and
                    engineered probiotics
                  </a>,{" "}Frontiers (Synlogic SYNB1618/1934 data)
                </li>
                <li>
                  <a
                    href="https://escholarship.org/uc/item/63d236n5"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Randomized trial of Lactin-V to prevent recurrence of
                    bacterial vaginosis
                  </a>,{" "}Phase 2b, 228 participants
                </li>
                <li>
                  <a
                    href="https://www.dentistryiq.com/articles/wdj/2004/03/advisory-committee-unanimously-recommends-approval-of-clinical-protocol-for-first-human-test-of-oragenics-novel-treatment-for-prevention-of-dental-caries.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    NIH RAC nod for first human test of engineered{" "}
                    <em>S. mutans</em> replacement therapy
                  </a>,{" "}Oragenics, 2004
                </li>
                <li>
                  <a
                    href="https://www.biopharminternational.com/view/lonza-and-chr-hansen-joint-venture-accelerate-momentum-microbiome"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Lonza and Chr. Hansen joint venture in cGMP LBP
                    manufacturing
                  </a>,{" "}&euro;90M phased investment
                </li>
                <li>
                  <a
                    href="https://www.anthropic.com/research/early-progress-drug-development"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Early progress in drug development
                  </a>,{" "}Anthropic (Mithril disclosure, Oct 2026)
                </li>
                <li>
                  <a
                    href="https://entrelligence.com/anthropic-mithril-medicine-drug-development/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Anthropic discloses Mithril Medicine acquisition and
                    early mouse results
                  </a>,{" "}Entrelligence (one-person biotech)
                </li>
                <li>
                  <a
                    href="https://www.twistbioscience.com/products/genes/fragments"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Gene fragments from $0.07 per base
                  </a>,{" "}Twist Bioscience
                </li>
                <li>
                  <a
                    href="https://www.idtdna.com/pages/products/genes-and-gene-fragments/double-stranded-dna-fragments/gblocks-gene-fragments"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    gBlocks gene fragments from $0.07 per base
                  </a>,{" "}IDT
                </li>
              </ul>
            </div>
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
