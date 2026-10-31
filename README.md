# cozy-peptide — AI-Invented Mini-Proteins, Verified for the Lab

*Built for the Meta Global AI Hackathon. Live API docs:
https://cozy-peptide.vercel.app*

*Describe the disease. Muse Spark designs the probiotic. Your medicine, brewed around the clock.*

![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Next.js](https://img.shields.io/badge/built_with-Next.js-black?logo=next.js)
![Model](https://img.shields.io/badge/model-Muse_Spark_1.3-blue)

## 🎯 Turn a disease name into gut medicine

Most medicines are either tiny chemicals or giant antibodies. cozy-peptide
works in the fertile middle: **knottins** — miniature proteins just 28–36
building blocks long, tied into a molecular knot by six cysteines. That knot
is armor: knottins can survive stomach acid and digestive enzymes that shred
ordinary protein drugs in minutes, so they can act directly inside the gut.

Here is the remarkable part: **no human draws these molecules.** You name a
gut disease target — say, *Clostridioides difficile* colonization — and
**Muse Spark 1.3** invents brand-new knottin sequences from scratch: proteins
that have never existed in nature, reasoned into being from the grammar of
protein language. A deterministic symbolic compiler then interrogates every
candidate — knot topology, charge, stability, protease resistance, safety —
and rejects anything unsound. Failures return as compiler diagnostics that
guide Muse Spark to repair its own designs, in a closed loop, until one
passes every check.

The output is not a picture or a score. It is a **DNA synthesis order you can
send to a vendor**: codon-optimized cDNA encoding a probiotic yeast
(*Saccharomyces boulardii*) — a living miniature factory you install in
your gut — that manufactures your therapeutic on site, exactly where the
disease lives. The medicine is not a pill you keep taking; it is a factory
you swallow once.

Disease target in, lab-ready DNA out — with a full audit trail anyone can
inspect.

## 🧬 Teach AI to write the sentences of life

We think of language models as predictors of words. But words are not the
only language — and arguably not the most important one. The language of
life is written in DNA, translated into amino acids, and strung into
proteins: the molecular machines that digest food, fight infection, and
build bodies. If amino acids are words, proteins are the sentences of
life — and most random sentences are gibberish.

This project teaches Muse Spark 1.3 to write in that language. Science long
ago assigned every amino acid a single-letter abbreviation — A, C, D, E…
— which means a protein is literally a string of text. cozy-peptide adapts
Muse Spark to generate not essays or code, but text-as-amino-acids:
candidate protein sentences, composed under the grammatical constraints of
one of nature's toughest architectures, the knottin.

And just as English has grammar separating sense from nonsense, proteins
have a grammar too — cysteine knots must close, charges must balance,
fragile motifs must be absent. So every AI-written sentence is compiled:
parsed against the knottin loop grammar, audited for stability and safety,
and either accepted or returned with compiler diagnostics for revision.
Muse Spark drafts; the compiler edits; only fluent, grammatical,
manufacturable proteins survive.

A language model that writes valid sentences in the language of life is not
a chatbot trick. It is a drug-discovery engine.

## Change how medicines get made

- **Designed, not discovered.** Drug hunting today means screening libraries
  of molecules found in nature. cozy-peptide flips that: the AI proposes
  truly novel sequences, purpose-built for the target.
- **Language, not brute force.** Instead of simulating billions of atomic
  coordinates, Muse Spark 1.3 treats proteins the way a linguist treats
  sentences — loops as phrases, cysteines as punctuation — and the compiler
  enforces the grammar. Reasoning replaces raw computation.
- **Verified before a dollar is spent.** Every design must pass a battery of
  deterministic checks (topology, charge, hydropathy, liabilities,
  developability metrics) before synthesis is even suggested — and the
  biosecurity filter refuses toxins and out-of-modality enzymes up front.
- **Bench-ready, not demo-ware.** The response includes mature/precursor
  FASTA, restriction-scrubbed cDNA, Gibson assembly arms, CAI/GC reports,
  and a Twist/IDT-compatible order manifest.

## 🔬 Watch a prompt become a protein

<p align="center">
  <img src="assets/CPRVTCSNDTVCKVRTSKCSVCRISVNTC.png" width="380" alt="Structural cartoon of a Muse Spark 1.3-designed knottin">
</p>

*A never-before-seen mini-protein, invented from scratch by Muse Spark 1.3
to fight **C. difficile** gut infections. Its knotted, ribbon-like shape is
the whole trick: that knot acts as armor, letting the molecule survive
stomach acid and digestive enzymes so it can go to work inside the
intestine. No human drew this molecule and it exists in no natural genome —
it was reasoned into being, then verified, in a single API call.*

*Technical details: proposed by `muse-spark-1.3-contributor` for target
"C. difficile TcdA mucosal colonization" (`charge_target` 4) and accepted
at refinement turn 0 with grammar and audit both passing. 29-aa knottin,
6-Cys ICK topology (C1–C4, C2–C5, C3–C6), formal charge +4, GRAVY +0.04,
Boman index 1.06, aliphatic index 63.45; liabilities cleared: trypsin,
pepsin, chymotrypsin, Asp-Gly, Asn-Gly, Met-oxidation. Compiled to an
S. boulardii (ATCC MYA-796) MFα1/SLDKR secretion cassette (CAI 0.989,
restriction scrub clean, 422-bp gBlock). Mature sequence:
`CPRVTCSNDTVCKVRTSKCSVCRISVNTC` (also the image filename). Structural
cartoon shown for illustration — verify experimentally before any
therapeutic use.*

## Trace a request from prompt to DNA

```mermaid
flowchart LR
    A["🎯 Disease target + charge"] --> B["Muse Spark 1.3 proposes knottins"]
    B --> C{"Symbolic compiler audit"}
    C -->|"fail: diagnostics"| D["Repair loop"]
    D --> B
    C -->|"pass"| E["Lab handoff: yeast cassette + DNA order"]
```

1. **Ingestion** — `POST /api/generate-peptide` accepts a therapeutic `target`,
   optional `mechanism`, and optional integer `charge_target` (3, 4, or 5).
2. **Meta Spark 1.3 sequence proposal** (`lib/meta-spark.ts`) — the Contributor
   API proposes knottin candidates under a context-sensitive loop-grammar
   paradigm (`C1-C4, C2-C5, C3-C6 ICK` topology).
3. **Deterministic Symbolic Compiler** (`lib/symbolic-auditor.ts`,
   `lib/protein-grammar.ts`) — each proposal is audited for:
   - Length 28-36 aa with **6-Cys parity**
   - Loop turn rules via the `L0-C1-L1-C2-L2-C3-L3-C4-L4-C5-L5-C6-L6` grammar
   - **Integer formal charge** matching the requested target
   - **GRAVY** hydropathy within [-0.4, 0.1], plus Boman, aliphatic index, pI,
     mucosal adhesion, and cleavage susceptibility metrics
   - **Protease liability filtering** (trypsin, pepsin/chymotrypsin, Asp-Gly,
     Asn-Gly, Met-oxidation motifs)
4. **Closed-loop compiler diagnostic feedback** — failures return structured
   diagnostics (`refinement_trace`) to the proposer for repair; the loop runs
   until a candidate passes or turns are exhausted.
5. **Lab handoff** (`lib/lab-handoff.ts`, `lib/codon-optimizer.ts`) — verified
   candidates are compiled into an *S. boulardii* (ATCC MYA-796) cassette with:
   - 85-aa **MFalpha-1 pre-pro secretion leader** ending in the native
     **Kex2 junction** (`SLDKR`)
   - *S. boulardii* **yeast codon bias** optimization with CAI/GC reporting
   - 40-bp **Gibson homology arms** for pESC/pPic9 assembly
   - Restriction-site scrub, mature/precursor FASTA, and a DNA synthesis order
     manifest

## 🛡️ Block toxins and enzymes before generation

`lib/biosecurity.ts` screens every request before generation:

- **Strict toxin-signature screening** — requests matching ricin, abrin,
  botulinum/BoNT (including translocation-domain constructs), diphtheria,
  Shiga, anthrax, tetanus, saxitoxin, tetrodotoxin, aflatoxin, or T-2 toxin
  patterns are refused with `403 Forbidden`.
- **Catalytic-enzyme refusal** — enzyme targets (lactase, polymerase, kinase,
  protease, catalytic triads/pockets, enzyme replacement, and related terms)
  or requests implying folds **>45 aa** are refused with `422 Unprocessable`,
  since catalytic pockets require large globular folds outside the 28-36 aa
  knottin modality. The response suggests sourcing a natural homolog instead.

## Generate a peptide in one API call

### `POST /api/generate-peptide`

Requires **Bearer token** authentication. The server compares the
`Authorization` header against the `API_BEARER_TOKEN` environment variable.

```bash
curl -X POST http://localhost:3000/api/generate-peptide \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_BEARER_TOKEN" \
  -d '{
    "target": "Clostridioides difficile colonization in the gut",
    "mechanism": "Cationic knottin that disrupts vegetative cell membranes while remaining stable to gut proteases",
    "charge_target": 4
  }'
```

Sample payload:

```json
{
  "target": "Clostridioides difficile colonization in the gut",
  "mechanism": "Cationic knottin that disrupts vegetative cell membranes while remaining stable to gut proteases",
  "charge_target": 4
}
```

Sample JSON response (truncated):

```json
{
  "success": true,
  "target": "Clostridioides difficile colonization in the gut",
  "modality": "engineered_knottin_microprotein",
  "neurosymbolic_provenance": {
    "proposer_model": "Meta-Spark-1.3-Contributor",
    "linguistic_paradigm": "context_sensitive_loop_grammar",
    "compiler_refinement_cycles": 2,
    "refinement_trace": []
  },
  "candidate": {
    "mature_sequence": "GCPKILKKCRRDSDCPGACICRGNGYCG",
    "topology": "C1-C4, C2-C5, C3-C6 ICK",
    "grammar_breakdown": { "L0": "G", "L1": "PKILKK", "...": "..." }
  },
  "symbolic_audit": {
    "passed": true,
    "length": 28,
    "cys_count": 6,
    "charge": 4,
    "charge_target": 4,
    "gravy": -0.21,
    "liabilities_cleared": ["Trypsin", "Pepsin", "Chymotrypsin"],
    "violations": []
  },
  "lab_handoff": {
    "yeast_chassis": "Saccharomyces boulardii (ATCC MYA-796)",
    "secretion_leader": "MF-alpha-1 (85 aa) + Kex2 (KR)",
    "cai": 0.87,
    "gc_content": 0.41,
    "restriction_scrub": { "status": "clean", "sites_verified": [] }
  }
}
```

| Code | Meaning |
| ---- | ------- |
| `200` | Verified candidate with audit ledger and lab handoff. |
| `400` | Invalid JSON body or schema validation failure. |
| `401` | Missing or invalid bearer token. |
| `403` | Biosecurity block (toxin-signature screening). |
| `422` | Catalytic-enzyme refusal — outside the knottin modality. |
| `502` | Generation failure; no verifiable candidate produced. |

### Try it in the browser

The landing page includes a live demo that runs the real pipeline with no
token required. It is restricted to five preset gut conditions and one
design per minute per visitor (server-enforced cooldown), so the shared
demo stays responsive and the upstream budget stays intact.

## Run the compiler locally

Prerequisites: Node.js 20+ and npm.

```bash
npm install

# Required env vars (see .env.local for local values)
export API_BEARER_TOKEN="your-local-bearer-token"
export META_API_KEY="your-meta-spark-key"
# Optional: override the default Meta Spark Contributor endpoint
# export META_SPARK_API_URL="https://api.example.com/v1"

npm run dev      # start Next.js dev server at http://localhost:3000
npm test         # typecheck + node --test suite
npm run lint     # eslint
npm run build    # production build
```

## License

MIT — see `LICENSE` (or the SPDX `MIT` grant in package metadata) for details.
This is hackathon software: verify all generated sequences experimentally
before any therapeutic or clinical use.
