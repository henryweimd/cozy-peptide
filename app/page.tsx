import Image from "next/image";
import Demo from "./demo";
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
    "id": "SB-KNOT-1G97R3",
    "sequence": "CNRPNAGQCSLLKNNCIVPCKTCRIHPHWIYYTC",
    "length": 34,
    "cysteine_indices": [0, 8, 15, 19, 22, 33],
    "loop_segments": ["NRPNAGQ", "SLLKNN", "IVP", "KT", "RIHPHWIYYT"],
    "biophysical_profile": {
      "net_charge_ph74": 3.715,
      "isoelectric_point": 8.94,
      "gravy_score": -0.279,
      "boman_index": 1.16
    },
    "cloning_payload": {
      "cassette_format": "MFalpha1-Kex2-Knottin-CYC1term",
      "dna_sequence": "...",
      "gc_percent_cds": 38.2,
      "...": "..."
    },
    "verification_report": {
      "kex2_clean": true,
      "glycosylation_clean": true,
      "charge_window_ok": true,
      "protease_clean": true,
      "passed": true,
      "...": "..."
    },
    "topology": "C1-C4, C2-C5, C3-C6 ICK"
  },
  "symbolic_audit": {
    "passed": true,
    "charge": 4,
    "gravy": -0.279,
    "boman_index": 1.16,
    "aliphatic_index": 68.82,
    "liabilities_cleared": ["Trypsin", "Kex2-site", "Chymotrypsin", "..."]
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
        <div className={styles.hero}>
          <div>
            <p className={styles.live}>
              <span className={styles.dot} aria-hidden="true" />
              Live API — POST /api/generate-peptide
            </p>
            <h1>Describe the disease. Muse Spark designs the probiotic. Your medicine, brewed around the clock.</h1>
            <p className={styles.lede}>
              Name a gut disease target — say, <em>C. difficile</em> — and
              Muse Spark 1.3 dreams up brand-new knottins: tiny knotted
              proteins, tough enough to survive digestion, that have never
              existed in nature. A symbolic compiler proves each design
              sound, and the API returns the verified protein sequence —
              readily compiled to DNA your lab can order — encoding a
              probiotic yeast that turns your gut into a miniature
              factory, manufacturing the drug on site where the disease
              lives.
            </p>
            <ul className={styles.stats} aria-label="Design constraints">
              <li>28–36 aa</li>
              <li>6-Cys ICK knot</li>
              <li>charge +1…+4</li>
              <li>CAI &gt; 0.85</li>
            </ul>
          </div>
          <figure className={styles.figure}>
            <Image
              src="/knottin-exhibit.png"
              alt="Structural cartoon of a Muse Spark 1.3-designed knottin for C. difficile"
              width={433}
              height={453}
              priority
            />
            <figcaption>
              A knottin invented by Muse Spark 1.3 for{" "}
              <em>C. difficile</em> — never existed in nature.
            </figcaption>
          </figure>
        </div>

        <section aria-labelledby="demo">
          <h2 id="demo">Design a peptide in your browser</h2>
          <p>
            Pick a gut condition and run the real pipeline — proposal,
            grammar check, audit, and lab handoff — right here. Limited to
            one design per minute per visitor so the shared demo stays
            responsive.
          </p>
          <Demo />
        </section>

        <section aria-labelledby="why">
          <h2 id="why">Change how medicines get made</h2>
          <ul className={styles.checklist}>
            <li>
              <strong>🛡️ Medicines that survive digestion.</strong> Most protein
              drugs are destroyed in the stomach before they can work.
              Knottins are tied in a cysteine knot that shrugs off acid and
              enzymes, so they can act right inside the gut.
            </li>
            <li>
              <strong>💡 Invented, not found.</strong> Rather than screening
              nature&apos;s libraries, Muse Spark 1.3 reasons over the
              grammar of proteins to propose truly novel sequences — then a
              compiler, not vibes, verifies knot topology, charge,
              stability, and safety.
            </li>
            <li>
              <strong>🧬 Protein out, DNA follows.</strong> The passing
              design is a verified amino-acid sequence — the invention
              itself — which compiles straight to a vendor-ready synthesis
              order: codon-optimized DNA, secretion signal, and assembly
              parts that install a miniature drug factory in the gut.
            </li>
          </ul>
        </section>

        <section aria-labelledby="language">
          <h2 id="language">Teach AI to write the sentences of life</h2>
          <p>
            We think of language models as predictors of words. But the
            most important language isn&apos;t made of words — it&apos;s
            written in DNA, translated into amino acids, and strung into
            proteins. If amino acids are words, proteins are the sentences
            of life.
          </p>
          <p>
            Science gave every amino acid a single-letter abbreviation, so
            a protein is literally text — and cozy-peptide lets Muse Spark
            1.3 write in that language. Every AI-written sentence is then
            compiled: knot grammar, charge, stability, safety. Drafts that
            don&apos;t make sense get edited until they do.
          </p>
          <p>
            <strong>
              A model that writes fluent sentences in the language of life
              isn&apos;t a chatbot trick — it&apos;s a drug-discovery
              engine.
            </strong>
          </p>
        </section>

        <section aria-labelledby="pipeline">
          <h2 id="pipeline">Trace a request from prompt to DNA</h2>
          <ol className={styles.pipeline}>
            <li>
              <strong>Ingest.</strong> <code>POST /api/generate-peptide</code>{" "}
              takes a therapeutic target, an optional mechanism, and an
              optional charge target (1, 2, 3, or 4).
            </li>
            <li>
              <strong>Propose.</strong> Meta Spark 1.3 drafts knottin
              secretion payloads for <em>S. boulardii</em> (MFα1 pre-pro
              leader) in the loop grammar <code>L0–C1…C6–L6</code> with{" "}
              <code>C1–C4, C2–C5, C3–C6</code> ICK pairing and canonical
              loop envelopes.
            </li>
            <li>
              <strong>Verify.</strong> Every candidate must pass the symbolic
              audit: 28–36 aa, 6-Cys parity, exact formal charge inside the
              +1…+4 window, GRAVY in [−0.40, +0.10], and zero Kex2,
              glycosylation, chymotrypsin, N-terminal, or hydrophobic-run
              liabilities.
            </li>
            <li>
              <strong>Repair.</strong> Failures return structured compiler
              diagnostics with machine-readable failure modes for
              model-guided repair at penalized temperatures instead of
              being discarded; survivors face a blinded specificity review
              that must independently confirm the target. The full trace
              ships in the response.
            </li>
            <li>
              <strong>Hand off.</strong> Verified knottins compile to a
              ready-to-clone yeast cassette — MFα1 5′ flank with the Kex2
              junction, GC-tuned payload CDS, dual stop codons, and the
              CYC1 terminator — plus a Gibson-flanked gBlock manifest:
              everything needed to install the miniature gut factory.
            </li>
          </ol>
        </section>

        <section aria-labelledby="api">
          <h2 id="api">Generate a peptide in one API call</h2>
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
                <td>1 | 2 | 3 | 4</td>
                <td>no</td>
                <td>
                  Exact net charge required (inside the +1…+4 window at pH
                  7.4). Default 4.
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
          <h2 id="safety">Block toxins and enzymes before generation</h2>
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
          <h2 id="local">Run the compiler on your machine</h2>
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
