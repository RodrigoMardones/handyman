"use client";

import MiniSearch from "minisearch";
import { useEffect, useMemo, useRef, useState } from "react";
import { announce } from "../lib/announce";
import { renderSearchResultsHtml, type SearchHit } from "../app/search/searchHtml";
import { MdDialog, type MdDocRequest } from "./MdDialog";

/**
 * Client layer for /search (feature toolbox_next_timeline_search). Migrates
 * the legacy panel's SearchView: the BM25 index is built CLIENT-SIDE with
 * MiniSearch from GET /api/corpus (features + backlog + progress + docs of
 * every registered harness) and every keystroke is answered locally, with
 * zero network in the search path. MiniSearch is a declared dependency of
 * apps/web (see docs/architecture.md): it is the same engine the legacy
 * panel loads as a vendor UMD, imported here as a normal ESM module.
 *
 * Index options mirror the panel exactly: fields title+text (title boosted
 * x2), prefix matching, fuzzy 0.1, top 30 hits.
 *
 * The corpus is re-fetched (and the index rebuilt) on every /events change
 * tick, so search results follow the workspace like every other live view.
 *
 * Non-feature hits open their source through the shared /api/md dialog
 * (MdDialog): the corpus refs (current | history | checkpoints |
 * backlog:*.md | docs:*.md) are 1:1 with the resolveMd allowlist. The hit
 * list itself is rendered by the pure renderer (searchHtml.ts) into an
 * innerHTML region with ONE delegated click listener reading data-md-*
 * attributes; feature hits carry no button (nothing behind them to open).
 */
const SEARCH_MAX_HITS = 30;

interface CorpusDoc {
  id: string;
  project: string;
  kind: string;
  title: string;
  text: string;
  ref: string;
}

function buildIndex(documents: CorpusDoc[]): MiniSearch<CorpusDoc> {
  const mini = new MiniSearch<CorpusDoc>({
    fields: ["title", "text"],
    storeFields: ["project", "kind", "title", "ref"],
    searchOptions: { boost: { title: 2 }, prefix: true, fuzzy: 0.1 },
  });
  mini.addAll(documents);
  return mini;
}

export function SearchClient({
  corpusUrl,
  eventsUrl,
  mdUrl,
}: {
  /** Same-origin corpus URL ("/api/corpus"), served natively by this app. */
  corpusUrl: string;
  /** Same-origin SSE feed URL ("/events"): each change tick re-indexes. */
  eventsUrl: string;
  /** Same-origin markdown API base ("/api/md") for the shared dialog. */
  mdUrl: string;
}) {
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const [mdDoc, setMdDoc] = useState<MdDocRequest | null>(null);
  // Bumped whenever the index is (re)built so the derived results below
  // recompute after the corpus loads or an /events tick rebuilds it.
  const [indexVersion, setIndexVersion] = useState(0);
  const miniRef = useRef<MiniSearch<CorpusDoc> | null>(null);

  // Build the index on mount and rebuild it on every /events change tick.
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    const loadCorpus = async (): Promise<void> => {
      try {
        const response = await fetch(corpusUrl, { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { documents?: CorpusDoc[] };
        if (cancelled) {
          return;
        }
        miniRef.current = buildIndex(Array.isArray(data.documents) ? data.documents : []);
        setReady(true);
        setIndexVersion((v) => v + 1);
        announce.polite("search index ready");
      } catch {
        // Corpus briefly unreachable: stay on "building index..." and let
        // the next /events tick retry.
      }
    };

    void loadCorpus();

    if (typeof window !== "undefined" && typeof EventSource !== "undefined") {
      es = new EventSource(eventsUrl);
      es.onmessage = () => {
        void loadCorpus();
      };
      // A dropped feed is not fatal here: the index already built keeps
      // answering locally; EventSource auto-retries per the server's frame.
    }

    return () => {
      cancelled = true;
      es?.close();
    };
    // corpusUrl/eventsUrl are stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Results markup is DERIVED state so React owns the innerHTML through
  // dangerouslySetInnerHTML and it survives re-renders. An earlier version
  // wrote innerHTML by hand into a ref, but React re-applied the constant
  // dangerouslySetInnerHTML on every re-render and wiped it - search looked
  // permanently stuck on "building index...". mini.search is a synchronous
  // local BM25 lookup, cheap enough to run in render.
  const html = useMemo(() => {
    const mini = miniRef.current;
    const hits: SearchHit[] =
      mini && query
        ? (mini.search(query).slice(0, SEARCH_MAX_HITS) as unknown as SearchHit[])
        : [];
    return renderSearchResultsHtml(hits, query, ready);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ready, indexVersion]);

  // ONE delegated click listener: the renderer marks openable hits with
  // data-md-* attributes; feature hits have no button.
  const onRegionClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest("[data-md-file]") as HTMLButtonElement | null;
    if (!button) {
      return;
    }
    const root = button.dataset.mdRoot;
    const file = button.dataset.mdFile;
    if (root && file) {
      setMdDoc({ root, file, title: button.dataset.mdTitle || file });
    }
  };

  return (
    <div className="search">
      <div className="search__row">
        <input
          id="global-search"
          type="search"
          className="search__input"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          placeholder="BM25 across features, backlog, progress and docs..."
          aria-label="search the fleet corpus"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="search__state" data-ready={ready ? "true" : "false"}>
          {ready ? "index ready" : "building index..."}
        </span>
      </div>
      <div
        className="search__results"
        onClick={onRegionClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <MdDialog doc={mdDoc} mdUrl={mdUrl} onClose={() => setMdDoc(null)} />
    </div>
  );
}
