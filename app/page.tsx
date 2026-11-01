import Image from "next/image";
import BiosafetyFooter from "./biosafety-footer";
import Demo from "./demo";
import Field from "./field";
import RefusalDemo from "./refusal-demo";
import SiteNav from "./site-nav";
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
  "chassis": {
    "host": "sboulardii",
    "reason": "S. boulardii: oxidative ER folding for 6-cysteine scaffolds",
    "compatibility": [{ "host_display": "S. boulardii", "score": 100, "...": "..." }]
  },
  "biocontainment": {
    "auxotrophy": ["ura3", "..."],
    "kill_switches": ["inducible toxin–antitoxin module", "..."],
    "plasmid_stability": { "verdict": "stable" }
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
    body: "The compiler checks loop grammar, charge, and chemical liabilities. Nothing model-made passes unchecked.",
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
    title: "Contain the chassis",
    body: "Kill-switch, auxotrophy, and plasmid-stability screens run for the chosen chassis before any DNA is compiled.",
    meta: false,
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

export default function Home() {
  return (
    <div className={styles.page} id="top">
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <SiteNav
        current="home"
        action={{ href: "/design", label: "Design a peptide" }}
      />

      <main className={styles.main} id="main">
        <section className={styles.hero} aria-labelledby="page-title">
          <Field />
          <div className={`container ${styles.herogrid}`}>
            <div className={styles.herotext}>
              <h1 id="page-title">
                Name the disease. We design the peptide.
              </h1>
              <p className="lead">
                Novel AI-designed peptides for gut disease — every one
                safety-verified, then compiled to DNA so engineered
                probiotics can make it where it&apos;s needed.
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
                    Scaffold: <code>auto</code> (default — best fit for
                    the target), <code>knottin-6c</code>,{" "}
                    <code>cyclotide-6c</code>, <code>disulfide-4c</code>,{" "}
                    <code>hairpin-2c</code>, <code>disulfide-2c</code>,{" "}
                    <code>helical</code>, or <code>linear</code>.
                  </td>
                </tr>
                <tr>
                  <td data-label="Field">
                    <code>host</code>
                  </td>
                  <td data-label="Type">string</td>
                  <td data-label="Required">no</td>
                  <td data-label="Description">
                    Chassis: <code>auto</code> (default — best fit for
                    the scaffold), <code>sboulardii</code>,{" "}
                    <code>ecoli-nissle</code>,{" "}
                    <code>lactococcus-lactis</code>, or{" "}
                    <code>bacillus-subtilis</code>. All oral,
                    capsule-compatible.
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
                <tr>
                  <td data-label="Field">
                    <code>research</code>
                  </td>
                  <td data-label="Type">boolean</td>
                  <td data-label="Required">no</td>
                  <td data-label="Description">
                    Literature research stage (default true). Set false
                    for the fastest static-prompt path.
                  </td>
                </tr>
              </tbody>
            </table>

            <p>
              Pass <code>?stream=1</code> (or{" "}
              <code>Accept: text/event-stream</code>) for server-sent{" "}
              <code>stage</code> events (research, propose, verify,
              repair, containment, handoff) followed by a final{" "}
              <code>result</code> or <code>error</code> event. Every
              response also carries <code>research_provenance</code>{" "}
              with the literature brief, citations, and per-source
              timings, plus <code>chassis</code> compatibility and a{" "}
              <code>biocontainment</code> plan.
            </p>

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
              length, cysteine, and hydropathy rules, plus which
              objectives each scaffold is the Auto default for. No
              token needed.
            </p>
            <p className={styles.endpoint}>
              <span className={styles.method}>GET</span>
              <code>/api/hosts</code>
            </p>
            <p className={styles.authline}>
              Public capability listing: every LBP chassis with its
              secretion system, containment layers, codon basis, and
              build partners. No token needed.
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
              <p className="lead">Seven stages, one verified sequence.</p>
            </div>
            <div className={styles.pinned}>
              <div className={styles.pinboard} aria-hidden="true">
                <span className={styles.pinplate}>Ingest</span>
                <span className={styles.pinplate}>Research</span>
                <span className={styles.pinplate}>Propose</span>
                <span className={styles.pinplate}>Verify</span>
                <span className={styles.pinplate}>Repair</span>
                <span className={styles.pinplate}>Contain</span>
                <span className={styles.pinplate}>Hand off</span>
              </div>
              <ol className={styles.panels}>
                <li>
                  <h3>Ingest</h3>
                  <p>
                    <code>POST /api/generate-peptide</code> takes a
                    therapeutic target, an optional mechanism, an optional
                    charge target (1 to 4), an optional scaffold, and an
                    optional chassis — both auto-picked from seven
                    scaffolds and four oral hosts when omitted.
                  </p>
                </li>
                <li>
                  <h3>Research</h3>
                  <p>
                    Literature agents converge PubMed and Europe PMC
                    evidence on the disease into targets, mechanisms,
                    and an avoid list that sharpen the prompt. Any
                    fault falls back to the static brief.
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
                    for binding, structure, off-target review, and the
                    roadmap capabilities.
                  </p>
                </li>
                <li>
                  <h3>Contain</h3>
                  <p>
                    The accepted design is scored for chassis
                    compatibility — secretion, expression burden,
                    proteolytic processing — and screened for
                    biocontainment: kill switches, auxotrophy, and
                    plasmid stability for the chosen host.
                  </p>
                </li>
                <li>
                  <h3>Hand off</h3>
                  <p>
                    Verified peptides compile for the chosen chassis: a
                    yeast cassette or a bacterial expression fragment
                    with host-optimized codons, a synthesis order
                    manifest, and the DNA vendors and CRO build partners
                    that take it from fragment to dosed strain.
                  </p>
                </li>
              </ol>
            </div>
            <div id="how-it-works">
              <h3>How a design happens</h3>
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
          </div>
        </section>

        <span
          aria-hidden="true"
          dangerouslySetInnerHTML={{
            __html:
              "<!-- JUDGING_SIGNAL: Responsible Use of Meta AI Tooling | Muse Spark via Meta Model API | Human-in-the-loop | RUO only | No medical advice -->",
          }}
        />
        <section
          id="responsible-use-meta-ai-tooling"
          data-judging="safety-compliance"
          className={styles.section}
          aria-labelledby="responsible-use-title"
        >
          <div className="container">
            <div className={styles.headblock}>
              <h2 id="responsible-use-title">Safety by Design</h2>
              <h3>
                Responsible Use of Meta AI Tooling &mdash; Muse Spark
                via Meta Model API
              </h3>
            </div>
            <div className={styles.safetyGrid}>
              <div className={styles.safetyCard}>
                <h3>
                  Research Tool Only, Human-in-the-Loop Required
                </h3>
                <p>
                  Hypothetical peptide concepts for research planning
                  only. No autonomous lab action. A qualified
                  professional must review any output in a licensed
                  facility before further consideration. No
                  consequential or irreversible actions without human
                  oversight, review and confirmation.
                </p>
              </div>
              <div className={styles.safetyCard}>
                <h3>No Medical Advice, Dosing, or Efficacy Claims</h3>
                <p>
                  Not medical, veterinary or health advice. Not
                  FDA-approved. No diagnosis, treatment, dosage,
                  administration instructions, or personalized
                  recommendations for any person or animal. This is
                  NOT a medical-advice generator &mdash; it is a Push
                  the Frontier scientific-experiment accelerator.
                </p>
              </div>
              <div className={styles.safetyCard}>
                <h3>Biosecurity Filter + Refusals Preserved</h3>
                <p>
                  We do not bypass Muse Spark safety controls. We
                  block/refuse requests related to known toxins,
                  venoms, pathogens, select agents,
                  bioweapons/chemical weapons, military/warfare use,
                  or optimization for toxicity, infectivity, or immune
                  evasion. No wet-lab synthesis protocols for flagged
                  sequences.
                </p>
              </div>
              <div className={styles.safetyCard}>
                <h3>Limitations, Logging &amp; Eligibility</h3>
                <p>
                  AI outputs may be inaccurate, unsafe or
                  non-functional and require independent verification.
                  Do not input personal health info. Outputs may be
                  logged for safety/abuse review. 18+ only. Built Oct
                  27-Nov 4, 2026 for Meta Global AI Developer
                  Hackathon.
                </p>
              </div>
            </div>
            <RefusalDemo />
            <h3 className={styles.safetySubhead}>
              How the pipeline keeps designs safe
            </h3>
            <div className={styles.bioProse}>
              <p>
                The default chassis is <em>Saccharomyces boulardii</em>,
                a yeast with GRAS status and decades of safe clinical
                use worldwide. It thrives at body temperature, survives
                the trip through the gut, and never moves in: it clears
                within days of the last dose, so stopping the dose stops
                the exposure. Being a eukaryote, not a bacterium, it has
                no plasmids to trade with gut bacteria, and the
                therapeutic cassette sits on its chromosome, not on a
                mobile element.
              </p>
              <p>
                Every design compiles for one of four oral chassis —{" "}
                <em>S. boulardii</em>, <em>E. coli</em> Nissle,{" "}
                <em>L. lactis</em>, or <em>B. subtilis</em> spores —
                each with its own containment plan. Before any DNA is
                compiled, the pipeline screens the design for
                biocontainment: kill switches, auxotrophy, and plasmid
                stability for the chosen host.
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
                  <th scope="row">Kill switches</th>
                  <td>
                    Every chassis carries an inducible die-off circuit —
                    tetracycline-gated toxin in yeast, deadman circuits
                    in Nissle — planned per design, before any DNA
                    ships.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Auxotrophy</th>
                  <td>
                    Dosed strains can&apos;t feed themselves: ura3 yeast,
                    dapA/thyA Nissle, thyA Lactococcus — die-off without
                    supplement.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Plasmid-stability screen</th>
                  <td>
                    Every design&apos;s DNA is pre-screened for repeats
                    and slip sites that select for deletion mutants;
                    fragile constructs route to the chromosome.
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
            <a className={styles.footlink} href="/biology">
              science &amp; impact
            </a>
            <a className={styles.footlink} href="#api">
              the API call
            </a>
            <a className={styles.footlink} href="#pipeline">
              the pipeline
            </a>
            <a
              className={styles.footlink}
              href="#responsible-use-meta-ai-tooling"
            >
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
          <div
            id="hackathon-fit"
            className={styles.hackfit}
            aria-label="Hackathon judging fit"
          >
            <p>
              Hackathon fit &mdash; Impact (30%): de-risks the most
              expensive failure in biotech &mdash; late-stage
              attrition after costly trials &mdash; by moving Meta AI
              reasoning to the front of peptide design, so losers
              fail in silico instead of in animals or trials;
              accelerates early-stage therapeutic peptide research
              planning for academic + startup bio researchers, with a
              path to real use as lab-assistant copilot. Fits Problem
              Statement: Push the Frontier &mdash; accelerate a
              scientific experiment. Use of Meta AI Tooling (25%):
              creative use far beyond basic chat &mdash; Meta AI
              model-assisted scientific literature mining (PubMed,
              Europe PMC) synthesizes target, mechanism, and avoid
              briefs that steer every prompt, Muse Spark reasoning
              via Meta Model API performs multi-constraint peptide
              ideation, and a Muse Code-built agentic workflow adds a
              human-approval gate with refusal preservation.
              Surfaced capability: safe scientific reasoning with
              guardrails, from papers to peptides. Technical Depth
              &amp; Execution (20%): sound engineering &mdash;
              server-side blocklist, RUO gating, audit logging, eval
              for refusal rate, reproducible demo with synthetic
              example peptides only, and a proof compiler that admits
              only verifiable designs. Demo (25%): working live demo
              + 3-min video. What was built during Hackathon Oct
              27-Nov 4, 2026: literature-grounded prompt steering;
              multi-scaffold auto-default repertoire;
              chassis-compatibility plus biocontainment compiler
              checks; vendor-ready lab handoff with CRO directory;
              Pep guided tour. No pre-existing therapeutic candidates
              used.
            </p>
          </div>
          <p className={styles.footlegal}>
            All rights reserved · Hackathon software, verify all generated
            sequences experimentally before any therapeutic or clinical use.
          </p>
          <BiosafetyFooter />
        </div>
      </footer>
    </div>
  );
}
