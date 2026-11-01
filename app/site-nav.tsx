import Link from "next/link";
import styles from "./page.module.css";

/**
 * Site-wide top bar: identical on every whole page. The page links
 * stay fixed so future pages join by adding one entry; each page may
 * append its own section anchors plus a call to action.
 */

export type SitePage = "home" | "design" | "lbp";

const PAGES: Array<{ id: SitePage; href: string; label: string }> = [
  { id: "home", href: "/", label: "home" },
  { id: "design", href: "/design", label: "design a peptide" },
  { id: "lbp", href: "/lbp", label: "Live Biotherapeutic Product" },
];

export default function SiteNav({
  current,
  sections = [],
  action,
}: {
  current: SitePage;
  sections?: Array<{ href: string; label: string }>;
  action?: { href: string; label: string };
}): React.ReactElement {
  return (
    <header className={styles.topbar}>
      <div className={`container ${styles.masthead}`}>
        <Link
          className={styles.wordmark}
          href="/"
          aria-label="cozy-peptide home"
        >
          cozy-peptide
        </Link>
        <nav className={styles.navrow} aria-label="Site">
          {PAGES.map((page) =>
            page.id === current ? (
              <span
                key={page.id}
                className={styles.navlink}
                aria-current="page"
              >
                {page.label}
              </span>
            ) : (
              <Link key={page.id} className={styles.navlink} href={page.href}>
                {page.label}
              </Link>
            )
          )}
          {sections.map((section) => (
            <a
              key={section.href}
              className={styles.navlink}
              href={section.href}
            >
              {section.label}
            </a>
          ))}
          {action !== undefined && (
            <Link
              className={`${styles.btn} ${styles.navbtn}`}
              href={action.href}
            >
              {action.label}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
