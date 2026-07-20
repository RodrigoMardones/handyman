"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildPaletteActions,
  type PaletteAction,
  type PaletteHarness,
  rankPaletteActions,
} from "../lib/palette";
import { interpretKeydown, isTextEntryTarget } from "../lib/shortcuts";
import { normalizeStoredTheme, THEME_KEY, THEME_MODES, type ThemeMode, themeDecision } from "../lib/theme";
import { MdDialog, type MdDocRequest } from "./MdDialog";
import styles from "./ToolboxShell.module.css";

/**
 * Cross-view chrome of the unified observer (feature
 * toolbox_next_timeline_search): the command palette, the global keyboard
 * shortcuts, the persistent theme toggle and the two static a11y live
 * regions. Mounted once per observer page (fleet, harness, timeline,
 * search) inside the server-rendered nav.
 *
 * Contracts migrated from the legacy panel (handyman/assets/
 * toolbox_panel.js):
 *
 *  - ONE document-level keydown listener owns ALL keyboard behavior,
 *    palette navigation included (no per-component keydown listeners). The
 *    pure interpreter lives in lib/shortcuts.ts; this component only
 *    executes its decisions.
 *  - Palette actions are data derived from the server-provided harness list
 *    (lib/palette.ts): view navigation, go-to-harness, and open-doc actions
 *    that funnel into the shared /api/md dialog (MdDialog).
 *  - Theme: light/dark/system persisted under hw-theme:1; system DELETES
 *    the key. The anti-flash snippet in the root layout applies the stored
 *    mode before first paint; here we only move the switch (lib/theme.ts).
 *  - Live regions: #live-polite / #live-assertive are STATIC (rendered in
 *    the SSR HTML, visually hidden); lib/announce.ts writes into them with
 *    the debounced-polite / immediate-assertive split.
 *
 * Dialogs are native <dialog> elements: showModal() traps focus and close()
 * returns focus to the opener for free; Esc closes natively.
 */

const SHORTCUTS_HELP: ReadonlyArray<readonly [string, string]> = [
  ["Cmd+K / Ctrl+K", "open the command palette"],
  ["/", "go to search and focus the query"],
  ["Down/Up or j/k", "move the palette selection (j/k outside the input)"],
  ["Enter", "run the selected palette action"],
  ["g then f / t / s", "go to fleet / timeline / search"],
  ["?", "this help"],
  ["Esc", "close dialogs"],
];

export function ToolboxShell({ harnesses }: { harnesses: PaletteHarness[] }) {
  // --- theme -----------------------------------------------------------------
  // Start on "system" for a deterministic SSR render; the real stored mode
  // is read after mount (the anti-flash snippet already painted it, so
  // there is no visual jump, only the pressed-state sync).
  const [theme, setTheme] = useState<ThemeMode>("system");
  useEffect(() => {
    try {
      setTheme(normalizeStoredTheme(localStorage.getItem(THEME_KEY)));
    } catch {
      // storage unavailable: stay on system
    }
  }, []);

  const pickTheme = useCallback((mode: ThemeMode): void => {
    const decision = themeDecision(mode);
    try {
      if (decision.store === null) {
        localStorage.removeItem(THEME_KEY);
      } else {
        localStorage.setItem(THEME_KEY, decision.store);
      }
    } catch {
      // storage unavailable: the theme still applies for this page view
    }
    if (decision.dataTheme === null) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = decision.dataTheme;
    }
    setTheme(mode);
  }, []);

  // --- shared md dialog ------------------------------------------------------
  const [mdDoc, setMdDoc] = useState<MdDocRequest | null>(null);

  // --- command palette -------------------------------------------------------
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteSel, setPaletteSel] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const paletteRef = useRef<HTMLDialogElement>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);

  const paletteResults = rankPaletteActions(buildPaletteActions(harnesses), paletteQuery);

  // The document keydown listener is attached once; this ref hands it the
  // current render's values without re-subscribing (single-listener
  // contract, same as the legacy panel).
  const uiRef = useRef<{ paletteOpen: boolean; paletteSel: number; paletteResults: PaletteAction[] }>({
    paletteOpen: false,
    paletteSel: 0,
    paletteResults: [],
  });
  uiRef.current = { paletteOpen, paletteSel, paletteResults };
  const gArmedRef = useRef<number | null>(null);

  const openPalette = useCallback((): void => {
    setPaletteQuery("");
    setPaletteSel(0);
    setPaletteOpen(true);
  }, []);

  const runAction = useCallback((index: number): void => {
    const action = uiRef.current.paletteResults[index];
    setPaletteOpen(false);
    if (!action) {
      return;
    }
    if (action.command.type === "navigate") {
      window.location.assign(action.command.href);
      return;
    }
    setMdDoc({
      root: action.command.root,
      file: action.command.file,
      title: action.command.title,
    });
  }, []);

  // Mirror palette/help state onto their native dialogs.
  useEffect(() => {
    const dialog = paletteRef.current;
    if (!dialog) {
      return;
    }
    if (paletteOpen && !dialog.open) {
      dialog.showModal();
      paletteInputRef.current?.focus();
    }
    if (!paletteOpen && dialog.open) {
      dialog.close();
    }
  }, [paletteOpen]);

  useEffect(() => {
    const dialog = helpRef.current;
    if (!dialog) {
      return;
    }
    if (helpOpen && !dialog.open) {
      dialog.showModal();
    }
    if (!helpOpen && dialog.open) {
      dialog.close();
    }
  }, [helpOpen]);

  // Keep the selected palette row visible while the selection moves.
  useEffect(() => {
    if (!paletteOpen || !paletteRef.current) {
      return;
    }
    const row = paletteRef.current.querySelector('li[aria-selected="true"]');
    row?.scrollIntoView({ block: "nearest" });
  }, [paletteOpen, paletteSel]);

  // --- the single document-level keydown listener ---------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const decision = interpretKeydown(
        event.key,
        { meta: event.metaKey, ctrl: event.ctrlKey },
        {
          paletteOpen: uiRef.current.paletteOpen,
          inField: isTextEntryTarget(target?.tagName, target?.isContentEditable),
          inPaletteInput: target?.id === "palette-input",
          gArmedAt: gArmedRef.current,
          now: Date.now(),
        },
      );
      gArmedRef.current = decision.gArmedAt;
      if (decision.preventDefault) {
        event.preventDefault();
      }
      const action = decision.action;
      if (action.kind === "toggle-palette") {
        if (uiRef.current.paletteOpen) {
          setPaletteOpen(false);
        } else {
          openPalette();
        }
      } else if (action.kind === "palette-move") {
        const last = uiRef.current.paletteResults.length - 1;
        setPaletteSel((current) =>
          last < 0 ? 0 : Math.min(Math.max(current + action.delta, 0), last),
        );
      } else if (action.kind === "palette-run") {
        runAction(uiRef.current.paletteSel);
      } else if (action.kind === "focus-search") {
        // On /search the input exists: focus it in place. Elsewhere,
        // navigate; the search input autofocuses on load.
        const input = document.getElementById("global-search");
        if (input) {
          (input as HTMLInputElement).focus();
        } else {
          window.location.assign("/search");
        }
      } else if (action.kind === "open-help") {
        setHelpOpen(true);
      } else if (action.kind === "navigate") {
        window.location.assign(action.href);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openPalette, runAction]);

  // Announce palette availability once for screen-reader users? No: the
  // regions stay silent until something actually changes (announce.polite
  // is driven by the live views; announce.assertive by failures).

  return (
    <div className={styles.shell}>
      {/* Static a11y live regions (visually hidden, present in the SSR
          HTML). lib/announce.ts writes their textContent: polite is the
          debounced change feed, assertive the time-sensitive channel. */}
      <div id="live-polite" role="status" aria-live="polite" className={styles.srOnly} />
      <div id="live-assertive" role="alert" aria-live="assertive" className={styles.srOnly} />

      <button
        type="button"
        className={styles.paletteHint}
        title="command palette (Cmd+K / Ctrl+K)"
        onClick={openPalette}
      >
        <kbd className={styles.kbd}>{"⌘"}K</kbd>
      </button>

      <div className={styles.themeToggle} role="group" aria-label="color theme">
        {THEME_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={theme === mode}
            aria-label={`${mode} theme`}
            className={styles.themeButton}
            onClick={() => pickTheme(mode)}
          >
            {mode}
          </button>
        ))}
      </div>

      <dialog ref={paletteRef} className={styles.palette} onClose={() => setPaletteOpen(false)}>
        <input
          id="palette-input"
          ref={paletteInputRef}
          type="text"
          className={styles.paletteInput}
          placeholder="type a command... (Enter runs, Esc closes)"
          aria-label="command palette"
          value={paletteQuery}
          onChange={(event) => {
            setPaletteQuery(event.target.value);
            setPaletteSel(0);
          }}
        />
        <ul className={styles.paletteList} role="listbox" aria-label="palette actions">
          {paletteResults.map((action, index) => (
            <li
              key={action.id}
              role="option"
              aria-selected={index === paletteSel}
              className={index === paletteSel ? styles.paletteRowSelected : styles.paletteRow}
              onClick={() => runAction(index)}
            >
              {action.label}
            </li>
          ))}
          {paletteResults.length === 0 ? (
            <li className={styles.paletteEmpty}>no matching action</li>
          ) : null}
        </ul>
      </dialog>

      <dialog ref={helpRef} className={styles.help} onClose={() => setHelpOpen(false)}>
        <div className={styles.helpHead}>
          <strong>Keyboard shortcuts</strong>
          <button type="button" className={styles.helpClose} onClick={() => setHelpOpen(false)}>
            close
          </button>
        </div>
        <table className={styles.helpTable}>
          <tbody>
            {SHORTCUTS_HELP.map(([keys, what]) => (
              <tr key={keys}>
                <td>
                  <kbd className={styles.kbd}>{keys}</kbd>
                </td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </dialog>

      <MdDialog doc={mdDoc} mdUrl="/api/md" onClose={() => setMdDoc(null)} />
    </div>
  );
}

// Re-export so pages can build the harness list without a second import.
export type { PaletteHarness };
