import { ToolboxShell, type PaletteHarness } from "./ToolboxShell";
import styles from "./AppNav.module.css";

export const APP_NAV_ITEMS = [
  { label: "Fleet", href: "/fleet" },
  { label: "Activity", href: "/timeline" },
  { label: "Find", href: "/search" },
  { label: "Draft", href: "/intake" },
  { label: "Ask", href: "/ask" },
] as const;

export type AppNavItem = (typeof APP_NAV_ITEMS)[number]["label"];

type AppNavProps = {
  harnesses: PaletteHarness[];
  activeItem: AppNavItem;
  currentKind: "page" | "location";
};

export function AppNav({ harnesses, activeItem, currentKind }: AppNavProps) {
  const renderLinks = () =>
    APP_NAV_ITEMS.map((item) => (
      <li key={item.href}>
        <a
          className={styles.navLink}
          href={item.href}
          aria-current={item.label === activeItem ? currentKind : undefined}
        >
          {item.label}
        </a>
      </li>
    ));

  return (
    <nav className={styles.nav} aria-label="Primary">
      <a className={styles.brand} href="/fleet">
        <span className={styles.brandName}>toolBox</span>
      </a>

      <ul className={styles.desktopLinks}>{renderLinks()}</ul>

      <details className={styles.mobileMenu}>
        <summary>Menu</summary>
        <ul className={styles.mobileLinks}>{renderLinks()}</ul>
      </details>

      <ToolboxShell harnesses={harnesses} />
    </nav>
  );
}