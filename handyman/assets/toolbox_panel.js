/* Handyman toolBox observer panel — React 18 components, no build step.
 * React + ReactDOM + htm + MiniSearch arrive as UMD globals from /vendor/*
 * (served out of node_modules; no external assets). htm gives JSX-like
 * templates without transpilation. React escapes all interpolated text, so
 * harness-file content never becomes markup (same contract as the legacy
 * workstation's textContent-only rule). */
"use strict";

const html = htm.bind(React.createElement);
const { useState, useEffect, useRef, useCallback } = React;

function fmtStatus(s) {
  return String(s || "").replace(/_/g, " ");
}

/* Formatting layer (port of the legacy workstation fmt.* idea): relative
 * dates for display, absolute value preserved in the title attribute. */
const fmt = {
  parse(value) {
    if (!value) return null;
    const raw = String(value);
    // Date-only stamps ("YYYY-MM-DD") mean local midnight, not UTC.
    const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
    return Number.isNaN(t) ? null : t;
  },
  rel(value, now = Date.now()) {
    const t = fmt.parse(value);
    if (t === null || t > now) return String(value || "?");
    const minutes = Math.floor((now - t) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 60) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 24) return `${months}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  },
};

function RelDate({ value, className }) {
  if (!value) return "none";
  return html`<span class=${className} title=${value}>${fmt.rel(value)}</span>`;
}

/* A11y announcer (Plan D). Writes into the two static live regions the
 * server renders before #root (the panel's ONLY live surfaces). SSE-driven
 * changes are queued and collapsed into one debounced polite summary —
 * never announced per event, which floods screen readers. The assertive
 * channel bypasses the queue (time-sensitive: connection loss/recovery) and
 * is the same surface the future LLM relay error path will reuse
 * (docs/analisis-peticiones-llm-toolbox.md §3). */
const ANNOUNCE_DEBOUNCE_MS = 1500;
const announce = (() => {
  let queue = [];
  let timer = null;
  const set = (id, text) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  };
  return {
    polite(message) {
      queue.push(message);
      if (timer) return;
      timer = setTimeout(() => {
        // The last summary is the freshest full picture; earlier queued
        // ones are superseded, so only their count survives.
        const merged =
          queue.length === 1 ? queue[0] : `${queue[queue.length - 1]} (${queue.length} updates)`;
        queue = [];
        timer = null;
        set("live-polite", merged);
      }, ANNOUNCE_DEBOUNCE_MS);
    },
    assertive(message) {
      set("live-assertive", message);
    },
  };
})();

/* Human summary of what an SSE refresh actually changed: feature statuses
 * diffed per harness by name ("2 feature(s) updated in handyman"). Anything
 * outside the feature lists (progress, backlog, docs) falls back to a
 * generic message rather than silence — the event did signify a change. */
function diffSummary(prev, next) {
  if (!prev || !next) return "fleet state updated";
  const parts = [];
  const prevByName = new Map(prev.harnesses.map((h) => [h.project_name, h]));
  for (const harness of next.harnesses) {
    const old = prevByName.get(harness.project_name);
    if (!old) {
      parts.push(`harness ${harness.project_name} registered`);
      continue;
    }
    const oldStatus = new Map((old.features || []).map((f) => [f.name, f.status]));
    const newStatus = new Map((harness.features || []).map((f) => [f.name, f.status]));
    let changed = 0;
    for (const name of new Set([...oldStatus.keys(), ...newStatus.keys()])) {
      if (oldStatus.get(name) !== newStatus.get(name)) changed += 1;
    }
    if (changed) parts.push(`${changed} feature(s) updated in ${harness.project_name}`);
  }
  return parts.length ? parts.join("; ") : "fleet state updated";
}

function SessionLine({ session }) {
  const s = session;
  if (!s || !s.feature || s.feature === "none" || s.status === "idle") return "idle";
  const updated = s.updated ? html`<${RelDate} value=${s.updated} />` : "?";
  return html`${s.feature} (role ${s.role || "?"}, updated ${updated})`;
}

function versionLine(v) {
  if (!v) return "?";
  const installed = v.installed || "unsealed";
  if (v.behind === true) return `${installed} (behind ${v.current})`;
  if (v.behind === false) return `${installed} (up to date)`;
  return `${installed} (skill version unknown)`;
}

function Badge({ kind, children }) {
  return html`<span class="badge badge-${kind}">${children}</span>`;
}

function Empty({ children }) {
  return html`<p class="empty">${children}</p>`;
}

/* Theme control layer (Plan B, legacy §6.4 contract). Rendering is pure CSS:
 * data-theme on <html> switches the token blocks, and with no attribute the
 * prefers-color-scheme media query rules. This layer only moves the switch:
 * explicit modes persist in the versioned key; system mode DELETES the key
 * (absence means "follow the OS", so new defaults never fight stale prefs). */
const THEME_KEY = "hw-theme:1";
const THEME_MODES = ["light", "dark", "system"];

function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme(mode) {
  try {
    if (mode === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    // storage unavailable: the theme still applies for this page view
  }
  if (mode === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
}

function ThemeToggle() {
  const [mode, setMode] = useState(storedTheme);
  useEffect(() => {
    // System mode only: keep the page live on OS scheme changes by
    // re-asserting that no explicit override lingers on <html> (the media
    // query then repaints by itself). Explicit light/dark never attach the
    // listener — the effect cleanup removes it on every mode switch.
    if (mode !== "system") return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      delete document.documentElement.dataset.theme;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);
  const pick = (next) => {
    applyTheme(next);
    setMode(next);
  };
  return html`<div class="theme-toggle" role="group" aria-label="color theme">
    ${THEME_MODES.map(
      (m) => html`<button type="button" key=${m} aria-pressed=${mode === m}
        aria-label="${m} theme" onClick=${() => pick(m)}>${m}</button>`,
    )}
  </div>`;
}

function useHashRoute() {
  const [hash, setHash] = useState(location.hash || "#/fleet");
  useEffect(() => {
    const onChange = () => setHash(location.hash || "#/fleet");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function FleetView({ state }) {
  if (!state.harnesses.length)
    return html`<${Empty}>no harnesses registered — register one with: node dist/toolbox.js register PATH<//>`;
  return html`
    <h2>Fleet</h2>
    <table>
      <thead><tr>
        ${["Project", "Version", "Pending", "In progress", "Done", "Blocked",
           "Session", "Last closure", "Signals"].map(
          (label) => html`<th scope="col" key=${label}>${label}</th>`,
        )}
      </tr></thead>
      <tbody>
        ${state.harnesses.map((harness) => html`<${FleetRow} key=${harness.project_root} harness=${harness} />`)}
      </tbody>
    </table>`;
}

function FleetRow({ harness }) {
  const name = html`<a href="#/harness/${encodeURIComponent(harness.project_name)}"
    title=${harness.project_root}>${harness.project_name}</a>`;
  if (harness.error) {
    return html`<tr><td>${name}</td>
      <td class="error" colSpan="8">ERROR: ${harness.error}</td></tr>`;
  }
  const counts = harness.status_counts;
  return html`<tr>
    <td>${name}</td>
    <td>${versionLine(harness.version)}</td>
    ${["pending", "in_progress", "done", "blocked"].map(
      (s) => html`<td class="num" key=${s}>${counts[s] || 0}</td>`,
    )}
    <td><${SessionLine} session=${harness.session} /></td>
    <td><${RelDate} value=${harness.last_closure} /></td>
    <td>${harness.signals.length
      ? html`<${Badge} kind="warn">${harness.signals.length} signal(s)<//>`
      : html`<${Badge} kind="ok">OK<//>`}</td>
  </tr>`;
}

function FeatureCard({ feature }) {
  return html`<div class="card">
    <div class="fid">#${feature.id === null ? "?" : feature.id}${feature.sprint ? ` · ${feature.sprint}` : ""}</div>
    <div>${feature.name}</div>
    ${feature.title && feature.title !== feature.name && html`<div class="fid">${feature.title}</div>`}
    ${feature.blocked_reason && html`<div class="reason">${feature.blocked_reason}</div>`}
  </div>`;
}

function KanbanColumn({ status, features }) {
  const inCol = features.filter((f) => f.status === status);
  const shown = status === "done" ? inCol.slice(-8).reverse() : inCol;
  return html`<div class="col">
    <h3>${fmtStatus(status)} (${inCol.length})</h3>
    ${shown.map((f) => html`<${FeatureCard} key=${f.name} feature=${f} />`)}
    ${inCol.length > shown.length && html`<p class="empty">+${inCol.length - shown.length} older</p>`}
  </div>`;
}

/* Zero-filled daily series over the last N days (UTC dates, matching the
 * "YYYY-MM-DD" keys metrics.collect() derives from history.md). */
function lastDaysSeries(throughput, days) {
  const series = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * 86400000).toISOString().slice(0, 10);
    series.push(throughput[date] || 0);
  }
  return series;
}

/* Hand-rolled sparkline: a single SVG polyline, no chart library. Theme-aware
 * through currentColor (the .sparkline class sets color: var(--hw-accent)). */
function Sparkline({ throughput, days }) {
  const series = lastDaysSeries(throughput, days);
  const total = series.reduce((sum, v) => sum + v, 0);
  const w = 120;
  const h = 28;
  const pad = 2;
  const max = Math.max(1, ...series);
  const step = (w - 2 * pad) / (series.length - 1);
  const points = series
    .map((v, i) => `${(pad + i * step).toFixed(1)},${(h - pad - (v / max) * (h - 2 * pad)).toFixed(1)}`)
    .join(" ");
  return html`<svg class="sparkline" width=${w} height=${h} viewBox="0 0 ${w} ${h}"
    role="img" aria-label="throughput sparkline: ${total} closure(s) in the last ${days} days">
    <polyline points=${points} fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>`;
}

function Kpi({ label, value }) {
  return html`<div class="kpi">
    <div class="kpi-value">${value}</div>
    <div class="kpi-label">${label}</div>
  </div>`;
}

/* KPI strip over the per-harness metrics block (same collect() the metrics
 * CLI runs, precomputed server-side); null means the harness was unreadable. */
function MetricsStrip({ metrics }) {
  if (!metrics)
    return html`<${Empty}>metrics unavailable — the harness state could not be read<//>`;
  const rate = metrics.review_verdicts.approval_rate;
  const coverage = metrics.coverage;
  const days = 14;
  const recent = lastDaysSeries(metrics.throughput, days).reduce((sum, v) => sum + v, 0);
  return html`<div class="kpis">
    <${Kpi} label="approval rate" value=${rate === null ? "n/a" : `${Math.round(rate * 100)}%`} />
    <${Kpi} label="report coverage" value="${coverage.with_reports}/${coverage.done} done" />
    <${Kpi} label="closures (${days}d)" value=${recent} />
    <div class="kpi">
      <${Sparkline} throughput=${metrics.throughput} days=${days} />
      <div class="kpi-label">throughput (${days}d)</div>
    </div>
  </div>`;
}

// Domain docs exposed as quick-view buttons; a missing file stays listed and
// the dialog shows the fetch error text (the /api/md 404 path).
const DOC_FILES = ["business", "architecture", "conventions", "verification"];

function HarnessView({ state, name, onOpenMd }) {
  const harness = state.harnesses.find((h) => h.project_name === name);
  if (!harness) return html`<h2>${name}</h2><${Empty}>unknown harness: ${name}<//>`;
  if (harness.error) return html`<h2>${name}</h2><p class="error">ERROR: ${harness.error}</p>`;
  const mdLinks = [
    ["current.md", "current"],
    ["history.md", "history"],
    ["CHECKPOINTS.md", "checkpoints"],
    ["workspace MOC", "index"],
  ];
  return html`
    <h2>${name}</h2>
    <ul class="meta-list">
      <li>root: ${harness.project_root}</li>
      <li>version: ${versionLine(harness.version)}</li>
      <li>session: <${SessionLine} session=${harness.session} /></li>
      <li>last closure: <${RelDate} value=${harness.last_closure} /></li>
    </ul>
    <${MetricsStrip} metrics=${harness.metrics} />
    <div class="linkrow">
      ${harness.signals.length
        ? harness.signals.map(
            (s) => html`<${Badge} key=${s.signal} kind="warn">${s.signal}: ${s.detail}<//>`,
          )
        : html`<${Badge} kind="ok">OK (no signals)<//>`}
    </div>
    <div class="linkrow">
      ${mdLinks.map(
        ([label, file]) => html`<button type="button" key=${file}
          onClick=${() => onOpenMd(harness.project_root, file, label)}>${label}</button>`,
      )}
    </div>
    <h2>Docs</h2>
    <div class="linkrow">
      ${DOC_FILES.map(
        (doc) => html`<button type="button" key=${doc}
          onClick=${() => onOpenMd(harness.project_root, `docs:${doc}.md`, `docs/${doc}.md`)}>${doc}</button>`,
      )}
    </div>
    <h2>Queue</h2>
    ${harness.features.length
      ? html`<div class="cards">
          ${["pending", "in_progress", "done", "blocked"].map(
            (status) => html`<${KanbanColumn} key=${status} status=${status}
              features=${harness.features} />`,
          )}
        </div>`
      : html`<${Empty}>no features in feature_list.json — add one with: scripts/feature.py add --name NAME<//>`}
    <h2>Knowledge graph</h2>
    ${harness.has_graph
      ? html`<iframe class="graph" title="graphify knowledge graph for ${name}"
          src="/graph/${encodeURIComponent(name)}/graph.html"></iframe>`
      : html`<${Empty}>no graphify export yet (run /graphify in the project to build one)<//>`}`;
}

function TimelineView({ state }) {
  if (!state.timeline.length)
    return html`<h2>Timeline</h2><${Empty}>no dated closures yet — close a feature (scripts/feature.py done) to record the first<//>`;
  return html`
    <h2>Timeline</h2>
    <ul class="meta-list">
      ${state.timeline.map(
        (t) => html`<li key=${`${t.project_root}${t.feature}${t.date}`}>
          <${RelDate} className="tl-date" value=${t.date} />
          ${t.project_name} · ${t.feature}${" "}
          ${t.feature_id !== null ? `(feature ${t.feature_id})` : "(heartbeat)"}
        </li>`,
      )}
    </ul>`;
}

function SearchView({ indexVersion, onOpenMd }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState([]);
  const [ready, setReady] = useState(false);
  const miniRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (typeof MiniSearch === "undefined") return undefined;
    fetch("/api/corpus")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const mini = new MiniSearch({
          fields: ["title", "text"],
          storeFields: ["project", "kind", "title", "ref"],
          searchOptions: { boost: { title: 2 }, prefix: true, fuzzy: 0.1 },
        });
        mini.addAll(data.documents);
        miniRef.current = mini;
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      cancelled = true;
    };
  }, [indexVersion]);

  useEffect(() => {
    if (!miniRef.current || !query) {
      setHits([]);
      return;
    }
    setHits(miniRef.current.search(query).slice(0, 30));
  }, [query, ready]);

  return html`
    <h2>Search</h2>
    <div class="search-row">
      <input id="global-search" type="search" autoFocus
        placeholder="BM25 across features, backlog, progress and docs…"
        value=${query} onInput=${(e) => setQuery(e.target.value)} />
    </div>
    ${!ready && html`<${Empty}>building index…<//>`}
    ${ready && query && !hits.length &&
    html`<${Empty}>no matches — try a shorter term (prefix and fuzzy matching are on)<//>`}
    ${hits.map((hit) => html`<${SearchHit} key=${hit.id} hit=${hit} onOpenMd=${onOpenMd} />`)}`;
}

function SearchHit({ hit, onOpenMd }) {
  const root = String(hit.id).split("::")[0];
  return html`<div class="result">
    <div>${hit.title}</div>
    <div class="where">${hit.project} · ${hit.kind} · score ${hit.score.toFixed(2)}</div>
    ${hit.kind !== "feature" &&
    html`<div class="linkrow">
      <button type="button" onClick=${() => onOpenMd(root, hit.ref, hit.title)}>open</button>
    </div>`}
  </div>`;
}

/* Intake view (Plan A of docs/analisis-peticiones-llm-toolbox.md §5): the
 * observer stays read-only. The panel renders an editable draft streamed
 * over the sole non-GET route (POST /api/draft) and offers a "copy" button —
 * the human pastes it into feature-request.md. EventSource cannot POST, so
 * the panel reads the fetch body as a stream and parses the SSE frames
 * itself, mirroring the server's `sse()` writer (event:/data: lines split on
 * a blank line). Provider failures arrive as `event: error` and land in the
 * assertive live region like any other time-sensitive signal. */

/** Parse one SSE frame (already split out) into {event, data}. */
function parseSseFrame(frame) {
  let event = "message";
  let data = "";
  // SSE lines are CRLF or LF terminated; trim a trailing CR per line.
  for (const line of frame.split("\n")) {
    const clean = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (clean.startsWith("event:")) event = clean.slice(6).trim();
    else if (clean.startsWith("data:")) data += clean.slice(5).trim();
  }
  let parsed = null;
  if (data) {
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = { raw: data };
    }
  }
  return { event, data: parsed };
}

/**
 * POST /api/draft and relay its SSE stream to the handlers. Validation
 * failures (unregistered root, bad body, unknown provider) are plain JSON
 * 400s, not SSE — they surface as onError. The optional AbortController
 * signal lets the view cancel an in-flight draft. */
async function streamDraftSse(body, handlers, signal) {
  let res;
  try {
    res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal && signal.aborted) return;
    handlers.onError({ code: "network_error", message: "network error" });
    return;
  }
  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err && err.error) message = String(err.error);
    } catch {
      // keep the status text
    }
    handlers.onError({ code: "http_error", message });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatch = (frame) => {
    if (!frame.trim()) return;
    const { event, data } = parseSseFrame(frame);
    if (event === "delta" && data && typeof data.text === "string") {
      handlers.onDelta(data.text);
    } else if (event === "result") {
      handlers.onResult(data || {});
    } else if (event === "error") {
      handlers.onError(data || { code: "provider_error" });
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    // Frames are separated by a blank line; \n\n is the canonical separator.
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      dispatch(frame);
    }
  }
  // Flush a trailing frame that had no closing blank line.
  dispatch(buffer);
  if (handlers.onDone) handlers.onDone();
}

/** Copy text to the clipboard with a legacy fallback. navigator.clipboard is
 * absent on non-secure contexts or when permission is denied; the fallback
 * hides a textarea and uses execCommand("copy"), which still works on every
 * localhost observer. Returns true on success. */
async function copyToClipboard(text) {
  const value = String(text || "");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** POST /api/intake: submit the reviewed draft (plus the tagged files as
 * references) to the target harness, persisting it as feature-request.md —
 * the intake artifact the next leader session consumes. Returns the parsed
 * JSON body (always, even on HTTP error) plus an `ok` flag derived from
 * res.ok so the caller can render a single success/failure notification.
 * Unlike the draft relay this is a plain JSON round trip (no SSE). */
async function submitIntake(body) {
  let res;
  try {
    res = await fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 0, error: "network error" };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: !!res.ok && !!data.ok, status: res.status, ...data };
}

function IntakeView({ state }) {
  const harnesses = (state && state.harnesses) || [];
  const [root, setRoot] = useState(harnesses[0] ? harnesses[0].project_root : "");
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState("");
  const [provLoaded, setProvLoaded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [draftMd, setDraftMd] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | streaming | done | error
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);
  // File-tag picker (intake enhancements): the workspace file list for the
  // selected harness, a search filter, the selected tag paths, and the
  // direct-submit state machine (idle | submitting | submitted | submit-error).
  const [tagFiles, setTagFiles] = useState([]);
  const [tagQuery, setTagQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [submitPhase, setSubmitPhase] = useState("idle");
  const [submitMsg, setSubmitMsg] = useState("");

  // Provider availability once on mount; only available adapters are
  // selectable (a dead adapter would only yield a provider_error SSE).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = (data.providers || []).filter((p) => p.available);
        setProviders(list);
        setProvLoaded(true);
        if (list.length && !list.some((p) => p.id === provider)) {
          setProvider(list[0].id);
        }
      })
      .catch(() => {
        setProvLoaded(true);
        setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the taggable workspace files for the selected harness whenever it
  // changes. Only a REGISTERED root resolves; selection is reset so stale
  // paths from another harness never travel into a draft or submission.
  useEffect(() => {
    if (!root) {
      setTagFiles([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/files?root=${encodeURIComponent(root)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setTagFiles(Array.isArray(data.files) ? data.files : []);
      })
      .catch(() => {
        if (!cancelled) setTagFiles([]);
      });
    setSelectedTags([]);
    return () => {
      cancelled = true;
    };
  }, [root]);

  // Keep the selected harness valid as the fleet changes over SSE.
  useEffect(() => {
    if (harnesses.length && !harnesses.some((h) => h.project_root === root)) {
      setRoot(harnesses[0].project_root);
    }
  }, [harnesses, root]);

  // Cancel any in-flight draft when the view unmounts (navigating away).
  useEffect(
    () => () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    },
    [],
  );

  const startDraft = () => {
    if (phase === "streaming") return;
    if (!root || !provider || !prompt.trim()) return;
    setDraftMd("");
    setResult(null);
    setErrorMsg("");
    setCopied(false);
    setPhase("streaming");
    const controller = new AbortController();
    abortRef.current = controller;
    streamDraftSse(
      { root, prompt, provider, files: selectedTags },
      {
        onDelta: (text) => setDraftMd((prev) => prev + text),
        onResult: (event) => {
          setResult(event);
          // The final event carries the canonical draft; prefer it so the
          // editable source matches the parsed archetype/dedup exactly.
          if (event && typeof event.draft_md === "string" && event.draft_md) {
            setDraftMd(event.draft_md);
          }
          setPhase("done");
        },
        onError: (err) => {
          const message = (err && (err.message || err.code)) || "provider error";
          setErrorMsg(String(message));
          setPhase("error");
          // Time-sensitive: the user is waiting on a draft that will not come.
          announce.assertive(`draft failed: ${message}`);
        },
        onDone: () => {
          if (abortRef.current === controller) abortRef.current = null;
        },
      },
      controller.signal,
    );
  };

  const cancelDraft = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (phase === "streaming") setPhase("idle");
  };

  // Toggle a file tag (multi-select). The selected paths are sent with the
  // draft (as prompt context) and the submission (as references).
  const toggleTag = (path) => {
    setSelectedTags((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };
  const removeTag = (path) => setSelectedTags((prev) => prev.filter((p) => p !== path));
  const filteredTags = tagFiles.filter((f) =>
    f.path.toLowerCase().includes(tagQuery.toLowerCase()),
  );

  const doCopy = async () => {
    const ok = await copyToClipboard(draftMd);
    setCopied(ok);
    if (ok) announce.polite("draft copied to clipboard");
    else announce.assertive("copy failed — select and copy the text manually");
  };

  // Submit the reviewed draft directly to the target harness (POST /api/intake),
  // persisting it as feature-request.md — the intake artifact the next leader
  // session consumes. Requires a registered harness and a non-empty draft.
  const doSubmit = async () => {
    if (!root || !draftMd.trim() || submitPhase === "submitting") return;
    setSubmitPhase("submitting");
    setSubmitMsg("");
    const outcome = await submitIntake({ root, draft_md: draftMd, files: selectedTags });
    if (outcome.ok) {
      setSubmitPhase("submitted");
      setSubmitMsg(`submitted to ${root} — feature-request.md updated`);
      announce.polite("intake submitted to harness");
    } else {
      setSubmitPhase("submit-error");
      const reason = outcome.error || `HTTP ${outcome.status}`;
      setSubmitMsg(`submission failed: ${reason}`);
      // Time-sensitive: the user just tried to deliver the intake.
      announce.assertive(`submission failed: ${reason}`);
    }
  };

  if (!harnesses.length) {
    return html`<${Empty}>no harnesses registered — the intake needs a target harness<//>`;
  }
  const busy = phase === "streaming";
  const submitting = submitPhase === "submitting";
  const canDraft = !!root && !!provider && !!prompt.trim() && !busy;
  const canSubmit = !!root && !!draftMd.trim() && !busy && !submitting;
  // Placeholder while providers load, or when none are available.
  const providerOptions = providers.length
    ? providers
    : [{ id: provider || "—", available: false, model: null }];
  return html`
    <h2>Intake</h2>
    <p class="muted">Draft a feature request from a short prompt. Tag workspace
      files to add them as context, edit the streamed draft, then copy it or
      submit it directly to the harness as feature-request.md.</p>
    <div class="intake-form">
      <label class="field">
        <span>Harness</span>
        <select value=${root} onChange=${(e) => setRoot(e.target.value)}>
          ${harnesses.map(
            (h) =>
              html`<option key=${h.project_root} value=${h.project_root}>${h.project_name}</option>`,
          )}
        </select>
      </label>
      <label class="field">
        <span>Provider</span>
        <select value=${provider} onChange=${(e) => setProvider(e.target.value)}>
          ${providerOptions.map(
            (p) => html`<option key=${p.id} value=${p.id}>${p.id}${p.model ? ` (${p.model})` : ""}</option>`,
          )}
        </select>
      </label>
      <label class="field intake-prompt">
        <span>Prompt</span>
        <textarea rows="4"
          placeholder="e.g. add a recent-commands view to the toolbox panel"
          value=${prompt} onInput=${(e) => setPrompt(e.target.value)}></textarea>
      </label>
      <div class="field">
        <span>Context files</span>
        <div class="tag-picker">
          <div class="tag-chips">
            ${selectedTags.length === 0 && html`<span class="muted">no files tagged</span>`}
            ${selectedTags.map(
              (p) => html`<span class="tag-chip" key=${p}>
                ${p}
                <button type="button" class="tag-x" aria-label=${`remove ${p}`}
                  onClick=${() => removeTag(p)}>✕</button>
              </span>`,
            )}
          </div>
          <div class="tag-search">
            <input type="search" placeholder=${tagsOpen ? "filter files…" : "add files…"}
              value=${tagQuery} onFocus=${() => setTagsOpen(true)}
              onInput=${(e) => {
                setTagQuery(e.target.value);
                setTagsOpen(true);
              }} />
            ${tagsOpen && tagFiles.length > 0 &&
            html`<ul class="tag-list">
              ${filteredTags.slice(0, 200).map(
                (f) => html`<li key=${f.path}>
                  <label>
                    <input type="checkbox" checked=${selectedTags.includes(f.path)}
                      onChange=${() => toggleTag(f.path)} />
                    <span class="tag-path">${f.path}</span>
                    <span class="tag-size">${f.size} B</span>
                  </label>
                </li>`,
              )}
              ${filteredTags.length === 0 && html`<li class="muted">no files match “${tagQuery}”</li>`}
            </ul>`}
            ${tagsOpen && tagFiles.length === 0 &&
            html`<p class="muted tag-empty">no taggable files found in this workspace</p>`}
          </div>
          ${tagsOpen &&
          html`<button type="button" class="tag-done" onClick=${() => setTagsOpen(false)}>
            done (${selectedTags.length})
          </button>`}
        </div>
      </div>
      <div class="linkrow">
        ${busy
          ? html`<button type="button" onClick=${cancelDraft}>cancel</button>`
          : html`<button type="button" disabled=${!canDraft} onClick=${startDraft}>Draft</button>`}
      </div>
    </div>
    ${provLoaded && !providers.length &&
    html`<p class="error" role="note">no LLM providers available — set an API key (Z_AI_API_KEY / ANTHROPIC_API_KEY) or run Ollama, then reload.</p>`}
    ${phase === "error" && html`<p class="error" role="note">draft error: ${errorMsg}</p>`}
    ${submitPhase === "submitted" &&
    html`<p class="ok" role="status">${submitMsg}</p>`}
    ${submitPhase === "submit-error" &&
    html`<p class="error" role="alert">${submitMsg}</p>`}
    ${(draftMd || busy) &&
    html`<section class="intake-draft">
      <div class="linkrow">
        <strong>Draft</strong>
        ${result && result.archetype && html`<span class="where">archetype: ${result.archetype}</span>`}
        <button type="button" disabled=${!draftMd} onClick=${doCopy}>${copied ? "copied!" : "copy"}</button>
        ${submitting
          ? html`<button type="button" disabled>submitting…</button>`
          : html`<button type="button" disabled=${!canSubmit} onClick=${doSubmit}>Submit</button>`}
      </div>
      <textarea class="intake-edit" rows="14" readOnly=${busy}
        value=${draftMd} onInput=${(e) => {
          setDraftMd(e.target.value);
          if (submitPhase !== "idle") setSubmitPhase("idle");
        }}
        placeholder=${busy ? "streaming…" : ""}></textarea>
      <details>
        <summary>preview (sanitized)</summary>
        <div class="md-body" dangerouslySetInnerHTML=${{ __html: renderMd(draftMd) }}></div>
      </details>
      ${result &&
      Array.isArray(result.possible_duplicates) &&
      result.possible_duplicates.length > 0 &&
      html`<div class="where">possible duplicates: ${result.possible_duplicates
        .map((d) => d.name)
        .join(", ")}</div>`}
    </section>`}`;
}

/* Safe markdown render (Plan C). Agent-produced markdown is untrusted even
 * though it is local: marked turns it into HTML, then DOMPurify strips
 * anything executable before it ever reaches dangerouslySetInnerHTML. A
 * missing vendor never crashes the viewer — it falls back to escaped text
 * with <br> line breaks (readable, just not pretty). Search excerpts bypass
 * this entirely (SearchHit keeps React-escaped textContent). */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMd(text) {
  if (!text) return "";
  // Graceful degrade: if a vendor script failed to load, never inject raw
  // markup — show the text escaped with preserved line breaks instead.
  if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
    return escapeHtml(text).replace(/\r?\n/g, "<br>");
  }
  const raw = marked.parse(String(text), { breaks: true, gfm: true });
  return DOMPurify.sanitize(raw, {
    FORBID_TAGS: [
      "script", "style", "iframe", "frame", "form", "input", "textarea",
      "button", "select", "object", "embed", "link", "meta", "base",
    ],
    FORBID_ATTR: [
      "onerror", "onclick", "onload", "onmouseover", "onmouseout", "onsubmit",
      "onfocus", "onblur", "onchange", "style", "formaction", "srcset",
    ],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?!(?:javascript|data|vbscript):)/i,
    KEEP_CONTENT: false,
  });
}

function MdDialog({ doc, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (doc && ref.current && !ref.current.open) ref.current.showModal();
    if (!doc && ref.current && ref.current.open) ref.current.close();
  }, [doc]);
  const rendered = renderMd(doc ? doc.text : "");
  return html`<dialog ref=${ref} onClose=${onClose}>
    <div class="linkrow"><strong>${doc ? doc.label : ""}</strong>
      <button type="button" onClick=${onClose}>close</button></div>
    <div class="md-body" dangerouslySetInnerHTML=${{ __html: rendered }}></div>
  </dialog>`;
}

/* Command palette (Plan E). Actions are derived from live state; MiniSearch
 * (the same UMD already loaded for search) ranks them, with a plain substring
 * filter as the no-vendor fallback. The palette is a native <dialog>:
 * showModal() traps focus and close() returns focus to the opener for free.
 * ALL keyboard behavior — palette navigation included — lives in the single
 * document-level keydown listener inside App (feature contract: no
 * per-component keydown listeners). */
const VIEW_ACTIONS = [
  { id: "view_fleet", label: "go to fleet", hash: "#/fleet", key: "f" },
  { id: "view_timeline", label: "go to timeline", hash: "#/timeline", key: "t" },
  { id: "view_search", label: "go to search", hash: "#/search", key: "s" },
  { id: "view_intake", label: "go to intake", hash: "#/intake", key: "i" },
];
const MD_LINKS = [
  ["current.md", "current"],
  ["history.md", "history"],
  ["CHECKPOINTS.md", "checkpoints"],
  ["workspace MOC", "index"],
];

function buildActions(state, openMd) {
  const actions = VIEW_ACTIONS.map((v) => ({
    id: v.id,
    label: v.label,
    keywords: "view navigate",
    run: () => {
      location.hash = v.hash;
    },
  }));
  for (const harness of state ? state.harnesses : []) {
    const name = harness.project_name;
    actions.push({
      id: `go_${name}`,
      label: `go to project ${name}`,
      keywords: "harness project",
      run: () => {
        location.hash = `#/harness/${encodeURIComponent(name)}`;
      },
    });
    if (harness.error) continue;
    for (const [label, file] of MD_LINKS) {
      actions.push({
        id: `md_${name}_${file}`,
        label: `open ${label} — ${name}`,
        keywords: "markdown quick view",
        run: () => openMd(harness.project_root, file, label),
      });
    }
    for (const doc of DOC_FILES) {
      actions.push({
        id: `doc_${name}_${doc}`,
        label: `open docs/${doc}.md — ${name}`,
        keywords: "docs markdown",
        run: () => openMd(harness.project_root, `docs:${doc}.md`, `docs/${doc}.md`),
      });
    }
  }
  return actions;
}

function rankActions(actions, query) {
  if (!query) return actions.slice(0, 12);
  // Rebuilt per keystroke on purpose: tens of actions, cheaper than keeping
  // a stale index in sync with live SSE state.
  if (typeof MiniSearch !== "undefined") {
    const mini = new MiniSearch({ fields: ["label", "keywords"] });
    mini.addAll(actions.map((a, i) => ({ id: i, label: a.label, keywords: a.keywords })));
    const hits = mini.search(query, { prefix: true, fuzzy: 0.2 });
    if (hits.length) return hits.slice(0, 12).map((hit) => actions[hit.id]);
  }
  const q = query.toLowerCase();
  return actions.filter((a) => a.label.toLowerCase().includes(q)).slice(0, 12);
}

function CommandPalette({ open, query, selection, results, onQuery, onPick, onClose }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => {
    if (open && ref.current && !ref.current.open) {
      ref.current.showModal();
      if (inputRef.current) inputRef.current.focus();
    }
    if (!open && ref.current && ref.current.open) ref.current.close();
  }, [open]);
  useEffect(() => {
    // Keep the selected row visible while j/k/arrows move it. block:nearest
    // scrolls instantly (no smooth behavior), so no reduced-motion concern.
    if (!open || !ref.current) return;
    const row = ref.current.querySelector('li[aria-selected="true"]');
    if (row) row.scrollIntoView({ block: "nearest" });
  }, [open, selection]);
  return html`<dialog class="palette" ref=${ref} onClose=${onClose}>
    <input id="palette-input" ref=${inputRef} type="text"
      placeholder="type a command… (Enter runs, Esc closes)"
      aria-label="command palette"
      value=${query} onInput=${(e) => onQuery(e.target.value)} />
    <ul role="listbox" aria-label="palette actions">
      ${results.map(
        (a, i) => html`<li key=${a.id} role="option" aria-selected=${i === selection}
          class=${i === selection ? "selected" : ""}
          onClick=${() => onPick(i)}>${a.label}</li>`,
      )}
      ${!results.length && html`<li class="empty">no matching action</li>`}
    </ul>
  </dialog>`;
}

const SHORTCUTS_HELP = [
  ["⌘K / Ctrl+K", "open the command palette"],
  ["/", "focus search"],
  ["↓/↑ · j/k", "move the palette selection (j/k outside the input)"],
  ["Enter", "run the selected action"],
  ["g then f · t · s · i", "go to fleet · timeline · search · intake"],
  ["?", "this help"],
  ["Esc", "close dialogs"],
];

function HelpDialog({ open, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (open && ref.current && !ref.current.open) ref.current.showModal();
    if (!open && ref.current && ref.current.open) ref.current.close();
  }, [open]);
  return html`<dialog class="help" ref=${ref} onClose=${onClose}>
    <div class="linkrow"><strong>Keyboard shortcuts</strong>
      <button type="button" onClick=${onClose}>close</button></div>
    <table class="help-table"><tbody>
      ${SHORTCUTS_HELP.map(
        ([keys, what]) => html`<tr key=${keys}><td><kbd>${keys}</kbd></td><td>${what}</td></tr>`,
      )}
    </tbody></table>
  </dialog>`;
}

function App() {
  const [state, setState] = useState(window.__TOOLBOX_INITIAL_STATE__ || null);
  const [statusline, setStatusline] = useState("connecting…");
  const [connState, setConnState] = useState("connecting");
  const [mdDoc, setMdDoc] = useState(null);
  const [indexVersion, setIndexVersion] = useState(0);
  const hash = useHashRoute();
  // Refs, not state: the SSE callbacks need the latest values without
  // re-subscribing, and the diff must compare against the previous snapshot.
  const stateRef = useRef(state);
  const connRef = useRef("connecting");

  const refresh = useCallback((sseEvent) => {
    fetch("/api/state")
      .then((r) => r.json())
      .then((data) => {
        // Only SSE-driven refreshes announce (the initial load is not a
        // change); the polite queue debounces bursts into one summary.
        if (sseEvent) announce.polite(diffSummary(stateRef.current, data));
        stateRef.current = data;
        setState(data);
        setIndexVersion((v) => v + 1);
        setStatusline(`live · ${new Date(data.generated_at).toLocaleTimeString()}`);
      })
      .catch(() => setStatusline("state unavailable"));
  }, []);

  useEffect(() => {
    refresh();
    const source = new EventSource("/events");
    source.onopen = () => {
      // Recovery is time-sensitive (the user may be waiting on stale data),
      // so it lands in the assertive region like the loss did.
      if (connRef.current === "down") announce.assertive("live updates reconnected");
      connRef.current = "live";
      setConnState("live");
    };
    source.onmessage = refresh;
    source.onerror = () => {
      if (connRef.current === "live") {
        announce.assertive("live updates disconnected — retrying");
      }
      connRef.current = "down";
      setConnState("down");
      setStatusline("reconnecting…");
    };
    return () => source.close();
  }, [refresh]);

  const openMd = useCallback((root, file, label) => {
    fetch(`/api/md?root=${encodeURIComponent(root)}&file=${encodeURIComponent(file)}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => setMdDoc({ label, text }))
      .catch((e) => setMdDoc({ label, text: `(not available: ${e.message})` }));
  }, []);

  // --- command palette + shortcuts (Plan E) ---
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteSel, setPaletteSel] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const paletteResults = rankActions(buildActions(state, openMd), paletteQuery);
  // The document keydown listener is attached once; this ref hands it the
  // current render's values without re-subscribing (single-listener contract).
  const uiRef = useRef({});
  uiRef.current = { paletteOpen, paletteSel, paletteResults, helpOpen };
  const gArmedRef = useRef(0);

  const openPalette = useCallback(() => {
    setPaletteQuery("");
    setPaletteSel(0);
    setPaletteOpen(true);
  }, []);
  const runAction = useCallback((index) => {
    const action = uiRef.current.paletteResults[index];
    setPaletteOpen(false);
    if (action) action.run();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      const ui = uiRef.current;
      const target = e.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
      const inField =
        tag === "input" || tag === "textarea" || tag === "select" ||
        (target && target.isContentEditable);
      // ⌘K / Ctrl+K toggles from anywhere, form fields included.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (ui.paletteOpen) setPaletteOpen(false);
        else openPalette();
        return;
      }
      if (ui.paletteOpen) {
        // Inside the palette only its own navigation keys act; j/k stay
        // typeable in the input (arrows always navigate). Esc is native.
        const inPaletteInput = target && target.id === "palette-input";
        const last = ui.paletteResults.length - 1;
        if (e.key === "ArrowDown" || (e.key === "j" && !inPaletteInput)) {
          e.preventDefault();
          setPaletteSel((s) => (last < 0 ? 0 : Math.min(s + 1, last)));
        } else if (e.key === "ArrowUp" || (e.key === "k" && !inPaletteInput)) {
          e.preventDefault();
          setPaletteSel((s) => Math.max(s - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          runAction(ui.paletteSel);
        }
        return;
      }
      if (inField) return; // global shortcuts are inert while typing
      if (e.key === "/") {
        e.preventDefault();
        location.hash = "#/search";
        // Focus after the view renders; instant, no scroll animation.
        setTimeout(() => {
          const el = document.getElementById("global-search");
          if (el) el.focus();
        }, 50);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (gArmedRef.current && Date.now() - gArmedRef.current < 900) {
        gArmedRef.current = 0;
        const view = VIEW_ACTIONS.find((v) => v.key === e.key);
        if (view) {
          e.preventDefault();
          location.hash = view.hash;
        }
        return;
      }
      if (e.key === "g") gArmedRef.current = Date.now();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openPalette, runAction]);

  let view = null;
  if (!state) {
    view = html`<${Empty}>loading…<//>`;
  } else {
    const harness = /^#\/harness\/(.+)$/.exec(hash);
    if (harness) {
      view = html`<${HarnessView} state=${state} name=${decodeURIComponent(harness[1])}
        onOpenMd=${openMd} />`;
    } else if (hash === "#/timeline") {
      view = html`<${TimelineView} state=${state} />`;
    } else if (hash === "#/search") {
      view = html`<${SearchView} indexVersion=${indexVersion} onOpenMd=${openMd} />`;
    } else if (hash === "#/intake") {
      view = html`<${IntakeView} state=${state} />`;
    } else {
      view = html`<${FleetView} state=${state} />`;
    }
  }

  return html`
    <nav>
      <span class="wordmark">ToolBox</span>
      <a href="#/fleet">fleet</a>
      <a href="#/timeline">timeline</a>
      <a href="#/search">search</a>
      <a href="#/intake">intake</a>
      <span class=${`statusline${connState === "live" ? " is-live" : ""}${connState === "down" ? " is-down" : ""}`}>${statusline}</span>
      <button type="button" class="palette-hint" title="command palette (⌘K / Ctrl+K)"
        onClick=${openPalette}>⌘K</button>
      <${ThemeToggle} />
    </nav>
    <main>${view}</main>
    <${MdDialog} doc=${mdDoc} onClose=${() => setMdDoc(null)} />
    <${CommandPalette} open=${paletteOpen} query=${paletteQuery} selection=${paletteSel}
      results=${paletteResults}
      onQuery=${(q) => {
        setPaletteQuery(q);
        setPaletteSel(0);
      }}
      onPick=${runAction} onClose=${() => setPaletteOpen(false)} />
    <${HelpDialog} open=${helpOpen} onClose=${() => setHelpOpen(false)} />`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
