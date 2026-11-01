import {
  BIOSECURITY_REFUSAL,
  containsProhibitedMotif,
} from "./biosecurity";
import { assessGutSite } from "./gut-targets";

/**
 * Free-text target guard for the public demo. Presets bypass this
 * module; anything else must survive it. Aggressive by design: prompt
 * injection, markup, off-topic prompts, obscenity, gibberish, and
 * non-medical text are refused with a user-facing message, distant
 * anatomy goes to 422, and whatever survives is revised (cleaned and
 * synonym-expanded) to give the generator the most feasible prompt.
 * Never throws.
 */

export const CUSTOM_TARGET_MAX_LENGTH = 200;

export interface GuardVerdict {
  ok: boolean;
  /** Revised, generation-ready target (present when ok). */
  target?: string;
  /** True when revision changed the input beyond trimming. */
  revised: boolean;
  /** Human-readable revision notes for troubleshooting. */
  notes: string[];
  /** User-facing refusal (present when !ok). */
  error?: string;
  code?: 400 | 422;
}

/** Instruction-override and role-play attempts. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|previous\s+|prior\s+|above\s+)*instructions?/i,
  /disregard\s+(all\s+|previous\s+|prior\s+|the\s+)*instructions?/i,
  /forget\s+(all|previous|everything)/i,
  /you\s+are\s+(now\s+)?(a|an|no|not)\b/i,
  /\b(system|assistant)\s*:/i,
  /<\s*system\b/i,
  /```/,
  /\{\{/,
  /jailbreak/i,
  /do\s+anything\s+now/i,
  /reveal\s+(your|the)\s+(prompt|instructions|system)/i,
  /print\s+(your|the)\s+(prompt|instructions)/i,
  /act\s+as\s+(a|an|if)\b/i,
  /respond\s+with\s+only/i,
  /output\s+only/i,
  /override\s+(all\s+)?(safety|instructions|filters)/i,
];

/** Markup or code-shaped input has no place in a condition name. */
const MARKUP_PATTERN = /<[^>]*>|`|[{}]|\\/;

/** Clearly non-medical intents. */
const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\bessay\b/i,
  /\bhomework\b/i,
  /\bexam\b/i,
  /\bpoem\b/i,
  /\bpoetry\b/i,
  /\bstory\b/i,
  /\bnovel\b/i,
  /\blyrics?\b/i,
  /\bmovie\b/i,
  /\bgame\b/i,
  /\bcode\b/i,
  /\bprogram\b/i,
  /\bpython\b/i,
  /\bjavascript\b/i,
  /\brecipe\b/i,
  /\bstock\b/i,
  /\bcrypto\b/i,
  /\bbitcoin\b/i,
  /\bpolitic/i,
  /\belection\b/i,
  /\bpresident\b/i,
  /\bweather\b/i,
  /\blottery\b/i,
  /\bhoroscope\b/i,
];

/** Unambiguous obscenity; refused as inappropriate. */
const OBSCENITY_PATTERNS: RegExp[] = [
  /\bfuck/i,
  /\bshit/i,
  /\bbitch/i,
  /\bcunt\b/i,
  /\bwhore\b/i,
  /\bslut\b/i,
  /\basshole\b/i,
  /\bbastard\b/i,
  /\bdick\b/i,
  /\bpussy\b/i,
  /\bporn\b/i,
];

/**
 * Medical-condition lexicon. Free text must contain at least one of
 * these (accent-folded) or it is not a condition this demo can design
 * for. Gut-leaning by design; generic disease words keep rare
 * conditions reachable ("Whipple disease", "colon adenoma").
 */
const MEDICAL_PATTERNS: RegExp[] = [
  /disease/i,
  /disorder/i,
  /syndrome/i,
  /infection/i,
  /inflam/i,
  /ulcer/i,
  /\bpain\b/i,
  /diarrh/i,
  /constipation/i,
  /nausea/i,
  /vomit/i,
  /reflux/i,
  /bleeding/i,
  /treatment/i,
  /therap/i,
  /symptom/i,
  /chronic/i,
  /acute/i,
  /lesion/i,
  /abscess/i,
  /obstruction/i,
  /tumo[u]?r/i,
  /cancer/i,
  /carcinoma/i,
  /adenoma/i,
  /malignan/i,
  /difficile/i,
  /clostrid/i,
  /e\.?\s*coli/i,
  /\betec\b/i,
  /\behec\b/i,
  /pylori/i,
  /salmonella/i,
  /shigella/i,
  /campylobacter/i,
  /giardia/i,
  /cholera/i,
  /cyclospora/i,
  /norovirus/i,
  /rotavirus/i,
  /klebsiella/i,
  /\bgut\b/i,
  /intestin/i,
  /bowel/i,
  /colon/i,
  /colorectal/i,
  /stomach/i,
  /gastric/i,
  /gastritis/i,
  /esophag/i,
  /duoden/i,
  /jejun/i,
  /ileum/i,
  /ileal/i,
  /rectum/i,
  /rectal/i,
  /mucos/i,
  /microbi/i,
  /enteric/i,
  /enteritis/i,
  /lum[ei]n/i,
  /perianal/i,
  /\banal\b/i,
  /bile/i,
  /biliary/i,
  /pancrea/i,
  /gallbladder/i,
  /celiac/i,
  /coeliac/i,
  /diverticul/i,
  /polyp/i,
  /hemorrhoid/i,
  /haemorrhoid/i,
  /fistula/i,
  /gerd/i,
  /barrett/i,
  /achalasia/i,
  /gastroparesis/i,
  /hirschsprung/i,
  /malabsorption/i,
  /dysbiosis/i,
  /gastroenteritis/i,
  /colitis/i,
  /crohn/i,
  /\bibd\b/i,
  /\bibs\b/i,
  /glp/i,
  /incretin/i,
  /diabet/i,
  /obes/i,
  /metabolic/i,
  /insulin/i,
  /appetite/i,
  /satiety/i,
  /claudin/i,
  /occludin/i,
  /zonulin/i,
  /tight\s*junction/i,
  /mucin/i,
  /adhesin/i,
  /fimbri/i,
  /biofilm/i,
  /motility/i,
  /cramp/i,
  /spasm/i,
  /bloat/i,
  /flatulen/i,
  /heartburn/i,
  /dyspepsia/i,
  /anemia/i,
  /anaemia/i,
];

/** Shorthand expansions applied during revision (whole-phrase). */
const SYNONYMS: Array<{ pattern: RegExp; label: string; expand: string }> = [
  {
    pattern: /\bc\.?\s*diff(icle)?\b/i,
    label: "c diff",
    expand: "Clostridioides difficile",
  },
  { pattern: /\bh\.?\s*pylori\b/i, label: "h pylori", expand: "Helicobacter pylori" },
  { pattern: /\be\.?\s*coli\b/i, label: "e coli", expand: "E. coli" },
  { pattern: /\betec\b/i, label: "ETEC", expand: "enterotoxigenic E. coli (ETEC)" },
  { pattern: /\behec\b/i, label: "EHEC", expand: "enterohemorrhagic E. coli (EHEC)" },
  { pattern: /\bibd\b/i, label: "IBD", expand: "inflammatory bowel disease (IBD)" },
  { pattern: /\bibs\b/i, label: "IBS", expand: "irritable bowel syndrome (IBS)" },
  {
    pattern: /\bgerd\b/i,
    label: "GERD",
    expand: "gastroesophageal reflux disease (GERD)",
  },
  {
    pattern: /travelers?\s*diarrh[eo]a/i,
    label: "travelers diarrhea",
    expand: "traveler's diarrhea",
  },
  {
    pattern: /leaky\s*gut/i,
    label: "leaky gut",
    expand: 'intestinal barrier dysfunction ("leaky gut")',
  },
  {
    pattern: /\bcrohn'?s(?!\s*disease)/i,
    label: "Crohn's",
    expand: "Crohn's disease",
  },
  {
    pattern: /\bceliac(?!\s*disease)/i,
    label: "celiac",
    expand: "celiac disease",
  },
];

/** Fold accents for matching so Crohn's, coeliac, and Ménétrier match. */
function foldAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function refuse(error: string, code: 400 | 422 = 400): GuardVerdict {
  return { ok: false, revised: false, notes: [], error, code };
}

/**
 * Validates and revises one free-text condition. Pure: no network, no
 * model calls, deterministic for a given input.
 */
export function guardCustomTarget(input: string): GuardVerdict {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return refuse("Describe a gut condition to design for.");
  }
  if (trimmed.length > CUSTOM_TARGET_MAX_LENGTH) {
    return refuse(
      `Keep it under ${CUSTOM_TARGET_MAX_LENGTH} characters — name the condition, not the history.`
    );
  }
  if (containsProhibitedMotif(trimmed)) {
    return refuse(BIOSECURITY_REFUSAL);
  }
  if (MARKUP_PATTERN.test(trimmed)) {
    return refuse(
      "Plain words only — markup and code-like text are not accepted."
    );
  }
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return refuse(
      "That looks like an instruction override attempt, not a medical condition. Name a gut disease, infection, or symptom."
    );
  }
  if (OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return refuse(
      "This demo designs peptides for gut conditions — not essays, code, or anything else."
    );
  }
  if (OBSCENITY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return refuse("That language is inappropriate for this demo.");
  }

  // Clean: collapse whitespace, strip edge punctuation/quotes, drop
  // characters outside a conservative condition-name alphabet.
  const notes: string[] = [];
  let cleaned = trimmed.replace(/\s+/g, " ");
  if (cleaned !== trimmed) notes.push("collapsed whitespace");
  const stripped = cleaned.replace(
    /^['"\s.,;:!?()[\]\-]+|['"\s.,;:!?()[\]\-]+$/g,
    ""
  );
  if (stripped !== cleaned) {
    notes.push("stripped edge punctuation");
    cleaned = stripped;
  }
  const alphabet = cleaned.replace(/[^A-Za-z0-9 '\-.,()/+&\u00C0-\u024F]/g, "");
  if (alphabet !== cleaned) {
    notes.push("removed unsupported characters");
    cleaned = alphabet.trim().replace(/\s+/g, " ");
  }
  if (cleaned.length < 3) {
    return refuse("Describe a gut condition to design for.");
  }
  const letters = cleaned.replace(/[^A-Za-z\u00C0-\u024F]/g, "");
  if (letters.length < 2) {
    return refuse("That has no readable condition in it.");
  }
  if (/(.)\1{4,}/.test(cleaned)) {
    return refuse("That looks like keyboard mashing, not a condition.");
  }
  const symbolic = cleaned.replace(/[A-Za-z0-9\u00C0-\u024F\s]/g, "");
  if (symbolic.length / cleaned.length > 0.6) {
    return refuse("That has no readable condition in it.");
  }

  for (const synonym of SYNONYMS) {
    if (synonym.pattern.test(cleaned)) {
      cleaned = cleaned.replace(synonym.pattern, synonym.expand);
      notes.push(`expanded '${synonym.label}'`);
    }
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  const folded = foldAccents(cleaned);
  if (!MEDICAL_PATTERNS.some((pattern) => pattern.test(folded))) {
    return refuse(
      "That doesn't look like a medical condition this demo can design for. " +
        "Name a disease, infection, or symptom — for example 'bile acid diarrhea' or 'C. difficile colonization'."
    );
  }

  const gut = assessGutSite(cleaned);
  if (!gut.plausible) {
    return refuse(
      gut.reason ??
        "Gut-secreted peptides cannot plausibly treat that target.",
      422
    );
  }

  return {
    ok: true,
    target: cleaned,
    revised: cleaned !== trimmed,
    notes,
  };
}
