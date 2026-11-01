import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "../page.module.css";
import SiteNav from "../site-nav";

export const metadata: Metadata = {
  title: "Biology for everyone — cozy-peptide",
  description:
    "Proteins are sentences and AI learned to write them: how literature-grounded Muse models design peptides, and the contrarian case for putting function first.",
};

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
          <a href="#sentences">Sentences</a>
          <a href="#flow">Process flow</a>
          <a href="#factory">The factory</a>
          <a href="#burden">Disease burden</a>
          <a href="#contrarian">The contrarian bet</a>
        </div>
      </nav>
      <main className={styles.main} id="main">
        <section className={styles.section} aria-labelledby="biology-title">
          <div className="container">
            <div className={styles.headblock}>
              <h1 id="biology-title">Biology for everyone</h1>
              <p className="lead">
                Proteins are sentences. AI learned to write them.
              </p>
            </div>
            <div id="sentences">
              <div className={styles.bioProse}>
                <p>
                  Chatbots predict the next word. Muse Spark predicts the
                  next building block of a protein. DNA spells genes with
                  four letters, <code>A</code>, <code>C</code>,{" "}
                  <code>G</code>, <code>T</code>. Proteins spell themselves
                  with twenty amino-acid letters. A good sentence follows
                  grammar. A good protein folds into a working molecule,
                  knot and all.
                </p>
              </div>
              <table className={styles.paperTable}>
                <thead>
                  <tr>
                    <th>Same idea</th>
                    <th>You write</th>
                    <th>DNA writes</th>
                    <th>Muse Spark writes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Alphabet</th>
                    <td data-label="You write">26 letters</td>
                    <td data-label="DNA writes">
                      4 bases: <code>A</code>, <code>C</code>,{" "}
                      <code>G</code>, <code>T</code>
                    </td>
                    <td data-label="Muse Spark writes">
                      20 amino-acid letters
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Sentence</th>
                    <td data-label="You write">words in order</td>
                    <td data-label="DNA writes">genes spelled in bases</td>
                    <td data-label="Muse Spark writes">
                      protein chains spelled in amino acids
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Good means</th>
                    <td data-label="You write">grammar and sense</td>
                    <td data-label="DNA writes">
                      a folded, working molecule
                    </td>
                    <td data-label="Muse Spark writes">
                      passes the compiler: structure, safety, potency
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className={styles.bioProse}>
                <p>
                  A raw model proposes; most proposals would fail in a
                  real body. cozy-peptide wraps Muse Spark in a compiler
                  that proves each design &mdash; structure, safety,
                  therapeutic promise &mdash; before anything touches a
                  cell. Only proven winners ship. And before any of that,
                  literature agents read the biomedical record &mdash;
                  PubMed and Europe PMC &mdash; and Muse Spark condenses
                  it into the targets, mechanisms, and avoid list that
                  steer generation. Evidence first, invention second,
                  proof always.
                </p>
              </div>
            </div>
            <div id="flow">
              <h2>How the process flows</h2>
              <div className={styles.bioProse}>
                <p>
                  Muse AI models sit at the core, but they never work
                  alone. The pipeline opens with biomedical research
                  synthesis: agents converge the literature on your
                  disease into a brief the generator must obey. Only
                  then does Muse Spark draft candidates &mdash; inside a
                  proof compiler that verifies every letter, repairs
                  failures with diagnostics attached, and compiles the
                  winner into DNA for a living factory.
                </p>
              </div>
              <figure className={styles.wrapDiagram}>
                <svg
                  viewBox="0 0 760 300"
                  role="img"
                  aria-labelledby="flowDiagramTitle flowDiagramDesc"
                >
                  <title id="flowDiagramTitle">
                    Literature grounds the prompt, Muse models invent, the
                    compiler proves
                  </title>
                  <desc id="flowDiagramDesc">
                    Five stages left to right: the disease name, literature
                    agents over PubMed and Europe PMC, the Spark brief of
                    targets and avoids, Spark proposing inside the proof
                    compiler, and the peptide shipping to an LBP factory.
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
                    y="34"
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
                    y="100"
                    width="142"
                    height="116"
                    rx="10"
                    style={{
                      fill: "none",
                      stroke: "var(--color-muted)",
                      strokeWidth: 1.5,
                      strokeDasharray: "6 4",
                    }}
                  />
                  <text
                    x="533"
                    y="92"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fill: "var(--color-muted)",
                    }}
                  >
                    proof compiler
                  </text>
                  <rect
                    x="8"
                    y="116"
                    width="126"
                    height="84"
                    rx="8"
                    style={{
                      fill: "var(--color-paper)",
                      stroke: "var(--color-rule-2)",
                      strokeWidth: 1.5,
                    }}
                  />
                  <text
                    x="71"
                    y="152"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      fontWeight: 600,
                      fill: "var(--color-ink)",
                    }}
                  >
                    name the
                  </text>
                  <text
                    x="71"
                    y="172"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      fontWeight: 600,
                      fill: "var(--color-ink)",
                    }}
                  >
                    disease
                  </text>
                  <line
                    x1="138"
                    y1="158"
                    x2="156"
                    y2="158"
                    style={{ stroke: "var(--color-accent)", strokeWidth: 2 }}
                    markerEnd="url(#flowArrow)"
                  />
                  <rect
                    x="162"
                    y="116"
                    width="126"
                    height="84"
                    rx="8"
                    style={{
                      fill: "var(--color-paper)",
                      stroke: "var(--color-rule-2)",
                      strokeWidth: 1.5,
                    }}
                  />
                  <text
                    x="225"
                    y="144"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      fontWeight: 600,
                      fill: "var(--color-ink)",
                    }}
                  >
                    literature agents
                  </text>
                  <text
                    x="225"
                    y="164"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fill: "var(--color-ink-2)",
                    }}
                  >
                    PubMed +
                  </text>
                  <text
                    x="225"
                    y="182"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fill: "var(--color-ink-2)",
                    }}
                  >
                    Europe PMC
                  </text>
                  <line
                    x1="292"
                    y1="158"
                    x2="310"
                    y2="158"
                    style={{ stroke: "var(--color-accent)", strokeWidth: 2 }}
                    markerEnd="url(#flowArrow)"
                  />
                  <rect
                    x="316"
                    y="116"
                    width="126"
                    height="84"
                    rx="8"
                    style={{
                      fill: "var(--color-accent-wash)",
                      stroke: "var(--color-accent)",
                      strokeWidth: 2,
                    }}
                  />
                  <text
                    x="379"
                    y="144"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      fontWeight: 600,
                      fill: "var(--color-accent-deep)",
                    }}
                  >
                    Spark brief
                  </text>
                  <text
                    x="379"
                    y="164"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fill: "var(--color-ink-2)",
                    }}
                  >
                    targets · mechs
                  </text>
                  <text
                    x="379"
                    y="182"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fill: "var(--color-ink-2)",
                    }}
                  >
                    avoid list
                  </text>
                  <line
                    x1="446"
                    y1="158"
                    x2="464"
                    y2="158"
                    style={{ stroke: "var(--color-accent)", strokeWidth: 2 }}
                    markerEnd="url(#flowArrow)"
                  />
                  <rect
                    x="470"
                    y="116"
                    width="126"
                    height="84"
                    rx="8"
                    style={{
                      fill: "var(--color-accent-wash)",
                      stroke: "var(--color-accent)",
                      strokeWidth: 2,
                    }}
                  />
                  <text
                    x="533"
                    y="144"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      fontWeight: 600,
                      fill: "var(--color-accent-deep)",
                    }}
                  >
                    Spark proposes
                  </text>
                  <text
                    x="533"
                    y="164"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fill: "var(--color-ink-2)",
                    }}
                  >
                    compiler proves
                  </text>
                  <text
                    x="533"
                    y="182"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fill: "var(--color-ink-2)",
                    }}
                  >
                    until it passes
                  </text>
                  <line
                    x1="600"
                    y1="158"
                    x2="618"
                    y2="158"
                    style={{ stroke: "var(--color-accent)", strokeWidth: 2 }}
                    markerEnd="url(#flowArrow)"
                  />
                  <rect
                    x="624"
                    y="116"
                    width="126"
                    height="84"
                    rx="8"
                    style={{
                      fill: "var(--color-paper)",
                      stroke: "var(--color-rule-2)",
                      strokeWidth: 1.5,
                    }}
                  />
                  <text
                    x="687"
                    y="144"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      fontWeight: 600,
                      fill: "var(--color-ink)",
                    }}
                  >
                    peptide → LBP
                  </text>
                  <text
                    x="687"
                    y="164"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fill: "var(--color-ink-2)",
                    }}
                  >
                    brewed in
                  </text>
                  <text
                    x="687"
                    y="182"
                    textAnchor="middle"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 12,
                      fill: "var(--color-ink-2)",
                    }}
                  >
                    the gut
                  </text>
                  <text
                    x="380"
                    y="262"
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
            <div id="factory">
              <h2>The factory in your gut</h2>
              <div className={styles.bioSplit}>
                <div className={styles.bioProse}>
                  <p>
                    Swallowed peptides rarely survive the trip. Stomach
                    acid shreds them, and pancreatic proteases finish the
                    job in the small intestine. So the winning design never
                    travels as a pill. It is compiled into DNA and installed
                    as a cassette in baker&apos;s yeast, starting with{" "}
                    <em>Saccharomyces boulardii</em>. Not a probiotic: an
                    engineered living therapeutic, a miniature factory that
                    lives in your gut and brews the medicine where the
                    disease lives.
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
                    <a href="https://commons.wikimedia.org/wiki/File:Saccharomyces_cerevisiae_SEM.jpg">
                      Murtey and Ramasamy, CC BY 3.0, via Wikimedia Commons
                    </a>
                    .
                  </figcaption>
                </figure>
              </div>
            </div>
            <div id="burden">
              <h2>The burden, in numbers</h2>
              <ul className={styles.statGrid} aria-label="Gut disease burden">
                <li className={styles.stat}>
                  <span className={styles.statFigure}>1 in 10</span>
                  <p className={styles.statLabel}>
                    people worldwide live with IBS
                  </p>
                </li>
                <li className={styles.stat}>
                  <span className={styles.statFigure}>7M+</span>
                  <p className={styles.statLabel}>
                    people live with IBD, Crohn&apos;s and colitis
                  </p>
                </li>
                <li className={styles.stat}>
                  <span className={styles.statFigure}>500k</span>
                  <p className={styles.statLabel}>
                    US C. difficile infections a year
                  </p>
                </li>
                <li className={styles.stat}>
                  <span className={styles.statFigure}>$33B</span>
                  <p className={styles.statLabel}>
                    IBS plus IBD drug sales in 2025
                  </p>
                </li>
              </ul>
              <p className={styles.sourceLine}>
                Sources: CDC; Frontiers in Immunology 2026; Rome Foundation
                meta-analyses; BCC Research, growing to $52.6B by 2030.
                Celiac disease affects about 1% of people, and 43% carry{" "}
                <em>H. pylori</em> (Lancet Gastroenterology 2023).
              </p>
              <p className={styles.statement} id="language">
                A model that writes fluent sentences in the language of life
                is no chatbot trick. It is a drug-discovery engine.
              </p>
            </div>
            <div id="contrarian">
              <h2>The contrarian bet: put function first</h2>
              <div className={styles.bioProse}>
                <p>
                  Current dogma says protein structure modeling is the key
                  to new drugs: solve the shape, and the medicine follows.
                  The achievement behind that dogma is real and enormous
                  &mdash; Meta&apos;s ESM Metagenomic Atlas mapped hundreds
                  of millions of proteins no one had ever seen, and
                  transformer protein language models learned to read the
                  language of life the way LLMs read ours. Honor that. Now
                  notice what it leaves unanswered.
                </p>
                <p>
                  The big leap is not shape &mdash; it is meaning. What
                  does this protein <em>do</em>? What does that interaction
                  imply for the biology, for the disease? A perfect
                  structure of the wrong target is a perfect miss, and
                  trial after trial fails for exactly that reason: not
                  because the chemistry was wrong, but because the target
                  was. That is an evidence problem, not a chemistry
                  problem. So this pipeline flips the order: function
                  first, shape second. Prove the biology &mdash; what
                  causes what, in which cells, under which conditions
                  &mdash; before admiring the fold.
                </p>
                <p>
                  Living medicines make the flip unavoidable. A Live
                  Biotherapeutic Product is not a pill you swallow; it is
                  an active factory parked exactly where the disease
                  lives, brewing medicine on site. The local
                  neighborhood &mdash; the microbes, the gut wall, the
                  immune sentries &mdash; defines what can possibly work
                  before a single amino acid is generated. Start with the
                  structure and you design for nowhere. Start with the
                  biology and the gut tells you what to build.
                </p>
                <p>
                  Here is the exciting part: roughly 70% of the
                  body&apos;s immune cells live in the gut, making it the
                  central training ground of the entire immune system. An
                  LBP parked in that training ground is not just a drug
                  dispenser &mdash; it is a programmable controller. By
                  delivering the right peptide signals to the gut&apos;s
                  sampling machinery, it can re-educate the immune system
                  locally and project the benefit across the whole body:
                  calm a joint, quiet the skin, reset an allergy, all from
                  medicine brewed in the gut. That is the future this
                  contrarian bet is building toward.
                </p>
              </div>
              <aside
                className={styles.expertbox}
                aria-labelledby="contrarian-expert-title"
              >
                <h3 id="contrarian-expert-title">
                  The expert version: biology-first design
                </h3>
                <p>
                  The dominant paradigm is target-centric and
                  structure-first: nominate a target, solve or predict its
                  structure, screen chemistry against the pocket. In that
                  frame, AlphaFold-class and structural AI architectures
                  are best understood as high-resolution hypothesis
                  generators &mdash; superb at proposing <em>how</em> a
                  molecule might bind, silent on <em>whether</em> the
                  target is causal, active in the disease cell state, and
                  druggable in a human. The complementary bet: target
                  attrition in clinical development is principally an
                  evidence problem, so front-load causality, cell-state
                  specificity, and perturbation genetics before burning a
                  single cycle on structural biology.
                </p>
                <p>
                  For peptides expressed <em>in situ</em> by engineered
                  LBPs &mdash; <em>Lactobacillus</em>,{" "}
                  <em>Saccharomyces boulardii</em>, or{" "}
                  <em>Bacteroides</em> chassis &mdash; the standard
                  sequence-to-target pipeline inverts completely. The LBP
                  is an active, compartmentalized delivery factory, so the
                  biology of the local microenvironment and the physiology
                  of host&ndash;pathogen and host&ndash;tissue interfaces
                  constrain the solution space before generation: pH and
                  protease exposure, mucus penetration, epithelial
                  proximity, and residence time are design inputs, not
                  downstream liabilities.
                </p>
                <p>
                  The immunological consequence is the program&apos;s
                  long-range thesis. With roughly 70% of immune cells
                  resident in Gut-Associated Lymphoid Tissue, the gut is
                  the body&apos;s central immunological training ground.
                  Gut-delivered LBPs graduate from passive vehicles to
                  programmable immunological controllers: antigen-bearing,
                  cytokine-modulating, or receptor-agonist peptides
                  delivered to mucosal sampling machinery (M cells,
                  dendritic cells) can re-educate immunity locally and
                  project systemic therapeutic effects at distant sites.
                </p>
              </aside>
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
