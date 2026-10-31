import Image from "next/image";
import Demo from "./demo";
import Field from "./field";
import styles from "./page.module.css";

const CURL_EXAMPLE = `curl -X POST https://cozy-peptide.vercel.app/api/generate-peptide \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $API_BEARER_TOKEN" \\
  -d '{
    "target": "Clostridioides difficile colonization in the gut",
    "charge_target": 4,
    "modality": "knottin-6c"
  }'`;

const RESPONSE_EXAMPLE = `{
  "success": true,
  "target": "Clostridioides difficile colonization in the gut",
  "modality": "engineered_knottin_microprotein",
  "neurosymbolic_provenance": {
    "proposer_model": "Meta-Spark-1.3-Contributor",
    "linguistic_paradigm": "context_sensitive_loop_grammar",
    "compiler_refinement_cycles": 0,
    "target_class": "bacterial-colonization",
    "refinement_trace": [
      {
        "turn": 0,
        "candidate": "CSRTTCSQDTVCKVSKCSVCRIKSVNTC",
        "grammar_valid": true,
        "audit_passed": true,
        "disposition": "accepted",
        "source": "meta-spark-1.3"
      }
    ]
  },
  "candidate": {
    "mature_sequence": "CSRTTCSQDTVCKVSKCSVCRIKSVNTC",
    "topology": "C1-C4, C2-C5, C3-C6 ICK",
    "grammar_breakdown": { "L1": "SRTT", "...": "..." }
  },
  "symbolic_audit": {
    "passed": true,
    "charge": 4,
    "gravy": -0.061,
    "boman_index": 1.075,
    "aliphatic_index": 55.36,
    "therapeutic_index": 83.91,
    "safety_index": 88.37,
    "liabilities_cleared": ["Trypsin", "Pepsin", "Chymotrypsin", "..."]
  },
  "lab_handoff": {
    "yeast_chassis": "Saccharomyces boulardii (ATCC MYA-796)",
    "secretion_leader": "MF-alpha-1 (85 aa) + Kex2 (KR)",
    "cai": 0.9865,
    "restriction_scrub": { "status": "clean" },
    "synthesis_order": { "sequence_name": "SB-KNOT-1V315H", "...": "..." }
  }
}`;

const LOCAL_DEV = `npm install

# Required env vars (never commit real values)
export API_BEARER_TOKEN="your-local-bearer-token"
export META_API_KEY="your-meta-spark-key"

npm run dev    # http://localhost:3000
npm test       # typecheck + test suite
npm run build  # production build`;

export default function Home() {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.topbar}>
        <div className={`container ${styles.masthead}`}>
          <a className={styles.wordmark} href="#top" aria-label="cozy-peptide home">
            cozy-peptide
          </a>
          <nav className={styles.navrow} aria-label="Sections">
            <a className={styles.navlink} href="#demo">
              the demo
            </a>
            <a className={styles.navlink} href="#biology">
              the biology
            </a>
            <a className={styles.navlink} href="#api">
              the API call
            </a>
            <a className={styles.navlink} href="#pipeline">
              the pipeline
            </a>
            <a className={styles.navlink} href="#safety">
              safety
            </a>
            <a className={`${styles.btn} ${styles.navbtn}`} href="#demo">
              Design a peptide
            </a>
          </nav>
        </div>
      </header>

      <main className={styles.main} id="main">
        <section className={styles.hero} aria-labelledby="page-title">
          <Field />
          <div className={`container ${styles.herogrid}`}>
            <div className={styles.herotext}>
              <h1 id="page-title">
                Name the disease. Get a novel AI-designed peptide to treat
                it.
              </h1>
              <p className="lead">
                New peptides, proven by the compiler, brewed in your gut.
              </p>
              <div className={styles.heroactions}>
                <a className={styles.btn} href="#api">
                  Read the API call
                </a>
              </div>
            </div>
            <Demo />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="biology">
          <div className="container">
            <div className={styles.headblock}>
              <h2 id="biology">Biology for everyone</h2>
              <p className="lead">
                Proteins are sentences. AI learned to write them.
              </p>
            </div>
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
                    4 bases: <code>A</code>, <code>C</code>, <code>G</code>,{" "}
                    <code>T</code>
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
                cell. Only proven winners ship.
              </p>
            </div>
            <figure className={styles.wrapDiagram}>
              <svg
                viewBox="0 0 760 300"
                role="img"
                aria-labelledby="wrapDiagramTitle wrapDiagramDesc"
              >
                <title id="wrapDiagramTitle">
                  How cozy-peptide wraps the Muse Spark model
                </title>
                <desc id="wrapDiagramDesc">
                  The disease name flows into nested layers: cozy-peptide
                  on the outside, the proof compiler in the middle, Muse
                  Spark inventing peptides at the core. A yeast cassette
                  comes out.
                </desc>
                <defs>
                  <marker
                    id="wrapArrow"
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
                <rect
                  x="170"
                  y="24"
                  width="420"
                  height="252"
                  rx="10"
                  style={{
                    fill: "var(--color-paper)",
                    stroke: "var(--color-ink)",
                    strokeWidth: 2,
                  }}
                />
                <text
                  x="380"
                  y="54"
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    fill: "var(--color-ink)",
                  }}
                >
                  cozy-peptide: the wrapper
                </text>
                <rect
                  x="212"
                  y="72"
                  width="336"
                  height="158"
                  rx="8"
                  style={{
                    fill: "var(--color-paper)",
                    stroke: "var(--color-muted)",
                    strokeWidth: 1.5,
                    strokeDasharray: "6 4",
                  }}
                />
                <text
                  x="380"
                  y="100"
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 14,
                    fontWeight: 500,
                    fill: "var(--color-ink-2)",
                  }}
                >
                  compiler proves it: structure, safety, potency
                </text>
                <rect
                  x="272"
                  y="118"
                  width="216"
                  height="84"
                  rx="8"
                  style={{
                    fill: "var(--color-accent-wash)",
                    stroke: "var(--color-accent)",
                    strokeWidth: 2,
                  }}
                />
                <text
                  x="380"
                  y="152"
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 19,
                    fontWeight: 600,
                    fill: "var(--color-accent-deep)",
                  }}
                >
                  Muse Spark
                </text>
                <text
                  x="380"
                  y="176"
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 14,
                    fill: "var(--color-ink-2)",
                  }}
                >
                  invents peptides
                </text>
                <text
                  x="380"
                  y="258"
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 13,
                    fill: "var(--color-muted)",
                  }}
                >
                  grammar + audit filter every proposal
                </text>
                <rect
                  x="8"
                  y="118"
                  width="118"
                  height="64"
                  rx="8"
                  style={{
                    fill: "var(--color-paper)",
                    stroke: "var(--color-rule-2)",
                    strokeWidth: 1.5,
                  }}
                />
                <text
                  x="67"
                  y="145"
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 14,
                    fontWeight: 500,
                    fill: "var(--color-ink)",
                  }}
                >
                  name the
                </text>
                <text
                  x="67"
                  y="165"
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 14,
                    fontWeight: 500,
                    fill: "var(--color-ink)",
                  }}
                >
                  disease
                </text>
                <line
                  x1="130"
                  y1="150"
                  x2="162"
                  y2="150"
                  style={{ stroke: "var(--color-accent)", strokeWidth: 2 }}
                  markerEnd="url(#wrapArrow)"
                />
                <rect
                  x="634"
                  y="118"
                  width="118"
                  height="64"
                  rx="8"
                  style={{
                    fill: "var(--color-paper)",
                    stroke: "var(--color-rule-2)",
                    strokeWidth: 1.5,
                  }}
                />
                <text
                  x="693"
                  y="145"
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 14,
                    fontWeight: 500,
                    fill: "var(--color-ink)",
                  }}
                >
                  yeast
                </text>
                <text
                  x="693"
                  y="165"
                  textAnchor="middle"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 14,
                    fontWeight: 500,
                    fill: "var(--color-ink)",
                  }}
                >
                  cassette
                </text>
                <line
                  x1="594"
                  y1="150"
                  x2="626"
                  y2="150"
                  style={{ stroke: "var(--color-accent)", strokeWidth: 2 }}
                  markerEnd="url(#wrapArrow)"
                />
              </svg>
              <figcaption>
                Muse Spark dreams up new peptides at the core. The
                compiler around it checks every design, and only proven
                winners ship as a yeast cassette.
              </figcaption>
            </figure>
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
        </section>

        <section
          className={`${styles.band} ${styles.bandGraphite}`}
          aria-labelledby="api"
        >
          <div className="container">
            <div className={styles.headblock}>
              <h2 id="api">Peptides from one API call</h2>
              <p className="lead">
                One endpoint, one bearer token, one verified sequence.
              </p>
            </div>
            <p className={styles.endpoint}>
              <span className={styles.method}>POST</span>
              <code>/api/generate-peptide</code>
            </p>
            <p className={styles.authline}>
              Authenticate with a Bearer [REDACTED]: the{" "}
              <code>Authorization</code> header must match the server&apos;s{" "}
              <code>API_BEARER_TOKEN</code>. Tokens live in environment
              variables only, this page shows placeholders, never real
              values.
            </p>
            <h3>Request</h3>
            <pre className={styles.well}>
              <code>{CURL_EXAMPLE}</code>
            </pre>
            <table className={styles.apitable}>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Field">
                    <code>target</code>
                  </td>
                  <td data-label="Type">string</td>
                  <td data-label="Required">yes</td>
                  <td data-label="Description">
                    Therapeutic gut target, e.g. a pathogen or pathway.
                  </td>
                </tr>
                <tr>
                  <td data-label="Field">
                    <code>mechanism</code>
                  </td>
                  <td data-label="Type">string</td>
                  <td data-label="Required">no</td>
                  <td data-label="Description">
                    Intended mode of action, passed to the proposer.
                  </td>
                </tr>
                <tr>
                  <td data-label="Field">
                    <code>charge_target</code>
                  </td>
                  <td data-label="Type">1 | 2 | 3 | 4</td>
                  <td data-label="Required">no</td>
                  <td data-label="Description">
                    Exact formal charge required at neutral pH. Default 4.
                  </td>
                </tr>
                <tr>
                  <td data-label="Field">
                    <code>modality</code>
                  </td>
                  <td data-label="Type">string</td>
                  <td data-label="Required">no</td>
                  <td data-label="Description">
                    Scaffold: <code>knottin-6c</code> (default),{" "}
                    <code>disulfide-4c</code>, <code>disulfide-2c</code>,
                    or <code>linear</code>.
                  </td>
                </tr>
                <tr>
                  <td data-label="Field">
                    <code>model</code>
                  </td>
                  <td data-label="Type">string</td>
                  <td data-label="Required">no</td>
                  <td data-label="Description">
                    Meta model id. Default{" "}
                    <code>muse-spark-1.3-contributor</code>;{" "}
                    <code>muse-wonder-1.0</code> also known.
                  </td>
                </tr>
              </tbody>
            </table>

            <h3>Response (200, truncated)</h3>
            <pre className={styles.well}>
              <code>{RESPONSE_EXAMPLE}</code>
            </pre>

            <h3>Status codes</h3>
            <table className={styles.apitable}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Code">
                    <code className={styles.statuscode}>200</code>
                  </td>
                  <td data-label="Meaning">
                    Verified candidate with audit ledger and lab handoff.
                  </td>
                </tr>
                <tr>
                  <td data-label="Code">
                    <code className={styles.statuscode}>400</code>
                  </td>
                  <td data-label="Meaning">
                    Invalid JSON body or schema validation failure.
                  </td>
                </tr>
                <tr>
                  <td data-label="Code">
                    <code className={styles.statuscode}>401</code>
                  </td>
                  <td data-label="Meaning">
                    Missing or invalid Bearer [REDACTED]
                  </td>
                </tr>
                <tr>
                  <td data-label="Code">
                    <code className={styles.statuscode}>403</code>
                  </td>
                  <td data-label="Meaning">
                    Biosecurity block (toxin-signature screening).
                  </td>
                </tr>
                <tr>
                  <td data-label="Code">
                    <code className={styles.statuscode}>422</code>
                  </td>
                  <td data-label="Meaning">
                    Catalytic-enzyme or off-site (non-gut) target
                    refusal.
                  </td>
                </tr>
                <tr>
                  <td data-label="Code">
                    <code className={styles.statuscode}>502</code>
                  </td>
                  <td data-label="Meaning">
                    Generation failure; no verifiable candidate produced.
                  </td>
                </tr>
              </tbody>
            </table>

            <h3>More endpoints</h3>
            <p className={styles.endpoint}>
              <span className={styles.method}>POST</span>
              <code>/api/audit-peptide</code>
            </p>
            <p className={styles.authline}>
              Audit a caller-supplied sequence with no model calls: grammar,
              violations, therapeutic and safety indices, and failure modes.
              Bearer token required.
            </p>
            <p className={styles.endpoint}>
              <span className={styles.method}>GET</span>
              <code>/api/modalities</code>
            </p>
            <p className={styles.authline}>
              Public capability listing: every design modality with its
              length, cysteine, and hydropathy rules. No token needed.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="safety-local">
          <div className="container">
            <div className={styles.headblock}>
              <h2 id="safety-local">Safety rules and a local run</h2>
            </div>
            <div className={styles.rows}>
              <div className={styles.row} id="guardrails">
                <h3 className={styles.rowtitle}>Toxin screening</h3>
                <div className={styles.rowbody}>
                  <p>
                    Requests matching ricin, abrin, botulinum/BoNT
                    translocation constructs, and other high-risk toxin
                    patterns are refused with <code>403</code> before
                    generation.
                  </p>
                </div>
              </div>
              <div className={styles.row}>
                <h3 className={styles.rowtitle}>Enzyme refusal</h3>
                <div className={styles.rowbody}>
                  <p>
                    Catalytic-enzyme targets and folds over 45 aa get{" "}
                    <code>422</code> with guidance to source a natural homolog
                    instead. Catalysis needs globular folds, not short
                    peptides.
                  </p>
                </div>
              </div>
              <div className={styles.row}>
                <h3 className={styles.rowtitle}>Gut-target filter</h3>
                <div className={styles.rowbody}>
                  <p>
                    Targets naming distant organs with no gut relationship
                    get <code>422</code>: gut-secreted peptides can only
                    plausibly treat what the lumen reaches.
                  </p>
                </div>
              </div>
              <div className={styles.row} id="local">
                <h3 className={styles.rowtitle}>
                  Run the compiler on your machine
                </h3>
                <div className={styles.rowbody}>
                  <pre className={styles.well}>
                    <code>{LOCAL_DEV}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className={`${styles.section} ${styles.sectionWide}`}
          aria-labelledby="why"
        >
          <div className="container">
            <div className={styles.headblock}>
              <h2 id="why">Change how medicines get made</h2>
              <p className="lead">
                Why knottins survive the gut, and the design that proves it.
              </p>
            </div>
            <div className={styles.bento}>
              <div className={`${styles.tile} ${styles.tileKnottin}`}>
                <Image
                  src="/knottin-exhibit.png"
                  alt="Structural cartoon of a Muse Spark 1.3-designed knottin for C. difficile"
                  width={433}
                  height={453}
                  sizes="(max-width: 60rem) 100vw, 360px"
                  loading="lazy"
                />
                <span className={styles.tileLabel}>
                  A knottin invented by Muse Spark 1.3 for{" "}
                  <em>C. difficile</em>, never existed in nature.
                </span>
                <ul
                  className={styles.chips}
                  aria-label="Design constraints"
                >
                  <li>28 to 36 aa</li>
                  <li>6-Cys ICK knot</li>
                  <li>charge +1…+4</li>
                  <li>CAI &gt; 0.85</li>
                </ul>
              </div>
              <div className={`${styles.tile} ${styles.tileSeq}`}>
                <span className={styles.tileLabel}>
                  The C. difficile design, 28 amino acids
                </span>
                <code className={styles.tileSeqCode}>
                  CSRTTCSQDTVCKVSKCSVCRIKSVNTC
                </code>
              </div>
              <div className={`${styles.tile} ${styles.tileAudit}`}>
                <span className={styles.tileLabel}>
                  Cleared for synthesis
                </span>
                <dl className={styles.tileAuditGrid}>
                  <div>
                    <dt>Charge</dt>
                    <dd>+4</dd>
                  </div>
                  <div>
                    <dt>GRAVY</dt>
                    <dd>-0.06</dd>
                  </div>
                  <div>
                    <dt>Boman</dt>
                    <dd>1.08</dd>
                  </div>
                  <div>
                    <dt>Aliphatic</dt>
                    <dd>55.36</dd>
                  </div>
                  <div>
                    <dt>Therapeutic</dt>
                    <dd>83.9</dd>
                  </div>
                  <div>
                    <dt>Safety</dt>
                    <dd>88.4</dd>
                  </div>
                </dl>
                <p>
                  Trypsin, pepsin, and chymotrypsin cleared, CAI over 0.85.
                </p>
              </div>
              <div className={`${styles.tile} ${styles.tileWhy}`}>
                <strong>Medicines that survive digestion</strong>
                <p>
                  Knottins are tied in a cysteine knot that shrugs off
                  stomach acid and enzymes, so they act right inside the gut.
                </p>
              </div>
              <div className={`${styles.tile} ${styles.tileWhy}`}>
                <strong>Invented, not found</strong>
                <p>
                  Muse Spark 1.3 reasons over the grammar of proteins to
                  propose truly novel sequences. A compiler, not vibes,
                  verifies topology, charge, stability, safety, and
                  therapeutic promise.
                </p>
              </div>
              <div className={`${styles.tile} ${styles.tileWhy}`}>
                <strong>Protein out, DNA follows</strong>
                <p>
                  The passing design compiles straight to a vendor-ready
                  synthesis order: codon-optimized DNA, secretion signal,
                  and assembly parts.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="pipeline">
          <div className="container">
            <div className={styles.headblock}>
              <h2 id="pipeline">A request, from prompt to DNA</h2>
              <p className="lead">Five stages, one verified sequence.</p>
            </div>
            <div className={styles.pinned}>
              <div className={styles.pinboard} aria-hidden="true">
                <span className={styles.pinplate}>Ingest</span>
                <span className={styles.pinplate}>Propose</span>
                <span className={styles.pinplate}>Verify</span>
                <span className={styles.pinplate}>Repair</span>
                <span className={styles.pinplate}>Hand off</span>
              </div>
              <ol className={styles.panels}>
                <li>
                  <h3>Ingest</h3>
                  <p>
                    <code>POST /api/generate-peptide</code> takes a
                    therapeutic target, an optional mechanism, an optional
                    charge target (1 to 4), and an optional modality:
                    knottin, disulfide, or linear.
                  </p>
                </li>
                <li>
                  <h3>Propose</h3>
                  <p>
                    The system steers Meta Spark 1.3 with a
                    target-class brief and a safety contract, and the
                    model drafts candidates in the modality grammar.
                  </p>
                </li>
                <li>
                  <h3>Verify</h3>
                  <p>
                    Every candidate must pass the symbolic audit:
                    topology, exact formal charge, hydropathy window, and
                    zero protease, glycosylation, aggregation, oxidation,
                    or deamidation liabilities, scored with therapeutic
                    and safety indices. Off-gut targets are refused up
                    front.
                  </p>
                </li>
                <li>
                  <h3>Repair</h3>
                  <p>
                    Failures return structured compiler diagnostics,
                    prioritized by recurring-fault steering, for
                    model-guided repair instead of being discarded;
                    survivors face a blinded specificity review that must
                    independently confirm the target, and flag
                    predictions pointing outside the gut. The full trace
                    ships in the response, alongside agentic tool stubs
                    for binding, structure, and off-target review.
                  </p>
                </li>
                <li>
                  <h3>Hand off</h3>
                  <p>
                    Verified peptides compile to a yeast cassette: 85-aa
                    MFα1 leader with the SLDKR Kex2 junction, yeast codon
                    optimization, 40-bp Gibson arms, and a synthesis order
                    manifest, everything needed to install the miniature
                    gut factory.
                  </p>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="safety">
          <div className="container">
            <div className={styles.headblock}>
              <h2 id="safety">Safe by design, approved by precedent</h2>
              <p className="lead">
                Living medicine, with layers of safety and an FDA path
                already walked.
              </p>
            </div>
            <div className={styles.bioProse}>
              <p>
                The chassis is <em>Saccharomyces boulardii</em>, a yeast
                with GRAS status and decades of safe clinical use
                worldwide. It thrives at body temperature, survives the
                trip through the gut, and never moves in: it clears
                within days of the last dose, so stopping the dose stops
                the exposure. Being a eukaryote, not a bacterium, it has
                no plasmids to trade with gut bacteria, and the
                therapeutic cassette sits on its chromosome, not on a
                mobile element.
              </p>
            </div>
            <table className={styles.paperTable}>
              <thead>
                <tr>
                  <th>Safety layer</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Proven species</th>
                  <td>
                    Prescribed for decades on every continent; serious
                    issues limited to rare cases in severely
                    immunocompromised patients.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Transient guest</th>
                  <td>
                    Does not colonize. Clears within days, so exposure
                    ends when dosing ends.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Contained chassis</th>
                  <td>
                    Engineered auxotrophy: the yeast only grows where it
                    is fed, with CRISPR kill switches as backup.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Proven before release</th>
                  <td>
                    Every peptide passes the compiler first: structure,
                    safety, potency.
                  </td>
                </tr>
              </tbody>
            </table>
            <div className={styles.bioProse}>
              <p>
                Regulators already know this category. Live
                Biotherapeutic Products are biological products, not
                supplements: they go through an IND, phased clinical
                trials, and a full BLA reviewed by the FDA&apos;s Center
                for Biologics. Rebyota, a single-dose rectal treatment,
                became the first approved LBP in late 2022; Vowst, an
                oral spore capsule, followed in April 2023. Both beat
                placebo in Phase 3 and now prevent recurrent{" "}
                <em>C. difficile</em> infection. A defined yeast carrying
                one known cassette is simpler to characterize than
                donor-derived consortia, and the road it travels is
                already paved.
              </p>
              <p>
                That platform logic points further. In 2019, milasen
                became the first drug designed for one person: built,
                FDA-cleared, and dosed within about a year of diagnosis.
                Once a chassis-and-compiler platform is proven, a new
                peptide is a cassette swap, not a new factory. AI-designed
                peptides, matched to the patient and moved through n-of-1
                trials, could reach the highest unmet needs on the
                shortest timelines.
              </p>
            </div>
            <p className={styles.sourceLine}>
              Sources: FDA approvals of Rebyota (2022) and Vowst (2023);
              FDA LBP guidance for early clinical trials; biocontainment
              strategies, Frontiers in Bioengineering and Biotechnology
              2023; milasen, NEJM 2019.
            </p>
            <p className={styles.statement}>
              Prove the platform once. Then every new disease is a
              design problem, not a decade.
            </p>
          </div>
        </section>

        <section
          className={`${styles.band} ${styles.bandWash}`}
          aria-label="Design another peptide"
        >
          <div className={`container ${styles.closerow}`}>
            <p className={styles.closeline}>
              The board is live. Pick a condition.
            </p>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href="#demo">
              Design a peptide
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`container ${styles.footgrid}`}>
          <div className={styles.footbrand}>
            <a className={styles.wordmark} href="#top" aria-label="cozy-peptide home">
              cozy-peptide
            </a>
            <p className={styles.footmade}>
              Built for the Meta Global AI Hackathon.
            </p>
          </div>
          <nav className={styles.footcol} aria-label="Page">
            <a className={styles.footlink} href="#demo">
              the demo
            </a>
            <a className={styles.footlink} href="#biology">
              the biology
            </a>
            <a className={styles.footlink} href="#api">
              the API call
            </a>
            <a className={styles.footlink} href="#pipeline">
              the pipeline
            </a>
            <a className={styles.footlink} href="#safety">
              safety
            </a>
          </nav>
          <nav className={styles.footcol} aria-label="More">
            <a className={styles.footlink} href="#guardrails">
              safety rules
            </a>
            <a className={styles.footlink} href="#local">
              local run
            </a>
            <a className={styles.footlink} href="#top">
              back to top
            </a>
          </nav>
          <p className={styles.foothack}>
            Built during the{" "}
            <a
              href="https://cerebralvalley.ai/e/meta-ai-developer-hackathon"
              target="_blank"
              rel="noreferrer"
            >
              Meta Global AI Developer Hackathon
            </a>
            , Oct 26 to Nov 4, a remote event hosted by Meta and Cerebral
            Valley. Designed with Muse Spark 1.3 and verified by the
            symbolic compiler in this repo.
          </p>
          <p className={styles.footlegal}>
            All rights reserved · Hackathon software, verify all generated
            sequences experimentally before any therapeutic or clinical use.
          </p>
        </div>
      </footer>
    </div>
  );
}
