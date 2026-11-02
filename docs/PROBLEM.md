# Problem statement

**Track:** Push the Frontier — accelerate a scientific experiment.
**Project:** cozy-peptide, a novel-peptide designer for Live
Biotherapeutic Products (LBPs).

## The problem

LBP factories are a solved problem. Regulators have approved two
fecal-microbiota products, GMP anaerobic manufacturing exists, and
colonization science is well understood. What is *not* solved is the
payload: the therapeutic peptide the engineered microbe must make on
site. Teams pick payloads by literature habit and hope — a hidden debt
that compounds through strain engineering, animal work, and trials,
where a wrong peptide fails expensively and late.

## Who this hurts

Academic labs and seed-stage biotechs designing LBPs for gut disease
and beyond. They cannot afford shotgun screening (10,000 candidates
through wet-lab assays) or a failed preclinical program. Rational
peptide design exists for antibodies, not for small LBP payloads.

## What we built

A compiler for therapeutic peptides. A researcher names a disease
target; Meta AI proposes novel sequences; a deterministic symbolic
compiler proves each one (topology, charge, liabilities, safety) or
returns diagnostics for repair; the winner ships as vendor-ready DNA
with a chassis, containment plan, and CRO handoff. The Lab Guide then
closes the loop: bench results flow back in standard formats, so each
run improves the next — and, with consent, the community's models.

## Path to real use

Research-use-only lab-assistant copilot: design review in licensed
facilities, CRO work orders out, assay data back in. No autonomous lab
action, no medical advice, human approval at every consequential step.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how it is built and
[../README.md](../README.md) for the full story.
