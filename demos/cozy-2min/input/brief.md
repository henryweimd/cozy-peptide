# Demo Brief — cozy-2min

Drafted from `aidemo inspect http://127.0.0.1:3000/` (page title: cozy-peptide: name the disease, get a novel AI-designed peptide to treat it).
Fill in the product, audience, tone and CTA; the storyboard next to this file
already has the page's real selectors.

## Product
<your product>

## Demo goal
<the core flow, end to end>

## Audience
<who is this for>

## Tone
Friendly, practical, founder-style. Brisk.

## Length
~45-60 seconds.

## CTA
<what should the viewer do next>

---

## What inspect saw

Headings:
- h1 Name the disease. We design the peptide.
  - h2 Design a peptide
  - h2 Peptides from one API call
    - h3 Request
    - h3 Response (200, truncated)
    - h3 Status codes
    - h3 More endpoints
  - h2 Safety rules and a local run
    - h3 Toxin screening
    - h3 Enzyme refusal
    - h3 Gut-target filter
    - h3 Run the compiler on your machine
  - h2 Change how medicines get made
  - h2 A request, from prompt to DNA
    - h3 Ingest
    - h3 Research
    - h3 Propose
    - h3 Verify
    - h3 Repair
    - h3 Contain
    - h3 Hand off
    - h3 How a design happens
  - h2 Safety by Design
    - h3 Responsible Use of Meta AI Tooling — Muse Spark via Meta Model API
    - h3 Research Tool Only, Human-in-the-Loop Required
    - h3 No Medical Advice, Dosing, or Efficacy Claims
    - h3 Biosecurity Filter + Refusals Preserved
    - h3 Limitations, Logging & Eligibility
    - h3 What Gets Refused — Try It Live
    - h3 How the pipeline keeps designs safe

Interactive elements (unique selectors):

| role | name | selector | |
|---|---|---|---|
| button | C. difficile gut infection | `button:has-text("C. difficile gut infection")` |  |
| button | IBD gut inflammation | `button:has-text("IBD gut inflammation")` |  |
| button | IBS pain & constipation | `button:has-text("IBS pain & constipation")` |  |
| button | Leaky gut barrier repair | `button:has-text("Leaky gut barrier repair")` |  |
| button | Traveler's diarrhea (E. coli) | `button:has-text("Traveler's diarrhea (E. coli)")` |  |
| button | Bile acid diarrhea | `button:has-text("Bile acid diarrhea")` |  |
| button | SIBO overgrowth | `button:has-text("SIBO overgrowth")` |  |
| button | Ulcerative colitis | `button:has-text("Ulcerative colitis")` |  |
| button | C. jejuni infection | `button:has-text("C. jejuni infection")` |  |
| button | Salmonella blockade | `button:has-text("Salmonella blockade")` |  |
| button | Post-antibiotic dysbiosis | `button:has-text("Post-antibiotic dysbiosis")` |  |
| button | Cholera colonization | `button:has-text("Cholera colonization")` |  |

Next: write the narration, replace the candidate hover with the real click +
`assert`, then `aidemo probe` (or the MCP `probe` job).
