/**
 * A11y announcer for the unified observer (feature toolbox_next_timeline_
 * search). Port of the legacy panel's announce layer (handyman/assets/
 * toolbox_panel.js, feature toolbox_a11y_live): two STATIC live regions are
 * server-rendered by ToolboxShell (#live-polite / #live-assertive) and this
 * module only ever writes their textContent.
 *
 *  - polite: SSE-driven notifications are queued and collapsed into ONE
 *    debounced summary; never announced per event (that floods screen
 *    readers). The last message wins; earlier queued ones survive only as a
 *    count.
 *  - assertive: bypasses the queue. Time-sensitive only (connection loss and
 *    recovery, a stream that failed while the user waits).
 *
 * The merge logic is a pure exported function so the transpiled-suite tests
 * can cover it without a DOM.
 */

export const ANNOUNCE_DEBOUNCE_MS = 1500;

/** Collapse a queue of polite messages into one summary. The last message is
 *  the freshest full picture; earlier ones are superseded, so only their
 *  count survives. Empty queue produces an empty string (nothing to say). */
export function mergeAnnouncements(queue: string[]): string {
  if (queue.length === 0) {
    return "";
  }
  if (queue.length === 1) {
    return queue[0];
  }
  return `${queue[queue.length - 1]} (${queue.length} updates)`;
}

interface AnnouncerState {
  queue: string[];
  timer: ReturnType<typeof setTimeout> | null;
}

const state: AnnouncerState = { queue: [], timer: null };

function setRegion(id: string, text: string): void {
  if (typeof document === "undefined") {
    return; // SSR / test environment: announcing is a browser-only concern
  }
  const node = document.getElementById(id);
  if (node) {
    node.textContent = text;
  }
}

/** Module-level announcer, shared by every live component on the page (the
 *  regions are singletons by id, so the writer is one too). */
export const announce = {
  polite(message: string): void {
    state.queue.push(message);
    if (state.timer) {
      return;
    }
    state.timer = setTimeout(() => {
      const merged = mergeAnnouncements(state.queue);
      state.queue = [];
      state.timer = null;
      setRegion("live-polite", merged);
    }, ANNOUNCE_DEBOUNCE_MS);
  },
  assertive(message: string): void {
    setRegion("live-assertive", message);
  },
};
