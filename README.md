# cozy-peptide - Neurosymbolic Biopolymer Compiler & Probiotic Secretion Engine

*Built for the Meta Global AI Hackathon. Live API docs:
https://cozy-peptide.vercel.app*

## Executive Summary

cozy-peptide is a neurosymbolic design pipeline targeting **gut-stable therapeutic
knottins (28-36 aa)** compiled into *Saccharomyces boulardii* secretion cassettes.
It bridges generative LLM proposals (**Meta Spark 1.3**) with deterministic
biological verification: every candidate sequence must pass a symbolic compiler
audit (cysteine parity, loop grammar, charge, hydropathy, protease liabilities)
before it is emitted as a lab-ready yeast secretion construct.

## Architecture

```text
Ingestion
  -> Meta Spark 1.3 sequence proposal
  -> Deterministic Symbolic Compiler
  -> Closed-loop compiler diagnostic feedback
  -> Lab handoff
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

## Safety & Biosecurity

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

## API Specs

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

Error codes: `401` invalid/missing Bearer token, `400` validation failure,
`403` biosecurity block, `422` catalytic-enzyme refusal, `502` upstream
generation failure.

## Local Development

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
