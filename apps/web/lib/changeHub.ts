/**
 * Change hub for the toolBox observer runtime (feature 43).
 *
 * Mirror of toolbox_serve.ts's armWatchers/onFsEvent/broadcast closure, as a
 * pure factory: disk (source of truth) -> watcher events (debounced) ->
 * subscribers. The /events route handler subscribes each SSE stream; the
 * watchers re-arm after every broadcast so a registry change (a harness
 * registered while the app runs) becomes live without a restart - exactly
 * the serve semantics.
 *
 * Every dependency is injected (target listing, the watch primitive, the
 * debounce interval) so tests/test_web_runtime.sh can transpile this file
 * standalone and exercise arm/debounce/re-arm without fs, network, or a
 * Next build - the same discipline as the fleetHtml/harnessHtml renderers.
 */

export interface HubWatcher {
  close(): void;
}

export interface ChangeHubDeps {
  /** Watch targets, re-read on every (re)arm: [hroot, ...workspaces]. */
  listTargets: () => string[];
  /** Start one watcher; null skips silently (missing directory: the harness
   * still degrades to UNREADABLE in /api/state, same as serve). */
  watchTarget: (target: string, onEvent: () => void) => HubWatcher | null;
  /** Milliseconds of quiet before a broadcast (serve: DEBOUNCE_MS = 250). */
  debounceMs: number;
}

export interface ChangeHub {
  /** Register a listener; returns its unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** (Re)arm watchers iff the target set changed since the last arm. */
  armWatchers(): void;
  /** Listener count (observability + tests). */
  subscriberCount(): number;
  /** Close watchers and drop state (tests + shutdown). */
  close(): void;
}

export function createChangeHub(deps: ChangeHubDeps): ChangeHub {
  const subscribers = new Set<() => void>();
  let watchers: HubWatcher[] = [];
  let watchedKey = "";
  let debounce: ReturnType<typeof setTimeout> | null = null;

  function armWatchers(): void {
    const targets = deps.listTargets();
    const key = targets.join("\n");
    if (key === watchedKey && watchers.length > 0) {
      return;
    }
    for (const watcher of watchers) {
      watcher.close();
    }
    watchers = [];
    watchedKey = key;
    for (const target of targets) {
      const watcher = deps.watchTarget(target, onEvent);
      if (watcher !== null) {
        watchers.push(watcher);
      }
    }
  }

  function onEvent(): void {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(() => {
      debounce = null;
      broadcast();
    }, deps.debounceMs);
  }

  function broadcast(): void {
    for (const listener of subscribers) {
      listener();
    }
    armWatchers(); // re-arm if the registry itself changed
  }

  return {
    subscribe(listener: () => void): () => void {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    armWatchers,
    subscriberCount(): number {
      return subscribers.size;
    },
    close(): void {
      for (const watcher of watchers) {
        watcher.close();
      }
      watchers = [];
      watchedKey = "";
      if (debounce) {
        clearTimeout(debounce);
        debounce = null;
      }
      subscribers.clear();
    },
  };
}
