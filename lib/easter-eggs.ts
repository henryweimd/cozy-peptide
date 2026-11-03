/**
 * Hidden lore — easter eggs for codebase readers only.
 *
 * DO NOT import this module from `app/`, `components/`, or any demo script.
 * It must never ship in the web bundle, appear in the README, or surface
 * in the demo UI. See `EASTER_EGGS.md` at the repo root.
 *
 * 1. "My Little Peptide" — toy commercial parody:
 *    https://www.youtube.com/watch?v=ssaXIqbLFIA
 *
 * 2. Cozy Clinic — the original hackathon project Cozy Peptide pivoted from
 *    (hence the "Cozy" name). It was meant to be a game to raise millions
 *    of health-literate learners and create a new generation of doctors
 *    and healthcare providers:
 *    https://cozy-clinic.vercel.app/
 */

export const EASTER_EGGS = {
  myLittlePeptide: "https://www.youtube.com/watch?v=ssaXIqbLFIA",
  cozyClinic: "https://cozy-clinic.vercel.app/",
} as const;
