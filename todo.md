# TODO — GA.Lawyers

Status legend: ✅ done · 🚧 in progress · ⬜ not started

## ✅ Done (v0.1.0 — foundation)

- ✅ Project scaffold: `index.html`, `package.json`, `manifest.json`, dir layout.
- ✅ Practice-area taxonomy — [js/data/categories.js](js/data/categories.js)
  (8 areas: personal injury, criminal defense, divorce & family, real estate,
  estate & elder, bankruptcy, immigration, general practice).
- ✅ GA city→county map copied — [js/data/ga-counties.js](js/data/ga-counties.js).
- ✅ Importer — [scripts/import-csv.mjs](scripts/import-csv.mjs): Bing CSV →
  durable `data/cities/*.json` store → `lawyers-imported.js`. Classifies practice
  area name-first, tags `entity` (firm vs attorney), filters non-law rows.
- ✅ **128 real GA listings imported** (11 cities, 5 counties, 19 zips, 8 areas).
- ✅ Data brain — [js/lib/store.js](js/lib/store.js): selectors for
  city/county/zip/area, `top()` (Bayesian-weighted ranking), `groupByEntity`,
  `groupByArea`, `sortBy`, `nearest()` (haversine).
- ✅ Component layer — `dom.js` (`h()`), `format.js`, `card.js` (tier-gated card +
  claim sheet), `ui.js` (nav, tab bar, segmented, chips, lists).
- ✅ Live SPA — [js/app.js](js/app.js): hash routes for home, areas, area detail,
  cities/counties/zips index, city/county/zip detail, near-me (geolocation),
  search. Per-page: All / Law Firms / Attorneys segmented filter, sort control,
  Top 10 + full list, practice-area / city chips.
- ✅ iOS design system — [css/style.css](css/style.css): system colors + dark mode,
  blurred nav + bottom tab bar, safe-area insets, rounded cards, iOS sheet modal.
- ✅ Home `WebSite`/`Organization` JSON-LD.

## ✅ Done (v0.2.0 — polish)

- ✅ Inline SVG icon set — [js/lib/icons.js](js/lib/icons.js). All emojis removed
  (tab bar, buttons, search, near-me, empty states, chevrons).
- ✅ Richer buttons: gradient primary with animated sheen on the hero CTA, tinted
  call/directions actions, gradient premium CTA, tactile press states.
- ✅ Site footer on every view — [js/components/ui.js](js/components/ui.js):
  links, disclaimer, "Made by Artivicolab", "Contact us" (mailto only, address
  never shown as text).
- ✅ **Listing photos** from the scrape shown on every card that has one
  (92/128), with initials fallback on load error.
- ✅ Copy rules applied: no dashes in user-facing text (pipes in titles); removed
  all "vetted"/"verified" language (directory positioning); "Claimed" badge.

## ✅ Done (v0.3.0 — legal redesign + monetization rows + cache-busting)

- ✅ Redesigned the look from generic iOS to a **legal/authoritative aesthetic**:
  deep navy + brass-gold, a serif display face (`--font-serif`) on headings, card
  names, stats; navy hero with gold CTA; gold-accented section headers; navy
  full-bleed footer. Core tokens re-pointed (`--blue → navy`, `--orange → gold`).
- ✅ **Paid placement rows at the top of home**: Featured Attorneys (4 premium
  slots, $20/mo) and Standard Listings ($10/mo). Slots fill with real paid
  listings when a firm buys one; until then they show honest "available spot"
  promo cards with the price and a Claim button (mailto). New `promoCard()` +
  `featuredRow()`.
- ✅ Footer rebuilt as a prominent navy panel (was faint grey, easy to miss).
- ✅ **Cache-busting** via `npm run stamp` ([scripts/version-stamp.mjs](scripts/version-stamp.mjs)):
  stamps `?v=<version>` on index.html links + every relative import. Fixes the
  "site keeps flipping old/new design" problem. Workflow: bump version, run stamp.

## ✅ Done (v0.4.0 — Saved/Visited + 10× data)

- ✅ **Save (bookmark) on every card** + **Saved / Visited quick-access bar at the
  top of every page** (before the featured spots). Persisted in localStorage
  ([js/lib/saved.js](js/lib/saved.js)); one global listener keeps all counts and
  save buttons live. New `/saved` and `/visited` pages. Visited is recorded when a
  user calls, opens the website, or gets directions.
- ✅ Bookmark + clock icons added.
- ✅ **Imported 12 lawyer CSVs from ~/Downloads → 1,299 listings** (106 cities, 63
  counties, 174 zips, 652 with photos). Up from 128.
- ✅ Extracted the ingest gate into [scripts/gate.mjs](scripts/gate.mjs) (shared by
  import + scan); switched to word-boundary matching so mixed-folder scans don't
  mis-catch "lawn"/"Lawrence".
- ✅ [scripts/scan-downloads.mjs](scripts/scan-downloads.mjs): classifies which
  ~/Downloads Bing CSVs are lawyer files; processed files get the **red Finder tag**.
- ✅ Added 5 missing city→county mappings (bridgeboro, campton, cuthbert, lexington,
  royston).

## ✅ Done (v0.5.0 — static SEO generator)

- ✅ [scripts/generate-pages.mjs](scripts/generate-pages.mjs) emits **388 indexable
  static HTML pages** at clean URLs: `/<city>/`, `/<city>/<area>/` (the SEO grid),
  `/county/<slug>/`, `/area/<slug>/`, `/zip/<code>/` (`noindex` < 3 listings),
  plus a `/directory/` crawl hub.
- ✅ Per-page CTR `<title>`/description (no dashes), canonical, OG, breadcrumb +
  `CollectionPage` + `ItemList`(LegalService) + `BreadcrumbList` JSON-LD,
  `.area-intro` prose, stat row, Top 10 + full list, cross-links, footer.
- ✅ Server-side card markup mirrors `js/components/card.js` classes.
- ✅ Emits `sitemap.xml` (indexable only) + `robots.txt`. SPA `index.html` seeded
  with a crawlable `<noscript>` link to `/directory/`.
- ✅ `npm run build` = stamp + generate. Fixed zip extraction (reads zip after
  "GA", validates GA range) so street numbers no longer create junk zip pages.

## ✅ Done (v0.6.0 — max SEO + home-style pages + near-me→city)

- ✅ **Unique, non-boilerplate content per page**: intros vary by slug + carry live
  data (firm/attorney split, avg rating, ZIPs, top firm). Killed the duplicate-
  content risk.
- ✅ **FAQ on every page** with `FAQPage` JSON-LD (rich-result eligible) using real
  Georgia-specific facts per practice area (statutes, courts, residency, etc.).
- ✅ **Thin-page protection**: city/zip/city×area pages under 3 listings now
  `noindex,follow` (388 → 341 indexable) so they can't be seen as doorway pages.
- ✅ **Pre-rendered home** (`index.html`): real crawlable content + clean-URL links
  to every hub + Top 10, with `WebSite`/`Organization` schema. SPA hydrates over it.
- ✅ **Local signals**: `geo.region`/`geo.placename`/`ICBM` meta + `GeoCoordinates`
  in JSON-LD per city/zip/county.
- ✅ **Auto-prune** orphaned page folders each build (guarded allowlist).
- ✅ `404.html` generated.
- ✅ **Every listing page (city/county/zip/area + saved/visited) opens with a
  home-style navy hero** (eyebrow + serif title + sub) before the listings, in both
  the SPA (`pageHero`) and the static pages (`pageShell`).
- ✅ **"Near me" now drops the user on THEIR city page** (geolocate → nearest city →
  `#/city/<slug>`), with a city-picker fallback when location is blocked.

## ✅ Done (v0.7.0 — static-first, no more hash URLs)

- ✅ **Retired the SPA hash router.** Deleted `js/app.js` + `js/components/ui.js`.
  The generated static pages ARE the site; all navigation uses clean URLs
  (`/alpharetta/`), no `#/` anywhere.
- ✅ Generator emits the **home** (hero, search, near-me, featured rows, chips,
  Top 10) + dynamic shells `/search/`, `/saved/`, `/visited/`.
- ✅ [js/static.js](js/static.js): per-page enhancement (save, counts, visited,
  All/Firms/Attorneys filter, near-me → your city, search box).
  [js/collections.js](js/collections.js) renders the dynamic pages, reusing
  `card.js`. `city-centroids.js` powers near-me.
- ✅ Every static page carries save buttons, a bottom tab bar, and the quick-access
  bar (full app feel, zero hash). Fixed prune deleting the dynamic pages.

## ✅ Done (v0.9.0 — richer home + "Show more" pagination)

- ✅ **"Show more" pagination** on listing pages: 20 lawyers shown, the rest render
  in the HTML but `card--collapsed` (display:none, lazy images don't fetch) until a
  `data-more-btn` reveals 20 more at a time. Big pages (Alpharetta 157) stay light
  while keeping all content crawlable. Class-based entity filter coexists with it.
- ✅ **Home sections added**: trust/stat band, **near-you banner** (opt-in geolocation
  → "Nearest to you: {city}, see top N"), **legal-issue finder** (plain-English tiles
  → practice areas), **top-rated-by-city spotlights** (top 3 per big city),
  **how it works** (3 steps), **lawyer CTA band**, and a **home FAQ + FAQPage schema**.
- ✅ `city-centroids.js` now carries name + count for the near-you banner.

## ✅ Done (v0.15.0 — no-ship polish: a11y, perf, social, info pages)

- ✅ **Accessibility**: skip-to-content link, visible `:focus-visible` rings
  (oxblood on light, gilt on dark surfaces), `aria-current="page"` on the active
  tab, `aria-label`s, `#main` landmark.
- ✅ **Core Web Vitals / perf**: `decoding="async"` on images, `preconnect` +
  `dns-prefetch` to the Bing image host, fixed-size thumbnail containers (no CLS).
- ✅ **Social / SEO**: default `og:image` + `twitter:image` (summary_large_image)
  on every page using the hero photo.
- ✅ **Info pages**: `/pricing/` (Free / $10 Standard / $20 Premium), `/privacy/`,
  `/terms/` — and footer now links to them instead of mailto. Removes the
  "unfinished" gaps; legal directory now has privacy + terms.

## ✅ Done (v0.16.0 — installable PWA + animated Install button)

- ✅ **Animated "Install" button** in the top header on every page (home + all
  static pages): pulsing gilt ring + icon bob + sheen sweep. Hidden once installed;
  honors `prefers-reduced-motion`.
- ✅ **Service worker** ([sw.js], generated with a versioned cache so each build
  supersedes it) → offline shell + makes the app installable. Registered in
  static.js.
- ✅ **Manifest** updated (standalone, brand colors) + a branded **SVG app icon**
  ([assets/icon.svg], temple monogram, maskable-safe). Manifest + apple-touch-icon
  linked on every page.
- ✅ Install logic: captures `beforeinstallprompt` for the native prompt (Chrome/
  Edge/Android); on iOS/unsupported, the button shows an "Add to Home Screen" hint.
  - Note: app icon is SVG (no PNG tooling available). Modern Chrome accepts SVG
    manifest icons; a 512×512 PNG would maximize compatibility if added later.

## ⬜ Still ship-required (do when launching, after scraping is done)

- ⬜ Google Search Console: add the verification file (needs the token), submit
  `sitemap.xml`. Highest-leverage for actual ranking.
- ⬜ A few backlinks / citations.
- ⬜ **Self-host listing images** (write `scripts/fetch-images.mjs` to download the
  Bing thumbnails into `/assets/` and rewrite `image` URLs) — run AFTER scraping
  settles, so it isn't redone each import. Hotlinked Bing thumbnails will rot.
- ⬜ Real device + Lighthouse pass once content is final.
- ⬜ Payment flow (currently `mailto`); a default 1200×630 OG image.

### Generator follow-ups
- ⬜ Prune step: the generator writes but does not prune. After data shrinks, diff
  on-disk folders vs freshly-built links and `rm -rf` orphans (currently manual:
  wipe `zip/` before regen).
- ⬜ `CNAME`, `404.html`, GSC verification file emitted by the build.
- ⬜ Pre-render the SPA **home** content (currently only a `<noscript>` link is
  crawlable); or point SPA city/area links at the clean `/marietta/` URLs.
- ⬜ Per-listing `Attorney`/`LegalService` detail handling if we ever add detail pages.

## ⬜ Data / coverage

- ⬜ Import more lawyer CSVs to widen GA coverage (only Cobb/Cherokee/Bartow/
  Paulding/Fulton so far). Run `npm run import -- <more csvs>`.
- ⬜ Thin-town handling: fold cities with `< MIN_LISTINGS` into nearest city +
  roll up to county (port `absorbed`/`MAX_ABSORB_MI` logic from `~/contractors`).
- ⬜ De-dupe multi-office firms (e.g. O'Kelley & Sorohan, Weissman, Nelson appear
  in several cities — keep per-city pages but consider a canonical firm record).
- ⬜ `ga-cities.js` with tiered SEO target list (port/adapt from contractors).

## ⬜ Monetization

- ⬜ `/pricing/` page (Free / Standard / Premium tiers).
- ⬜ Wire claim/upgrade flow; admin notes on how to flip a listing to paid/verified
  in `data/cities/*.json` (manual, then re-run build).
- ⬜ Premium/Standard "claim this spot" cards on city/area pages.

## ⬜ Polish / PWA

- ⬜ App icons (`assets/icon-192.png`, `icon-512.png`) — referenced by manifest.
- ⬜ `sw.js` service worker for offline/install.
- ⬜ Map view (port `~/contractors/js/map.js`) for near-me + city pages.
- ⬜ Detail affordance: tapping a card currently only exposes action buttons —
  decide whether cards stay link-out only (per product model) or get a sheet.
- ⬜ Cache-bust CSS/JS with `?v=<version>` once the generator stamps it.

## Notes / decisions

- Engine mirrors `~/contractors` (same importer/generator shape, vocabulary swapped).
- `entity` (firm vs attorney) is heuristic from the name — spot-check after big
  imports; refine `ATTY`/`FIRM` regexes in the importer if misclassified.
- Bar-Verified badge & paid tier are **manual** edits in the store, never scraped.
