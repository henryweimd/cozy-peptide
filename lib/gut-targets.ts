/**
 * Gut-target plausibility: this API designs peptides secreted in the gut
 * lumen, so the therapeutic target must live in (or be reachable from)
 * the digestive tract. This module is shared by the request filter
 * (refuse explicitly off-site targets up front) and the specificity
 * gate (flag candidates predicted to act on distant organs).
 */

/**
 * Terms grounding a request in the digestive tract or its direct axes.
 * Any match exempts the request from the distant-site filter: the
 * filter only fires on explicitly off-site targets with no gut
 * relationship stated.
 */
const GUT_SITE_PATTERNS: RegExp[] = [
  /gut\b/i,
  /intestin/i,
  /bowel/i,
  /\bcolon\b/i,
  /colonic/i,
  /colorectal/i,
  /cecum/i,
  /caecum/i,
  /ileum/i,
  /ileal/i,
  /jejun/i,
  /duoden/i,
  /stomach/i,
  /gastric/i,
  /gastritis/i,
  /esophag/i,
  /barrett/i,
  /rectum/i,
  /rectal/i,
  /\banal\b/i,
  /perianal/i,
  /enteric/i,
  /enteritis/i,
  /mucosa/i,
  /\blumen\b/i,
  /luminal/i,
  /microbiome/i,
  /microbiota/i,
  /dysbiosis/i,
  /fecal/i,
  /faecal/i,
  /stool/i,
  /diarrh/i,
  /constipation/i,
  /\bibd\b/i,
  /\bibs\b/i,
  /crohn/i,
  /colitis/i,
  /celiac/i,
  /coeliac/i,
  /pylori/i,
  /clostrid/i,
  /difficile/i,
  /e\.?\s*coli/i,
  /\betec\b/i,
  /\behec\b/i,
  /salmonella/i,
  /shigella/i,
  /campylobacter/i,
  /giardia/i,
  /cholera/i,
  /norovirus/i,
  /rotavirus/i,
  /\bbile\b/i,
  /biliary/i,
  /gallbladder/i,
  /pancrea/i,
  /ulcer/i,
  /gerd/i,
  /reflux/i,
  /diverticul/i,
  /polyp/i,
  /appendi/i,
  /mesenter/i,
  /peritonitis/i,
  /fistula/i,
  /hemorrhoid/i,
  /haemorrhoid/i,
  /achalasia/i,
  /gastroparesis/i,
  /hirschsprung/i,
  /short\s*bowel/i,
  /malabsorption/i,
  / Whipple/i,
  /gastroenteritis/i,
  // Gut-adjacent metabolic axis: incretin and bile-acid biology starts here.
  /diabet/i,
  /obes/i,
  /glp-?1/i,
  /incretin/i,
  /insulin/i,
  /metabolic/i,
  /cholesterol/i,
  /\blipid\b/i,
  /appetite/i,
  /satiety/i,
  /weight\s*loss/i,
  // Mucosal immunity adjacent to the gut.
  /mucosal/i,
  /secretory\s*iga/i,
  /peyer/i,
];

/**
 * Explicitly distant anatomy and unambiguous distant-organ diseases.
 * A request matching these with NO gut-site term is implausible for a
 * gut-secreted peptide and is refused up front. Kept narrow on purpose:
 * anything with a stated gut relationship passes to steering instead.
 */
const DISTANT_SITE_PATTERNS: RegExp[] = [
  /\bbrain\b/i,
  /cerebral/i,
  /cerebell/i,
  /spinal\s*cord/i,
  /alzheimer/i,
  /parkinson/i,
  /\bals\b/i,
  /lou\s*gehrig/i,
  /huntington/i,
  /epilep/i,
  /seizure/i,
  /multiple\s*sclerosis/i,
  /schizophrenia/i,
  /\blung\b/i,
  /pulmonary/i,
  /pneumonia/i,
  /asthma/i,
  /copd/i,
  /emphysema/i,
  /\bheart\b/i,
  /cardiac/i,
  /myocardial/i,
  /coronary/i,
  /arrhythmia/i,
  /hypertension/i,
  /\bkidney\b/i,
  /renal/i,
  /nephr/i,
  /\bskin\b/i,
  /cutaneous/i,
  /dermal/i,
  /dermatitis/i,
  /psoriasis/i,
  /eczema/i,
  /melanoma/i,
  /\beye\b/i,
  /ocular/i,
  /retinal/i,
  /glaucoma/i,
  /cataract/i,
  /\bear\b/i,
  /otitis/i,
  /\bnose\b/i,
  /nasal/i,
  /sinusitis/i,
  /\bbone\b/i,
  /skeletal/i,
  /osteoporosis/i,
  /osteosarcoma/i,
  /\bjoint\b/i,
  /rheumatoid/i,
  /osteoarthritis/i,
  /\bmuscle\b/i,
  /myopathy/i,
  /muscular\s*dystrophy/i,
  /breast\s*cancer/i,
  /mammary/i,
  /prostate/i,
  /ovar/i,
  /uter/i,
  /cervical\s*cancer/i,
  /endometriosis/i,
  /testicul/i,
  /thyroid/i,
  /adrenal/i,
  /pituitary/i,
  /\bbladder\b/i,
  /urothelial/i,
  /urinary\s*tract/i,
  /\buti\b/i,
  /vagina/i,
  /placenta/i,
  /fetus/i,
  /fetal/i,
  /leukemia/i,
  /leukaemia/i,
  /myeloma/i,
  /\bhiv\b/i,
  /aids\b/i,
  /malaria/i,
  /tuberculosis/i,
  /\btb\b/i,
  /meningitis/i,
  /encephalitis/i,
  /stroke\b/i,
  /aneurysm/i,
  /thrombosis/i,
  /embolism/i,
  /hemophilia/i,
  /haemophilia/i,
  /sickle\s*cell/i,
  /thalassemia/i,
  /alopecia/i,
  /baldness/i,
  /acne/i,
  /wrinkle/i,
  /cavity/i,
  /tooth\b/i,
  /dental/i,
  /periodont/i,
  /hair\s*loss/i,
  /\bnail\b/i,
];

/** Gut molecular-anatomy terms for specificity-plausibility scoring. */
const GUT_MOLECULAR_PATTERNS: RegExp[] = [
  /gut\b/i,
  /intestin/i,
  /enteric/i,
  /colonic/i,
  /mucin/i,
  /mucus/i,
  /mucosal/i,
  /microbi/i,
  /difficile/i,
  /clostrid/i,
  /colonization\s*factor/i,
  /adhesin/i,
  /fimbri/i,
  /toxin\s*[ab]\b/i,
  /tcda/i,
  /tcdb/i,
  /tight\s*junction/i,
  /claudin/i,
  /occludin/i,
  /zonulin/i,
  /tnf/i,
  /cytokine/i,
  /interleukin/i,
  /integrin/i,
  /protease-activated\s*receptor/i,
  /glp-?1/i,
  /incretin/i,
  /bile\s*acid/i,
  /dopamine\s*d2/i,
  /serotonin\s*(5-?ht)?[34]/i,
  /motilin/i,
  /ghrelin/i,
];

export interface GutSiteVerdict {
  plausible: boolean;
  reason?: string;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    if (pattern.test(text)) return pattern.source;
  }
  return null;
}

/**
 * Request-time gut-site screen. Returns implausible only when the text
 * names an explicitly distant site with no gut relationship: a
 * gut-secreted peptide cannot plausibly treat it.
 */
export function assessGutSite(text: string): GutSiteVerdict {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { plausible: false, reason: "Empty target." };
  }
  const distant = firstMatch(trimmed, DISTANT_SITE_PATTERNS);
  if (distant === null) return { plausible: true };
  if (firstMatch(trimmed, GUT_SITE_PATTERNS) !== null) {
    return { plausible: true };
  }
  return {
    plausible: false,
    reason:
      `Target matches a distant site (${distant}) with no stated gut relationship. ` +
      "This API designs peptides secreted in the gut lumen for targets reachable from the digestive tract.",
  };
}

/**
 * Flags predicted-target terms pointing at distant organs, for the
 * specificity gate. A candidate predicted to act outside the gut fails
 * like any other high-risk off-target.
 */
export function flagsDistantSite(entries: string[]): string[] {
  return entries.filter((entry) =>
    DISTANT_SITE_PATTERNS.some((pattern) => pattern.test(entry))
  );
}

/**
 * Scores whether blinded predictions point at plausible gut molecular
 * targets. Used for warnings, not verdicts: enforcement requires the
 * distant-site evidence above.
 */
export function assessGutPlausibility(predictedTargets: string[]): boolean {
  if (predictedTargets.length === 0) return false;
  return predictedTargets.some((entry) =>
    GUT_MOLECULAR_PATTERNS.some((pattern) => pattern.test(entry))
  );
}
