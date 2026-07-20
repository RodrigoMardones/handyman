/**
 * Theme mode logic for the unified observer (feature toolbox_next_timeline_
 * search). Pure module: no imports, no DOM access, so the transpiled-suite
 * tests (tests/test_web_timeline_search.sh) can require it directly, same
 * pattern as the fleet/harness string renderers.
 *
 * Contract carried over byte-compatible from the legacy panel's ThemeToggle
 * (handyman/assets/toolbox_panel.js, feature toolbox_theme_toggle):
 *
 *  - The versioned storage key is "hw-theme:1". Explicit modes ("light" |
 *    "dark") persist under it; "system" DELETES the key, so absence means
 *    "follow the OS" and a future default change never fights a stale pref.
 *  - Rendering is pure CSS: data-theme on <html> switches the token blocks
 *    in globals.css, and with no attribute the prefers-color-scheme media
 *    query rules.
 *  - Anti-flash: a tiny inline snippet runs before first paint and applies
 *    the stored explicit mode, so a dark-mode user never sees a light flash
 *    (and vice versa). The snippet is exported from here so the layout and
 *    the test suite share one source of truth.
 */

export const THEME_KEY = "hw-theme:1";

export const THEME_MODES = ["light", "dark", "system"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

/** Map whatever localStorage returned to a valid mode. Anything that is not
 *  an explicit "light"/"dark" (missing key, junk, null) means system. */
export function normalizeStoredTheme(value: string | null | undefined): ThemeMode {
  return value === "light" || value === "dark" ? value : "system";
}

/** What applying a mode means, as data: `store` is the value to persist
 *  (null = remove the key) and `dataTheme` is the value for
 *  document.documentElement.dataset.theme (null = delete the attribute so
 *  the media query rules again). The client component executes this. */
export function themeDecision(mode: ThemeMode): {
  store: string | null;
  dataTheme: string | null;
} {
  if (mode === "system") {
    return { store: null, dataTheme: null };
  }
  return { store: mode, dataTheme: mode };
}

/**
 * Inline anti-flash snippet for the root layout: reads the stored explicit
 * mode and stamps data-theme on <html> BEFORE first paint (the script is a
 * parser-blocking first child of <body>). System mode stores nothing, so the
 * snippet does nothing and the prefers-color-scheme media query rules.
 * localStorage can throw (privacy modes); the try keeps the page rendering.
 */
export const THEME_ANTIFLASH_SNIPPET =
  '(function(){try{var t=localStorage.getItem("' +
  THEME_KEY +
  '");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();';
