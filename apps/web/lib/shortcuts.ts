/**
 * Global keyboard shortcut interpreter for the unified observer (feature
 * toolbox_next_timeline_search). Pure module: no imports, no DOM access, so
 * the transpiled-suite tests can drive it as data in / data out.
 *
 * Contract migrated from the legacy panel's single document-level keydown
 * listener (handyman/assets/toolbox_panel.js, feature
 * toolbox_command_palette):
 *
 *  - Cmd/Ctrl+K toggles the palette from ANYWHERE, form fields included.
 *  - While the palette is open only its own navigation acts: ArrowDown/
 *    ArrowUp always move, j/k move only OUTSIDE the palette input (they stay
 *    typeable inside it), Enter runs. Esc is native <dialog> behavior.
 *  - Everything else is inert while typing in a text field (input, textarea,
 *    select, contenteditable): the guard the acceptance calls out.
 *  - "/" jumps to the search view, "?" opens the help dialog.
 *  - "g" arms a two-key chord; a view letter within G_CHORD_MS navigates
 *    (g+f fleet, g+t timeline, g+s search). The i/a letters of the legacy
 *    panel arrive with the /intake and /ask views (feature 48): the map is
 *    data, adding them is one entry.
 *
 * The interpreter returns an action token plus the next chord-arming state;
 * ToolboxShell executes the token (navigate, open dialogs, move selection).
 */

/** Two-key chord window in ms (same value as the legacy panel). */
export const G_CHORD_MS = 900;

/** g+<letter> navigation targets. Grows with each migrated view. */
export const GO_TARGETS: Readonly<Record<string, string>> = {
  f: "/fleet",
  t: "/timeline",
  s: "/search",
};

export type KeyAction =
  | { kind: "toggle-palette" }
  | { kind: "palette-move"; delta: 1 | -1 }
  | { kind: "palette-run" }
  | { kind: "focus-search" }
  | { kind: "open-help" }
  | { kind: "navigate"; href: string }
  | { kind: "none" };

export interface KeyContext {
  /** Is the command palette dialog currently open? */
  paletteOpen: boolean;
  /** Is the event target a text-entry surface (input/textarea/select/
   *  contenteditable)? Global shortcuts are inert there. */
  inField: boolean;
  /** Is the event target the palette's own input? (j/k stay typeable) */
  inPaletteInput: boolean;
  /** Timestamp when "g" was pressed, or null when the chord is not armed. */
  gArmedAt: number | null;
  /** Current timestamp (injected for determinism in tests). */
  now: number;
}

export interface KeyDecision {
  action: KeyAction;
  /** Next chord state; the caller stores it for the following keydown. */
  gArmedAt: number | null;
  /** Whether the caller should preventDefault() on the event. */
  preventDefault: boolean;
}

/** True when the event target should swallow global single-key shortcuts. */
export function isTextEntryTarget(
  tagName: string | undefined,
  isContentEditable: boolean | undefined,
): boolean {
  const tag = (tagName ?? "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || isContentEditable === true;
}

/** Decide what a keydown means. Pure: same inputs, same decision. */
export function interpretKeydown(
  key: string,
  mods: { meta?: boolean; ctrl?: boolean },
  ctx: KeyContext,
): KeyDecision {
  // Cmd/Ctrl+K toggles from anywhere, form fields included.
  if ((mods.meta || mods.ctrl) && key.toLowerCase() === "k") {
    return { action: { kind: "toggle-palette" }, gArmedAt: null, preventDefault: true };
  }
  if (ctx.paletteOpen) {
    if (key === "ArrowDown" || (key === "j" && !ctx.inPaletteInput)) {
      return { action: { kind: "palette-move", delta: 1 }, gArmedAt: null, preventDefault: true };
    }
    if (key === "ArrowUp" || (key === "k" && !ctx.inPaletteInput)) {
      return { action: { kind: "palette-move", delta: -1 }, gArmedAt: null, preventDefault: true };
    }
    if (key === "Enter") {
      return { action: { kind: "palette-run" }, gArmedAt: null, preventDefault: true };
    }
    return { action: { kind: "none" }, gArmedAt: null, preventDefault: false };
  }
  if (ctx.inField) {
    // Global shortcuts are inert while typing: the text-field guard.
    return { action: { kind: "none" }, gArmedAt: null, preventDefault: false };
  }
  if (key === "/") {
    return { action: { kind: "focus-search" }, gArmedAt: null, preventDefault: true };
  }
  if (key === "?") {
    return { action: { kind: "open-help" }, gArmedAt: null, preventDefault: true };
  }
  if (ctx.gArmedAt !== null && ctx.now - ctx.gArmedAt < G_CHORD_MS) {
    const href = GO_TARGETS[key];
    if (href) {
      return { action: { kind: "navigate", href }, gArmedAt: null, preventDefault: true };
    }
    // Any other key breaks the chord (including a second "g", which re-arms).
    return {
      action: { kind: "none" },
      gArmedAt: key === "g" ? ctx.now : null,
      preventDefault: false,
    };
  }
  if (key === "g") {
    return { action: { kind: "none" }, gArmedAt: ctx.now, preventDefault: false };
  }
  return { action: { kind: "none" }, gArmedAt: null, preventDefault: false };
}
