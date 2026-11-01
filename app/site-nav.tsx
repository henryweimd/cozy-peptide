import Link from "next/link";
import styles from "./page.module.css";

/**
 * Site-wide top bar: identical on every whole page. Page links and
 * landing-page anchors stay fixed; each page supplies only its own
 * call to action, and in-page navigation lives in a subnav below.
 */

export type SitePage = "home" | "design" | "lbp";

const PAGES: Array<{ id: SitePage; href: string; label: string }> = [
  { id: "home", href: "/", label: "home" },
  { id: "lbp", href: "/lbp", label: "Live Biotherapeutic Product" },
];

/**
 * Explainer anchors on the landing page, reachable from every whole
 * page. The Design call to action stays a button, never a text link.
 */
const SECTIONS: Array<{ href: string; label: string }> = [
  { href: "/#biology", label: "The Biology" },
  { href: "/#api", label: "API Docs" },
  { href: "/#pipeline", label: "AI Pipeline" },
  { href: "/#safety", label: "Safety" },
];

export default function SiteNav({
  current,
  action,
}: {
  current: SitePage;
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
          {SECTIONS.map((section) => (
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
