import type { Metadata } from "next";
import type { ReactNode } from "react";
import { THEME_ANTIFLASH_SNIPPET } from "../lib/theme";
import "./globals.css";

/**
 * Required by the App Router. Feature toolbox_next_scaffold
 * (docs/current/plan-migracion-toolbox-nextjs.md) shipped this layout when
 * zero paths had a page.tsx, so every request fell through to proxy.ts and
 * was served by the Node upstream untouched.
 *
 * Feature toolbox_next_landing added app/page.tsx, which "steals" exactly
 * the `/` route into Next. Every other path (every JSON endpoint, the
 * legacy panel's own routes, /events) still has no matching page.tsx and
 * keeps falling through proxy.ts to the Node server, so the strangler
 * pattern is unchanged outside of this one route.
 */
export const metadata: Metadata = {
  title: "handyman toolBox, a live observer for agent harness fleets",
  description:
    "Fleet state over SSE, grounded fleet Q&A, LLM summaries and a declarative provider registry, all served from one local, read only panel.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Theme anti-flash (feature toolbox_next_timeline_search): a
            parser-blocking inline snippet applies the persisted explicit
            theme (hw-theme:1) to <html> BEFORE the page paints, so a
            dark-mode user never sees a light flash. System mode stores
            nothing and the prefers-color-scheme media query rules. The
            snippet is same-origin inline code (no src), so the
            no-external-assets invariant holds. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_ANTIFLASH_SNIPPET }} />
        {children}
      </body>
    </html>
  );
}
