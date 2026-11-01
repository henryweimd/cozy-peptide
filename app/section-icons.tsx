import styles from "./page.module.css";

/**
 * Shared section icons for the Design page (designer, ledger panel,
 * providers, recent runs). Stroke style matches the Bio page icons:
 * 24-grid, round caps, accent color via CSS.
 */
const ICONS = {
  pulse: (
    <>
      <path d="M3.5 12h4l2.5-6 4 12 2.5-6h4" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 4l1.7 4.8 4.8 1.7-4.8 1.7L12 17l-1.7-4.8-4.8-1.7 4.8-1.7z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  document: (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="2" />
      <path d="M9 8.5h6M9 12h6M9 15.5h4" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16" rx="2" />
      <path d="M9 4.5V3h6v1.5" />
      <path d="M9.5 13.5l2 2 3.5-4" />
    </>
  ),
  loop: (
    <>
      <ellipse cx="12" cy="12" rx="8" ry="6" />
      <path d="M12 6v12" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" className={styles.sectionIconDot} />
    </>
  ),
  microbe: (
    <>
      <circle cx="11" cy="13" r="6.5" />
      <path d="M8 12.5c1-1.5 2-1.5 3 0s2 1.5 3 0" />
      <circle cx="18.5" cy="6.5" r="1.4" className={styles.sectionIconDot} />
      <circle cx="21" cy="11.5" r="1.1" className={styles.sectionIconDot} />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 2.8v6.1c0 4.4-2.9 7.3-7 9.1-4.1-1.8-7-4.7-7-9.1V5.8z" />
      <path d="M9 11.8l2.2 2.2 4-4.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  flask: (
    <>
      <path d="M10 3.5h4M10.5 3.5V9l-5.5 9.5a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3L13.5 9V3.5" />
      <path d="M8 15h8" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.6-5.6l-1.7 1.7" />
      <path d="M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.6 5.6l1.7-1.7" />
    </>
  ),
  ledger: (
    <>
      <path d="M12 6.5C10 5 7 4.5 4 4.5v14c3 0 6 .5 8 2 2-1.5 5-2 8-2v-14c-3 0-6 .5-8 2z" />
      <path d="M12 6.5v14" />
    </>
  ),
  list: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="5" cy="6.5" r="1.2" className={styles.sectionIconDot} />
      <circle cx="5" cy="12" r="1.2" className={styles.sectionIconDot} />
      <circle cx="5" cy="17.5" r="1.2" className={styles.sectionIconDot} />
    </>
  ),
  dna: (
    <>
      <path d="M8 3.5c0 4.5 8 4.5 8 8.5s-8 4-8 8.5" />
      <path d="M16 3.5c0 4.5-8 4.5-8 8.5s8 4 8 8.5" />
      <path d="M8.6 8.5h6.8M8.6 15.5h6.8" />
    </>
  ),
  briefcase: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8" />
      <path d="M4 13h16" />
    </>
  ),
  factory: (
    <>
      <path d="M4 20.5V10l4.5-2.5v3L13 8v12.5" />
      <path d="M13 20.5h7.5v-6H13" />
      <path d="M7 7.5V4.5h2v2" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" />
      <path d="M3.5 12.5L12 17l8.5-4.5" />
      <path d="M3.5 16.5L12 21l8.5-4.5" />
    </>
  ),
};

export type SectionIconName = keyof typeof ICONS;

export default function SectionIcon({ name }: { name: SectionIconName }) {
  return (
    <svg className={styles.sectionIcon} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
