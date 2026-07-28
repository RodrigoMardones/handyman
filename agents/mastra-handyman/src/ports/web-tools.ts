// Web-research tools (operator mandate 2026-07-28): internet access for the
// agents' future investigations, with ZERO new credentials required. The
// docs-native upgrade path (@mastra/tavily, provider-native search) needs an
// API key this deployment does not have; these two tools work today:
// - web_search: DuckDuckGo Lite HTML endpoint (no key), parsed to title/url.
// - web_fetch: plain fetch + crude HTML-to-text, for reading docs/pages.
// Both cap their output hard — search results and pages are context poison
// if returned unbounded.
import { createTool } from '../mastra';
import { z } from 'zod';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGE_CHARS = 6_000;
const MAX_RESULTS = 8;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) handyman-research/1.0';

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head)[^>]*>.*?<\/\1>/gis, ' ')
      .replace(/<!--.*?-->/gs, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n'),
  ).trim();
}

export const webSearchTool = createTool({
  id: 'web_search',
  description:
    'Search the internet (DuckDuckGo Lite, no API key). Returns up to 8 results as title + URL. Use for research questions; then read promising pages with web_fetch.',
  inputSchema: z.object({
    query: z.string().min(1).describe('Search query, plain text.'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({ title: z.string(), url: z.string() })),
  }),
  execute: async ({ query }) => {
    const response = await fetch(
      `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
      {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) throw new Error(`web_search HTTP ${response.status}`);
    const html = await response.text();
    const results: Array<{ title: string; url: string }> = [];
    // DDG Lite rows: <a rel="nofollow" href="//duckduckgo.com/l/?uddg=<enc>&..."
    // class='result-link'>Title</a>
    const row =
      /<a[^>]+href="\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)[^"]*"[^>]*class='result-link'[^>]*>([\s\S]*?)<\/a>/g;
    let match: RegExpExecArray | null;
    while ((match = row.exec(html)) !== null && results.length < MAX_RESULTS) {
      results.push({
        url: decodeURIComponent(match[1]),
        title: decodeEntities(match[2].replace(/<[^>]+>/g, '')).trim(),
      });
    }
    return { results };
  },
});

export const webFetchTool = createTool({
  id: 'web_fetch',
  description:
    'Fetch a web page and return its text content (HTML stripped, capped at 6000 chars). Use to read documentation, issues, and articles found via web_search.',
  inputSchema: z.object({
    url: z.string().url().describe('Absolute http(s) URL to fetch.'),
  }),
  outputSchema: z.object({ url: z.string(), text: z.string(), truncated: z.boolean() }),
  execute: async ({ url }) => {
    const target = new URL(url);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new Error(`web_fetch: unsupported protocol ${target.protocol}`);
    }
    const response = await fetch(target, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain,application/json,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`web_fetch HTTP ${response.status}`);
    const body = await response.text();
    const text = htmlToText(body);
    return {
      url: response.url,
      text: text.slice(0, MAX_PAGE_CHARS),
      truncated: text.length > MAX_PAGE_CHARS,
    };
  },
});

/** The research tool pair, keyed for direct merge into an agent's tool map. */
export function webTools(): Record<string, unknown> {
  return { web_search: webSearchTool, web_fetch: webFetchTool };
}
