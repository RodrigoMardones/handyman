import styles from "./page.module.css";
import { ScrollReveal } from "../components/ScrollReveal";

/**
 * Landing page for handyman toolBox (feature toolbox_next_landing). This is
 * the first apps/web route that "steals" a path from proxy.ts: every other
 * path (every JSON endpoint, the legacy panel) still falls through to the
 * Node upstream untouched. See the updated comment in app/layout.tsx.
 *
 * ============================================================================
 * TASTESKILL V2 PRE-FLIGHT CHECK (design-taste-frontend/SKILL.md, section 14)
 * ============================================================================
 *
 * Design read (section 0.B): Reading this as a developer-tool landing page
 * for engineers who run multi-agent coding workflows, with a calm technical
 * language, leaning toward native CSS plus CSS Modules and a terracotta-on-
 * slate palette. Zero new dependencies is a hard constraint from the feature
 * brief, so no Tailwind, no shadcn, no icon or motion libraries anywhere.
 *
 * Dials (section 1): DESIGN_VARIANCE 7 (asymmetric split hero and bento
 * grid, top of the "landing page" preset band because the audience reads
 * dense technical layouts comfortably). MOTION_INTENSITY 4 (fluid CSS
 * transitions plus one scroll-reveal pattern, a devtool audience does not
 * need cinematic choreography). VISUAL_DENSITY 4 (daily-app spacing, the
 * product itself is data-dense but the page selling it should breathe).
 *
 * Design system (section 2): no official system fits a local devtool
 * observer. Built as an honest native-CSS aesthetic (section 2.B), labeled
 * here rather than pretending it is a named framework.
 *
 * Checklist (one line per box, Pass or Fail plus a one-line justification):
 * [PASS] Brief inference declared - the "Reading this as" line above.
 * [PASS] Dial values explicit and reasoned - declared above, tied to the developer-tool preset.
 * [PASS] Design system chosen or aesthetic labeled honestly - native CSS, labeled above, no framework claimed.
 * [PASS] Redesign mode detected and audited - greenfield, apps/web has zero prior page.tsx to preserve.
 * [PASS] ZERO em-dashes or en-dashes anywhere - enforced by tests/test_web_landing.sh's node scan of apps/web.
 * [PASS] Page Theme Lock, one theme for the page - single prefers-color-scheme block in globals.css, no section overrides it.
 * [PASS] Color Consistency Lock - one accent (terracotta) reused on every button, link and numeral across all 9 sections.
 * [PASS] Shape Consistency Lock - documented rule: pill buttons, 14px cards and bento tiles, 10px code and panel surfaces, followed everywhere.
 * [PASS] Button Contrast Check - on-accent tokens chosen per mode for readable text on the accent fill, no white-on-white or ghost-on-photo without a border.
 * [PASS] CTA Button Wrap - both CTA labels are 3 to 4 words and no button constrains max-width.
 * [PASS] Form Contrast Check - not applicable, this page has no form inputs.
 * [PASS] Serif discipline - not applicable, no serif is used anywhere on the page.
 * [PASS] Premium-consumer palette check - not a premium-consumer brief, but the terracotta-on-slate palette avoids the banned beige and brass family and any AI-purple default anyway.
 * [PASS] Italic descender clearance - not applicable, no italic display type is used.
 * [PASS] Hero fits the viewport - headline is 8 words across at most 2 lines in a 37rem column, subtext is exactly 20 words, both CTAs render above the fold.
 * [PASS] Hero top padding capped - clamp(2.5rem, 6vw, 5.5rem), 5.5rem ceiling stays under the 6rem (pt-24) limit.
 * [PASS] Hero stack discipline - exactly 3 text elements (headline, subtext, one CTA row), no eyebrow, no trust strip, no tagline under the CTAs.
 * [PASS] Eyebrow count within the mechanical ceiling - zero eyebrows anywhere, trivially under the ceiling of 3 for 9 sections.
 * [PASS] Split-Header Ban - every section stacks headline above body at full measure, no floating corner paragraph beside a big headline.
 * [PASS] Zigzag Alternation Cap - only the hero uses an image-beside-text split, no repeat of that pattern anywhere else.
 * [PASS] No Duplicate CTA Intent - "Install the toolBox" is reused verbatim for the one install intent, "See how it's built" is the only, distinct explore intent.
 * [PASS] Logo wall is logo only - not applicable, no trusted-by logo wall exists on this page.
 * [PASS] Bento Background Diversity - of 6 cells, 2 carry real photography and 1 carries a terracotta gradient, the rest are plain text tiles.
 * [PASS] Trusted-by logo wall lives under the hero - not applicable, no logo wall on this page.
 * [PASS] Copy Self-Audit - every visible string was re-read before shipping, none are grammatically broken or claim data this project does not have.
 * [PASS] Motion motivated - the only motion is a fade-and-rise reveal on scroll, used to sequence attention down the page, nothing animates purely for show.
 * [PASS] Marquee max one per page - zero marquees on this page.
 * [PASS] Navigation on one line - a single 68px row, secondary links hide under 860px, wordmark plus install button always fit one line.
 * [PASS] Section-Layout-Repetition check - 9 sections, 9 distinct layout families, listed in the architecture section of this file's structure.
 * [PASS] Bento has rhythm and exact cell count - 6 capabilities map to exactly 6 grid areas, no empty cells.
 * [PASS] Long lists use the right UI component - 4 providers use scroll-snap cards, 6 capabilities use a bento grid, nothing is a plain bulleted list over 4 items.
 * [PASS] Real images used, gen-tool first then Picsum-seed - no gen tool is available in this environment, so 3 Picsum-seed photographs are used with explicit width, height and honest alt text.
 * [PASS] No pills or labels overlaid on images - bento image cells carry only a title and body over a bottom scrim, no floating tag pills.
 * [PASS] No photo-credit captions as decoration - no fake photographer or plate captions anywhere.
 * [PASS] No version footers - the footer has no build number or sync timestamp.
 * [PASS] No micro-meta-sentences under eyebrows - not applicable, there are no eyebrows.
 * [PASS] No decoration text strip at hero bottom - the hero ends at the CTA row.
 * [PASS] No floating top-right sub-text - every section head is a single vertical stack, never a corner-floated paragraph.
 * [PASS] No scoring or progress bars with filled tracks - the security tiles use plain numerals and short sentences only.
 * [PASS] No locale, city, time or weather strips - the product is explicitly localhost only, nothing names a city or timezone.
 * [PASS] No scroll cues - no scroll arrow or scroll label anywhere.
 * [PASS] No version labels in the hero - no v0.x, beta or invite-only label.
 * [PASS] No section-numbering eyebrows - the pipeline rail's markers are unlabeled rings, not numerals.
 * [PASS] No decorative dots - the pipeline rail's rings are unfilled outlines with no status meaning and are the only marker element on the page.
 * [PASS] No border-top plus border-bottom on every row - the metrics strip uses a single left-border divider per item, nothing is a bordered list over 4 rows.
 * [PASS] Content density is sane - no data-dump tables, the longest list (providers) has 4 entries in a scroll row.
 * [PASS] Quotes are 3 lines or fewer - the manifesto quote is one short sentence.
 * [PASS] Motion claimed equals motion shown - the reveal pattern actually runs, verified by disabling reduced motion and scrolling the built page.
 * [PASS] GSAP sticky-stack or horizontal-pan skeleton - not applicable, neither pattern is used on this page.
 * [PASS] No window.addEventListener('scroll') - the only scroll-aware code is ScrollReveal's IntersectionObserver, confirmed by grep across apps/web.
 * [PASS] Reduced motion honored - every transition is gated behind prefers-reduced-motion: no-preference in globals.css, page.module.css and ScrollReveal.module.css.
 * [PASS] Dark mode tokens defined and tested - tokens flip under prefers-color-scheme: dark in globals.css, checked in both OS appearances.
 * [PASS] Mobile collapse explicit per section - bento, metrics, spec tiles, pipeline and the hero split each declare their own under-768px or under-860px fallback.
 * [PASS] Viewport stability - the hero is not viewport-locked, no 100dvh or h-screen anywhere, height follows content so the mobile jump bug cannot occur.
 * [PASS] useEffect animations have cleanup - ScrollReveal's IntersectionObserver disconnects in its effect cleanup function.
 * [PASS] Empty, loading and error states - not applicable, this is a static page with no data fetching, those states live in the toolBox panel itself.
 * [PASS] Cards omitted in favor of spacing where possible - the metrics strip and pipeline rail use hairlines and space, cards appear only where the bento grid and provider scroller need contained tiles.
 * [PASS] Icons from an allowed library only - zero new dependencies is a hard brief constraint, so zero pictorial icons ship at all; the one geometric wordmark mark is the explicitly allowed exception in section 4.8.
 * [PASS] Motion isolated in client-leaf components - only components/ScrollReveal.tsx declares "use client", page.tsx and layout.tsx stay server components.
 * [PASS] No AI Tells from section 9 - no Inter default, no AI purple, no three equal cards, no Jane Doe, no Acme, no "quietly trusted by".
 * [PASS] Core Web Vitals plausibly hit - hero image is fetchPriority high with explicit dimensions, all other images lazy load, the only client script is a tiny observer.
 * [PASS] One design system per project - a single native-CSS system throughout, nothing mixed in.
 *
 * Section-Layout-Repetition inventory (9 sections, 9 distinct families):
 * 1. Hero: Asymmetric Split Hero.            6. Security: Featured 2x2 spec tiles.
 * 2. Metrics: divided stat strip.            7. Architecture: single-column code panel.
 * 3. Capabilities: asymmetric bento grid.    8. Providers: horizontal scroll-snap cards.
 * 4. Manifesto: full-width editorial quote.  9. CTA: centered command band.
 * 5. Pipeline: connected-steps rail.
 */
export default function Home() {
  return (
    <div className={styles.page}>
      <a href="#main" className="sr-only">
        Skip to content
      </a>

      <header className={styles.nav}>
        <div className={styles.navInner}>
          <a href="#" className={styles.brand}>
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              aria-hidden="true"
              className={styles.brandMark}
            >
              <path
                d="M12 2 L20 7 L20 17 L12 22 L4 17 L4 7 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <rect x="7.5" y="11" width="9" height="2" rx="1" fill="currentColor" />
            </svg>
            handyman toolBox
          </a>
          <nav aria-label="Primary">
            <ul className={styles.navLinks}>
              <li>
                <a href="#capabilities">Capabilities</a>
              </li>
              <li>
                <a href="#security">Security</a>
              </li>
              <li>
                <a href="#providers">Providers</a>
              </li>
              <li>
                <a href="#architecture">Architecture</a>
              </li>
            </ul>
          </nav>
          <div className={styles.navRight}>
            <a
              className={styles.btnPrimary}
              href="https://skills.sh/RodrigoMardones/handyman"
              target="_blank"
              rel="noreferrer"
            >
              Install the toolBox
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        {/* 1. Hero: Asymmetric Split Hero */}
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.heroGrid}>
              <div className={styles.heroText}>
                <h1 className={styles.headline}>Your agent fleet, streamed live to the browser.</h1>
                <p className={styles.subtext}>
                  handyman toolBox streams fleet state, health signals and history from disk to
                  your browser over SSE. Local only, read only.
                </p>
                <div className={styles.ctaRow}>
                  <a
                    className={styles.btnPrimary}
                    href="https://skills.sh/RodrigoMardones/handyman"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Install the toolBox
                  </a>
                  <a className={styles.btnGhost} href="#architecture">
                    See how it&apos;s built
                  </a>
                </div>
              </div>
              <div className={styles.heroVisual}>
                <img
                  src="https://picsum.photos/seed/handyman-toolbox-fleet-console/900/1125"
                  alt="Placeholder photograph standing in for the toolBox fleet console"
                  width={900}
                  height={1125}
                  fetchPriority="high"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 2. Metrics: divided stat strip */}
        <section className={`${styles.section} ${styles.metricsSection}`}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionHeadline}>Small footprint, by design.</h2>
              <p className={styles.sectionSub}>
                Every number below comes from the same parity suite that has to stay green before
                any feature closes.
              </p>
            </div>
            <ScrollReveal>
              <div className={styles.metricsRow}>
                <div className={styles.metric}>
                  <span className={styles.metricValue}>SSE</span>
                  <span className={styles.metricLabel}>
                    fleet state streams to the browser the moment a file changes on disk
                  </span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricValue}>48 / 48</span>
                  <span className={styles.metricLabel}>
                    parity cases green across the Node server and its Next.js strangler
                  </span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricValue}>4 roles</span>
                  <span className={styles.metricLabel}>
                    leader, implementer, reviewer and explorer, each with its own tool budget
                  </span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricValue}>1 route</span>
                  <span className={styles.metricLabel}>
                    the only endpoint in the whole surface allowed to write to disk
                  </span>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* 3. Capabilities: asymmetric bento grid */}
        <section id="capabilities" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionHeadline}>Six views into one running fleet</h2>
              <p className={styles.sectionSub}>
                Everything below reads the same registry of harnesses. Nothing here is a separate
                product.
              </p>
            </div>
            <div className={styles.bentoGrid}>
              <ScrollReveal className={`${styles.cell} ${styles.cellFleet}`}>
                <img
                  className={styles.cellImg}
                  src="https://picsum.photos/seed/handyman-toolbox-live-fleet/900/700"
                  alt="Placeholder photograph representing the live fleet view"
                  width={900}
                  height={700}
                  loading="lazy"
                  decoding="async"
                />
                <div className={styles.cellScrim} aria-hidden="true" />
                <h3 className={styles.cellTitle}>Live fleet view</h3>
                <p className={styles.cellBody}>
                  Every registered harness&apos;s status, health signals and queue depth, pushed
                  to the browser the moment a file on disk changes.
                </p>
              </ScrollReveal>
              <ScrollReveal
                delayMs={60}
                className={`${styles.cell} ${styles.cellAsk}`}
              >
                <h3 className={styles.cellTitle}>Ask your fleet</h3>
                <p className={styles.cellBody}>
                  Ask a question about one harness in plain language and get an answer grounded
                  in its own docs, every claim carrying a citation.
                </p>
              </ScrollReveal>
              <ScrollReveal
                delayMs={120}
                className={`${styles.cell} ${styles.cellSummary}`}
              >
                <h3 className={styles.cellTitle}>Fleet summary</h3>
                <p className={styles.cellBody}>
                  A short narrative of what changed across every registered harness, cached by a
                  hash of the fleet state so nothing gets asked twice.
                </p>
              </ScrollReveal>
              <ScrollReveal
                delayMs={60}
                className={`${styles.cell} ${styles.cellDraft}`}
              >
                <h3 className={styles.cellTitle}>Draft a feature request</h3>
                <p className={styles.cellBody}>
                  Turn a rough idea into a reviewed feature-request.md, the one file this observer
                  is allowed to write.
                </p>
              </ScrollReveal>
              <ScrollReveal
                delayMs={120}
                className={`${styles.cell} ${styles.cellProviders}`}
              >
                <h3 className={styles.cellTitle}>Bring your own model</h3>
                <p className={styles.cellBody}>
                  Claude, the Z.ai coding plan, Ollama, or a provider you add yourself. One table
                  entry, no branching code.
                </p>
              </ScrollReveal>
              <ScrollReveal
                delayMs={180}
                className={`${styles.cell} ${styles.cellStrangler}`}
              >
                <img
                  className={styles.cellImg}
                  src="https://picsum.photos/seed/handyman-toolbox-strangler-migration/1600/500"
                  alt="Placeholder photograph representing the Next.js migration in progress"
                  width={1600}
                  height={500}
                  loading="lazy"
                  decoding="async"
                />
                <div className={styles.cellScrim} aria-hidden="true" />
                <h3 className={styles.cellTitle}>Migrating to Next.js in the open</h3>
                <p className={styles.cellBody}>
                  A parity oracle decides when a page is done: the same black-box suite runs
                  unmodified against the old server and the new one.
                </p>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* 4. Manifesto: full-width editorial quote */}
        <section className={`${styles.section} ${styles.manifesto}`}>
          <div className={styles.container}>
            <ScrollReveal>
              <p className={styles.manifestoQuote}>
                &ldquo;The chat coordinates. The disk is the source of truth.&rdquo;
              </p>
              <p className={styles.manifestoAttr}>
                The design principle behind every view in the toolBox observer
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* 5. Pipeline: connected-steps rail */}
        <section className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionHeadline}>From disk to browser in four hops</h2>
              <p className={styles.sectionSub}>
                No polling anywhere in this path. A file changes once, and everything downstream
                reacts once.
              </p>
            </div>
            <div className={styles.pipelineRail}>
              <ScrollReveal delayMs={0} className={styles.pipelineNode}>
                <span className={styles.nodeMarker} aria-hidden="true" />
                <h3 className={styles.nodeTitle}>Disk</h3>
                <p className={styles.nodeBody}>
                  feature_list.json, progress and backlog stay the single source of truth for
                  every session.
                </p>
              </ScrollReveal>
              <ScrollReveal delayMs={80} className={styles.pipelineNode}>
                <span className={styles.nodeMarker} aria-hidden="true" />
                <h3 className={styles.nodeTitle}>Watch</h3>
                <p className={styles.nodeBody}>
                  fs.watch debounces every change, so a burst of writes still becomes one event.
                </p>
              </ScrollReveal>
              <ScrollReveal delayMs={160} className={styles.pipelineNode}>
                <span className={styles.nodeMarker} aria-hidden="true" />
                <h3 className={styles.nodeTitle}>Stream</h3>
                <p className={styles.nodeBody}>
                  Server-sent events push state, corpus and timeline deltas to every open tab at
                  once.
                </p>
              </ScrollReveal>
              <ScrollReveal delayMs={240} className={styles.pipelineNode}>
                <span className={styles.nodeMarker} aria-hidden="true" />
                <h3 className={styles.nodeTitle}>Render</h3>
                <p className={styles.nodeBody}>
                  The panel repaints only what changed. No polling, no manual refresh.
                </p>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* 6. Security: featured 2x2 spec tiles */}
        <section id="security" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionHeadline}>Built to stay out of the way</h2>
              <p className={styles.sectionSub}>
                The observer is a guest on your machine. These four rules keep it that way.
              </p>
            </div>
            <div className={styles.specGrid}>
              <ScrollReveal delayMs={0} className={styles.specTile}>
                <span className={styles.specValue}>127.0.0.1</span>
                <p className={styles.specBody}>
                  Hard bound to localhost. There is no flag that widens it.
                </p>
              </ScrollReveal>
              <ScrollReveal delayMs={60} className={styles.specTile}>
                <span className={styles.specValue}>1 write route</span>
                <p className={styles.specBody}>
                  Every response is read only except a single endpoint that saves one reviewed
                  file.
                </p>
              </ScrollReveal>
              <ScrollReveal delayMs={120} className={styles.specTile}>
                <span className={styles.specValue}>Host checked</span>
                <p className={styles.specBody}>
                  Every request is matched against 127.0.0.1, localhost or [::1] before it reaches
                  a handler.
                </p>
              </ScrollReveal>
              <ScrollReveal delayMs={180} className={styles.specTile}>
                <span className={styles.specValue}>self only</span>
                <p className={styles.specBody}>
                  Content-Security-Policy default-src self. Even the vendor libraries ship from
                  the same origin.
                </p>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* 7. Architecture: single-column code panel */}
        <section id="architecture" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.archWrap}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionHeadline}>A strangler, not a rewrite</h2>
              </div>
              <p className={styles.archBody}>
                apps/web sits in front of the existing Node server. Every path Next.js has not
                claimed yet falls straight through to the process that has been running the whole
                time, so the migration ships one route at a time instead of one big cutover.
              </p>
              <ScrollReveal>
                <div className={styles.codePanel}>
                  <div className={styles.codePanelLabel}>monorepo layout</div>
                  <pre>
                    <code>{`apps/web/                Next.js 16, the new UI
handyman/                 CLI and server, intact until decommission
packages/toolbox-core/    data layer, relays, contracts
packages/toolbox-llm/     provider registry, streaming adapters`}</code>
                  </pre>
                </div>
              </ScrollReveal>
              <p className={styles.archNote}>
                The same black-box suite that watches the Node server watches this page too: 48
                cases, byte for byte, before any route is called done.
              </p>
            </div>
          </div>
        </section>

        {/* 8. Providers: horizontal scroll-snap cards */}
        <section id="providers" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionHeadline}>Add a provider, not a branch</h2>
              <p className={styles.sectionSub}>
                Every provider is one entry in a table: a base URL, an environment key, a default
                model and how it resolves its variant.
              </p>
            </div>
            <ul className={styles.providerScroller}>
              <li className={styles.providerCard}>
                <div className={styles.providerName}>zai</div>
                <p className={styles.providerBody}>
                  Coding Plan over the Anthropic wire format, or pay as you go through the OpenAI
                  compatible endpoint. The entry picks the variant.
                </p>
              </li>
              <li className={styles.providerCard}>
                <div className={styles.providerName}>claude</div>
                <p className={styles.providerBody}>
                  Anthropic Messages API with server sent streaming, the same adapter the coding
                  plan also relies on.
                </p>
              </li>
              <li className={styles.providerCard}>
                <div className={styles.providerName}>ollama</div>
                <p className={styles.providerBody}>
                  No key required. Availability comes from a health check against a local model
                  list.
                </p>
              </li>
              <li className={`${styles.providerCard} ${styles.providerCardGhost}`}>
                <div className={styles.providerName}>your provider</div>
                <p className={styles.providerBody}>
                  Add a base URL and a default model. buildProviders never branches on an id
                  again.
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* 9. CTA: centered command band */}
        <section id="install" className={`${styles.section} ${styles.ctaSection}`}>
          <div className={styles.container}>
            <h2 className={styles.ctaHeadline}>Point it at a harness and watch</h2>
            <p className={styles.ctaSub}>
              Two commands, one local port. Nothing leaves your machine.
            </p>
            <div className={styles.commandBox}>
              <code className={styles.commandLine}>$ npx skills add &quot;RodrigoMardones/handyman&quot;</code>
              <code className={styles.commandLine}>$ node handyman/dist/toolbox.js serve</code>
            </div>
            <a
              className={styles.btnPrimary}
              href="https://skills.sh/RodrigoMardones/handyman"
              target="_blank"
              rel="noreferrer"
            >
              Install the toolBox
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerInner}`}>
          <ul className={styles.footerNav}>
            <li>
              <a href="#capabilities">Capabilities</a>
            </li>
            <li>
              <a href="#security">Security</a>
            </li>
            <li>
              <a href="#providers">Providers</a>
            </li>
            <li>
              <a href="#architecture">Architecture</a>
            </li>
          </ul>
          <p className={styles.footerMeta}>
            MIT licensed. Part of the Handyman agent harness. Support and issues go through the
            repository that hosts this skill.
          </p>
        </div>
      </footer>
    </div>
  );
}
