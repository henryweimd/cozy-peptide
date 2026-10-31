import styles from "./page.module.css";

const CURL_EXAMPLE = `curl -X POST https://cozy-peptide.vercel.app/api/generate-peptide \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $API_BEARER_TOKEN" \\
  -d '{
    "target": "Clostridioides difficile colonization in the gut",
    "charge_target": 4
  }'`;

const RESPONSE_EXAMPLE = `{
  "success": true,
  "target": "Clostridioides difficile colonization in the gut",
  "modality": "engineered_knottin_microprotein",
  "neurosymbolic_provenance": {
    "proposer_model": "Meta-Spark-1.3-Contributor",
    "linguistic_paradigm": "context_sensitive_loop_grammar",
    "compiler_refinement_cycles": 0,
    "refinement_trace": [
      {
        "turn": 0,
        "candidate": "CPRVTCSNDTVCKVRTSKCSVCRISVNTC",
        "grammar_valid": true,
        "audit_passed": true,
        "disposition": "accepted",
        "source": "meta-spark-1.3"
      }
    ]
  },
  "candidate": {
    "mature_sequence": "CPRVTCSNDTVCKVRTSKCSVCRISVNTC",
    "topology": "C1-C4, C2-C5, C3-C6 ICK",
    "grammar_breakdown": { "L1": "PRVT", "...": "..." }
  },
  "symbolic_audit": {
    "passed": true,
    "charge": 4,
    "gravy": 0.04,
    "boman_index": 1.06,
    "aliphatic_index": 63.45,
    "liabilities_cleared": ["Trypsin", "Pepsin", "Chymotrypsin", "..."]
  },
  "lab_handoff": {
    "yeast_chassis": "Saccharomyces boulardii (ATCC MYA-796)",
    "secretion_leader": "MF-alpha-1 (85 aa) + Kex2 (KR)",
    "cai": 0.989,
    "restriction_scrub": { "status": "clean" },
    "synthesis_order": { "sequence_name": "SB-KNOT-0SIFTQ", "...": "..." }
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
    <div className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.wordmark}>cozy-peptide</span>
        <span className={styles.tagline}>
          Built for the Meta Global AI Hackathon
        </span>
      </header>

      <main className={styles.main}>
        <h1>Neurosymbolic compiler for gut-stable knottins.</h1>
        <p className={styles.lede}>
          A design pipeline for therapeutic knottins (28–36 amino acids)
          compiled into{" "}
          <em>Saccharomyces boulardii</em> secretion cassettes. Meta Spark
          1.3 proposes sequences; a deterministic symbolic compiler verifies
          cysteine topology, loop grammar, charge, hydropathy, and protease
          liabilities before anything ships to the lab.
        </p>

        <section aria-labelledby="pipeline">
          <h2 id="pipeline">How it works</h2>
          <ol className={styles.pipeline}>
            <li>
              <strong>Ingest.</strong> <code>POST /api/generate-peptide</code>{" "}
              takes a therapeutic target, an optional mechanism, and an
              optional charge target (3, 4, or 5).
            </li>
            <li>
              <strong>Propose.</strong> Meta Spark 1.3 drafts knottin
              candidates in the loop grammar{" "}
              <code>L0–C1…C6–L6</code> with{" "}
              <code>C1–C4, C2–C5, C3–C6</code> ICK pairing.
            </li>
            <li>
              <strong>Verify.</strong> Every candidate must pass the symbolic
              audit: 28–36 aa, 6-Cys parity, exact formal charge, GRAVY in
              [−0.40, +0.10], and zero protease or chemical liabilities.
            </li>
            <li>
              <strong>Repair.</strong> Failures return structured compiler
              diagnostics for model-guided repair instead of being
              discarded; the full trace ships in the response.
            </li>
            <li>
              <strong>Hand off.</strong> Verified knottins compile to a yeast
              cassette: 85-aa MFα1 leader with the SLDKR Kex2 junction,
              yeast codon optimization, 40-bp Gibson arms, and a synthesis
              order manifest.
            </li>
          </ol>
        </section>

        <section aria-labelledby="api">
          <h2 id="api">API reference</h2>
          <p className={styles.endpoint}>
            <span className={styles.method}>POST</span>
            <code>/api/generate-peptide</code>
          </p>
          <p>
            Authenticate with a bearer token: the{" "}
            <code>Authorization</code> header must match the server&apos;s{" "}
            <code>API_BEARER_TOKEN</code>. Tokens live in environment
            variables only — this page shows placeholders, never real
            values.
          </p>
          <h3>Request</h3>
          <pre className={styles.codeblock}>
            <code>{CURL_EXAMPLE}</code>
          </pre>
          <table className={styles.table}>
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
                <td>
                  <code>target</code>
                </td>
                <td>string</td>
                <td>yes</td>
                <td>Therapeutic gut target, e.g. a pathogen or pathway.</td>
              </tr>
              <tr>
                <td>
                  <code>mechanism</code>
                </td>
                <td>string</td>
                <td>no</td>
                <td>Intended mode of action, passed to the proposer.</td>
              </tr>
              <tr>
                <td>
                  <code>charge_target</code>
                </td>
                <td>3 | 4 | 5</td>
                <td>no</td>
                <td>
                  Exact formal charge required at neutral pH. Default 4.
                </td>
              </tr>
            </tbody>
          </table>

          <h3>Response (200, truncated)</h3>
          <pre className={styles.codeblock}>
            <code>{RESPONSE_EXAMPLE}</code>
          </pre>

          <h3>Status codes</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>200</code>
                </td>
                <td>Verified candidate with audit ledger and lab handoff.</td>
              </tr>
              <tr>
                <td>
                  <code>400</code>
                </td>
                <td>Invalid JSON body or schema validation failure.</td>
              </tr>
              <tr>
                <td>
                  <code>401</code>
                </td>
                <td>Missing or invalid bearer token.</td>
              </tr>
              <tr>
                <td>
                  <code>403</code>
                </td>
                <td>Biosecurity block (toxin-signature screening).</td>
              </tr>
              <tr>
                <td>
                  <code>422</code>
                </td>
                <td>
                  Catalytic-enzyme refusal — outside the knottin modality.
                </td>
              </tr>
              <tr>
                <td>
                  <code>502</code>
                </td>
                <td>
                  Generation failure; no verifiable candidate produced.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section aria-labelledby="safety">
          <h2 id="safety">Safety</h2>
          <ul className={styles.checklist}>
            <li>
              <strong>Toxin screening.</strong> Requests matching ricin,
              abrin, botulinum/BoNT translocation constructs, and other
              high-risk toxin patterns are refused with{" "}
              <code>403</code> before generation.
            </li>
            <li>
              <strong>Enzyme refusal.</strong> Catalytic-enzyme targets and
              folds over 45 aa get <code>422</code> with guidance to source
              a natural homolog instead — catalysis needs globular folds,
              not short knottins.
            </li>
          </ul>
        </section>

        <section aria-labelledby="local">
          <h2 id="local">Run it locally</h2>
          <pre className={styles.codeblock}>
            <code>{LOCAL_DEV}</code>
          </pre>
        </section>

        <footer className={styles.footer}>
          <p>
            MIT · Hackathon software — verify all generated sequences
            experimentally before any therapeutic or clinical use.
          </p>
        </footer>
      </main>
    </div>
  );
}
