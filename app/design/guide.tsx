"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "../page.module.css";
import SectionIcon, { type SectionIconName } from "../section-icons";

interface GuideStep {
  id: string;
  title: string;
  icon: SectionIconName;
  body: string;
  why: string;
  metaAi?: string;
  /** CSS selector to scroll to and highlight; null scrolls nowhere. */
  target: string | null;
  link?: { href: string; label: string };
}

const STEPS: GuideStep[] = [
  {
    id: "welcome",
    title: "Hi, I'm Pep — your lab guide",
    icon: "sparkle",
    body: "We start with gut diseases because they're the clearest examples — the medicine is brewed exactly where the illness lives. But any disease an engineered resident can reach is in scope: metabolism, skin, and beyond. It all comes down to one thing: a peptide that works.",
    why: "Behind every design is a patient waiting for a better option. This tour follows one design from a disease name to lab-ready DNA.",
    target: null,
  },
  {
    id: "controls",
    title: "Name the disease",
    icon: "target",
    body: "Pick a preset — or describe your own condition. Everything downstream aims at this choice: the scaffold, the chassis, even the charge. Auto means expert defaults; open any row to override.",
    why: "A precise target is the difference between a medicine and a miss.",
    target: "#design-controls",
  },
  {
    id: "status",
    title: "Watch it think",
    icon: "pulse",
    body: "Your design moves through live stages: research, drafting, proof, repair, containment, handoff. Each row lights up as it runs, with a plain-English note on what just happened.",
    why: "You see the reasoning, not just an answer — every step is checkable.",
    metaAi:
      "Meta AI inside: Muse Spark reads the literature and drafts candidates — then a symbolic compiler proves each one correct, far beyond blind screening.",
    target: "#design-status",
  },
  {
    id: "result",
    title: "Meet your molecule",
    icon: "sparkle",
    body: "Your peptide: its sequence, predicted 3D fold, and the DNA order a lab needs to build it. Scroll it — every panel below answers one question about this molecule.",
    why: "This is the candidate that could become a treatment.",
    target: "#design-result",
  },
  {
    id: "proof",
    title: "Evidence first",
    icon: "document",
    body: "The literature brief lists targets, mechanisms, and avoid-items pulled from PubMed and Europe PMC. Below it: the fold and the audit ledger that graded this design.",
    why: "Designs grounded in evidence fail less often in the lab.",
    metaAi:
      "Meta AI inside: Muse Spark condenses thousands of papers into this brief in seconds.",
    target: "#result-brief",
  },
  {
    id: "safety",
    title: "Safe by design",
    icon: "shield",
    body: "Specificity, chassis fit, and biocontainment: checks that the peptide hits its target, suits its microbe factory, and can't escape or persist where it shouldn't.",
    why: "Safety proven now prevents harm later — nothing here claims approval; everything claims scrutiny.",
    target: "#result-safety",
  },
  {
    id: "handoff",
    title: "From screen to bench",
    icon: "briefcase",
    body: "Download the DNA order files, then pick who builds it: synthesis houses for DNA, specialist CROs for engineered strains.",
    why: "A design only matters once a lab can build it — this is the bridge.",
    target: "#providers",
  },
  {
    id: "recent",
    title: "Every run, on record",
    icon: "layers",
    body: "Recent designs lists every run with its scores. Review reopens the full output — proof, structure, DNA — any time.",
    why: "Science runs on records: compare, revisit, and build on past designs.",
    target: "#recent-runs",
  },
  {
    id: "wrap",
    title: "You know the whole loop",
    icon: "ledger",
    body: "Disease name in, lab-ready DNA out — with evidence, proof, and safety at every step. Press Design my peptide when ready, or read the full story next door.",
    why: "Millions wait on better treatments. Better payloads are how they arrive.",
    target: null,
    link: { href: "/biology", label: "Read Bio & Business" },
  },
];

const NUDGE_KEY = "cozy-peptide-guide-nudged";
const TOUR_KEY = "cozy-peptide-guide-tour";
const FOLLOW_QUIET_MS = 3000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function DesignGuide({
  loading,
  ok,
}: {
  loading: boolean;
  ok: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [follow, setFollow] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [missing, setMissing] = useState(false);
  const highlightRef = useRef<Element | null>(null);
  const lastUserScroll = useRef(0);
  const skipScroll = useRef(false);
  const prevRun = useRef({ loading, ok });
  const tourConsumed = useRef(false);
  const restored = useRef(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (tourConsumed.current) return;
    const timer = window.setTimeout(() => {
      if (tourConsumed.current) return;
      tourConsumed.current = true;
      restored.current = true;
      // A saved tour means this mount is a remount (DesignerInner is
      // keyed by query string, so any param change rebuilds it): resume
      // instead of restarting.
      let saved: { step: number; follow: boolean } | null = null;
      try {
        const raw = window.sessionStorage.getItem(TOUR_KEY);
        if (raw !== null) {
          const parsed = JSON.parse(raw) as Partial<{
            step: number;
            follow: boolean;
          }>;
          if (
            typeof parsed.step === "number" &&
            Number.isInteger(parsed.step) &&
            parsed.step >= 0 &&
            parsed.step < STEPS.length
          ) {
            saved = { step: parsed.step, follow: parsed.follow === true };
          }
        }
      } catch {
        saved = null;
      }
      const wantsTour = searchParams.get("tour") === "1";
      const resumeStep = saved !== null ? saved.step : 0;
      const resumeFollow = saved !== null ? saved.follow : false;
      // Landing-page first-timers arrive with ?tour=1: open the tour
      // immediately with follow mode on, then strip the param.
      if (wantsTour || saved !== null) {
        try {
          window.localStorage.setItem(NUDGE_KEY, "1");
        } catch {
          // Private mode: nudge again next visit.
        }
        setShowNudge(false);
        setStep(wantsTour ? 0 : resumeStep);
        setFollow(wantsTour ? true : resumeFollow);
        setOpen(true);
        if (wantsTour) {
          const url = new URL(window.location.href);
          url.searchParams.delete("tour");
          window.history.replaceState(
            null,
            "",
            url.pathname + url.search + url.hash
          );
        }
        return;
      }
      try {
        setShowNudge(window.localStorage.getItem(NUDGE_KEY) === null);
      } catch {
        setShowNudge(true);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  // Persist the live tour so remounts (any query change rebuilds the
  // designer) and reloads resume it; closing the card clears it.
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (open) {
        window.sessionStorage.setItem(
          TOUR_KEY,
          JSON.stringify({ step, follow })
        );
      } else {
        window.sessionStorage.removeItem(TOUR_KEY);
      }
    } catch {
      // Private mode: no resume.
    }
  }, [open, step, follow]);

  useEffect(() => {
    const onScroll = () => {
      lastUserScroll.current = Date.now();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Scroll to the current step's target and highlight it.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      highlightRef.current?.classList.remove(styles.guideTarget);
      highlightRef.current = null;
      if (!open) {
        setMissing(false);
        return;
      }
      const { target } = STEPS[step];
      if (target === null) {
        setMissing(false);
        return;
      }
      const el = document.querySelector(target);
      if (el === null) {
        setMissing(true);
        return;
      }
      setMissing(false);
      el.classList.add(styles.guideTarget);
      highlightRef.current = el;
      if (skipScroll.current) {
        skipScroll.current = false;
        return;
      }
      el.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      highlightRef.current?.classList.remove(styles.guideTarget);
      highlightRef.current = null;
    };
  }, [open, step]);

  // Follow-my-run: track run transitions while enabled.
  useEffect(() => {
    const prev = prevRun.current;
    prevRun.current = { loading, ok };
    if (!follow || !open) return;
    const quiet = Date.now() - lastUserScroll.current > FOLLOW_QUIET_MS;
    if (loading && !prev.loading && step < 2) {
      if (!quiet) skipScroll.current = true;
      setStep(2);
    } else if (ok && !loading && (!prev.ok || prev.loading) && step < 3) {
      if (!quiet) skipScroll.current = true;
      setStep(3);
    }
  }, [follow, loading, ok, open, step]);

  const dismissNudge = (takeTour: boolean) => {
    try {
      window.localStorage.setItem(NUDGE_KEY, "1");
    } catch {
      // Private mode: nudge again next visit.
    }
    setShowNudge(false);
    if (takeTour) {
      setStep(0);
      setOpen(true);
    }
  };

  const goTo = (next: number) => {
    setFollow(false);
    setStep(Math.min(STEPS.length - 1, Math.max(0, next)));
  };

  if (!open) {
    return (
      <div className={styles.guideDock}>
        {showNudge && (
          <div className={styles.guideNudge} role="dialog" aria-label="Take the tour">
            <Image
              src="/mascot-pep.png"
              alt="Pep, the peptide guide mascot"
              width={574}
              height={768}
              className={styles.guideNudgeAvatar}
            />
            <p>
              Hi, I&apos;m <strong>Pep</strong>! New here? Take the 2-minute
              tour.
            </p>
            <div className={styles.guideNudgeActions}>
              <button type="button" onClick={() => dismissNudge(true)}>
                Take the tour
              </button>
              <button type="button" onClick={() => dismissNudge(false)}>
                Maybe later
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          className={styles.guideBubble}
          onClick={() => setOpen(true)}
          aria-label="Open the design guide"
        >
          <Image
            src="/mascot-pep.png"
            alt=""
            width={574}
            height={768}
            className={styles.guideBubbleAvatar}
          />
        </button>
      </div>
    );
  }

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className={styles.guideCard} role="dialog" aria-label="Design guide">
      <div className={styles.guideHead}>
        <Image
          src="/mascot-pep.png"
          alt="Pep, the peptide guide mascot"
          width={574}
          height={768}
          className={styles.guideAvatar}
        />
        <div>
          <p className={styles.guideTitle}>
            <SectionIcon name={current.icon} />
            {current.title}
          </p>
          <p className={styles.guideProgress}>
            Step {step + 1} of {STEPS.length}
          </p>
        </div>
        <button
          type="button"
          className={styles.guideCollapse}
          onClick={() => setOpen(false)}
          aria-label="Collapse guide"
        >
          ×
        </button>
      </div>
      <p className={styles.guideBody}>{current.body}</p>
      {missing ? (
        <p className={styles.guideMissing} role="status">
          This part appears once a design runs. Press{" "}
          <strong>Design my peptide</strong> above, then continue the tour.
        </p>
      ) : (
        <p className={styles.guideWhy}>
          <strong>Why it matters:</strong> {current.why}
        </p>
      )}
      {current.metaAi !== undefined && !missing && (
        <p className={styles.guideMeta}>{current.metaAi}</p>
      )}
      {current.link !== undefined && (
        <p className={styles.guideLink}>
          <Link href={current.link.href}>{current.link.label}</Link>
        </p>
      )}
      <div className={styles.guideFoot}>
        <button
          type="button"
          className={styles.btn}
          disabled={step === 0}
          onClick={() => goTo(step - 1)}
        >
          Back
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => {
            if (last) {
              setOpen(false);
            } else {
              goTo(step + 1);
            }
          }}
        >
          {last ? "Done" : "Next"}
        </button>
      </div>
      <label className={styles.guideFollow}>
        <input
          type="checkbox"
          checked={follow}
          onChange={(event) => setFollow(event.target.checked)}
        />
        <span>Follow my run as it designs</span>
      </label>
    </div>
  );
}
