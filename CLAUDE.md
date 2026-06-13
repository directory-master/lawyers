# CLAUDE.md

Guidance for working in this repo.

## What this is

**GA.Lawyers** — a zero-backend, **SEO-first static directory** of **lawyers and
law firms across Georgia**, with a **native-iOS look and feel** and a **reusable
vanilla-JS component architecture**. Deploys to **GitHub Pages**
(target domain: `https://lawyers.artivicolab.com`). Made by **Artivicolab**.

The product is **the card** — a tappable iOS-style listing. Each card links out to
the firm's own site / Google Maps / phone. Free listings make the directory rank;
**paid tiers buy top-of-page placement** (pay-to-be-pinned, not lead-gen).

Sibling project **`~/contractors`** is the same engine for a different vertical —
consult it for patterns (importer, generator, freemium gate). Most of it ports
here with only vocabulary changed.

## ⚠️ Versioning + cache-busting — do this every change

The browser caches CSS and ES modules by URL. Without a changing URL the site
**flips between old and new design** until a hard refresh. So on EVERY change:

1. Bump `version` in `package.json` (patch for fixes, minor `0.x → 0.(x+1).0` for
   features).
2. Run **`npm run stamp`** — stamps `?v=<version>` on the CSS/JS links in
   `index.html` AND on every relative `import` across `js/**` (the whole module
   graph re-fetches, not just the entry file). Idempotent. See
   [scripts/version-stamp.mjs](scripts/version-stamp.mjs).

Never hand-edit the `?v=…` strings; bump + stamp. Imports therefore look like
`from '../lib/store.js?v=0.3.0'` — that's expected, the stamper manages it.

## Stack & constraints

- **STATIC-FIRST (no SPA).** The Node generator writes real crawlable HTML at clean
  URLs — those files ARE the site (`/marietta/`, `/county/cobb/`,
  `/area/personal-injury/`, `/zip/30060/`, `/`, `/directory/`, `/search/`, `/saved/`,
  `/visited/`). There are **no `#/` hash routes** — the old SPA router was retired.
- **Interactivity is progressive enhancement**, layered onto the static pages:
  - [js/static.js](js/static.js) — on EVERY page: save buttons, Saved/Visited
    counts, visited tracking, the All/Firms/Attorneys filter, "near me" → your
    city, and the search box.
  - [js/collections.js](js/collections.js) — on `/search/`, `/saved/`, `/visited/`
    only: renders results from localStorage/query, reusing the real card component.
- **Pure HTML / CSS / vanilla JS (ES modules).** No framework, no runtime deps.
  Components are plain functions returning DOM nodes via `h()` ([js/lib/dom.js](js/lib/dom.js)).
- ES modules need a real HTTP server (won't load over `file://`).

## Run locally

```bash
cd ~/lawyers
npm run import -- ~/Downloads/Bing_Maps_Scraper_<lawyers>.csv   # refresh data
npm run build      # bump package.json version FIRST, then: stamp + regenerate static pages
npm run serve      # http://localhost:8000  (static pages live at /marietta/, /county/cobb/, …)
```

**The generated files ARE the site.** `index.html` and every `*/index.html` are
written by the generator; do not hand-edit them (your changes get overwritten).
Edit the generator/templates or the data instead. After ANY data or design change:
**bump `version` in package.json → `npm run build`** (stamp + regenerate). The
generator auto-prunes orphaned page folders each run.

## Architecture

| Path | Role |
|------|------|
| [index.html](index.html) | SPA shell + home JSON-LD (`WebSite`/`Organization`). |
| [js/static.js](js/static.js) | Enhancement script on every static page (save, near-me, search, filter, counts). |
| [js/collections.js](js/collections.js) | Renders `/search/`, `/saved/`, `/visited/` from localStorage/query, reusing `card.js`. |
| [js/lib/dom.js](js/lib/dom.js) | `h()` hyperscript + `mount`/`clear`/`frag`. The whole "framework". |
| [js/lib/store.js](js/lib/store.js) | **The data brain.** Normalizes listings; selectors for city/county/zip/area; `top()` ranking; `groupByEntity` (firm vs attorney); `nearest()` (haversine). Pure data, no DOM — the generator can import it too. |
| [js/lib/format.js](js/lib/format.js) | Display helpers (stars, phone, distance, hours). |
| [js/components/card.js](js/components/card.js) | **The product** — the tier-gated lawyer card + claim sheet. |
| [js/data/city-centroids.js](js/data/city-centroids.js) | **AUTO-GENERATED** slug→{lat,lng} map; powers client-side "near me → your city". |
| [js/data/categories.js](js/data/categories.js) | Practice-area taxonomy (11 areas × groups). `slug` = stable URL key; `synonyms` drive the import classifier. |
| [js/data/ga-counties.js](js/data/ga-counties.js) | GA city→county map. Add a line per new city slug. |
| [js/data/lawyers-imported.js](js/data/lawyers-imported.js) | **AUTO-GENERATED** real listings (all `tier:'free'`). Don't hand-edit. |
| [data/cities/](data/cities/) | Durable **law-only** per-city JSON store (one file per city). Survives `~/Downloads` cleanup. |
| [scripts/import-csv.mjs](scripts/import-csv.mjs) | Bing Maps scraper CSV → durable store → `lawyers-imported.js`. |
| [scripts/generate-pages.mjs](scripts/generate-pages.mjs) | The static SEO generator. Emits crawlable HTML at clean URLs (city/county/zip/area/city×area) + `/directory/` hub + `sitemap.xml`. Mirrors `card.js` markup server-side. |
| [scripts/version-stamp.mjs](scripts/version-stamp.mjs) | Cache-buster: stamps `?v=<version>` on assets + imports. |
| [scripts/scan-downloads.mjs](scripts/scan-downloads.mjs) | Classifies which `~/Downloads` Bing CSVs are lawyer scrapes. |
| [scripts/gate.mjs](scripts/gate.mjs) | Shared ingest gate (parser + law-row classifier). |

## Data model (one listing)

`id` (stable URL key — never change), `name`, `city`/`cityName`, `countyName`/
`countySlug`, `zip`, `type` (practice-area label) + `typeSlug`, **`entity`**
(`'firm' | 'attorney'` — powers the "group by Law Firm / Attorney" surface),
`tier` (`free|standard|premium`), `paid`/`paidAt`/`paidDays`, `verified`/`barNo`
(Bar-verified badge — granted **manually**, never from the scrape), `rating`,
`reviews`, `lat`/`lng`, `address`, `phone`, `website`, `email`, `image`,
`hoursText`, social links.

## The freemium gate (core concept)

Every listing has `tier`. `renderCard` gates by tier; nothing gets more than its
tier earns.

| Feature | Free | Standard | Premium |
|---|:--:|:--:|:--:|
| Name, area, city, rating, firm/attorney tag, call, directions, website | ✓ | ✓ | ✓ |
| Photo, hours | — | ✓ | ✓ |
| "Request a consultation" CTA | — | — | ✓ |
| Pinned above free (via `rankScore`) | — | ✓ | ✓ (top) |

- **"Claimed" badge** marks a listing the owner has claimed (sets `verified:true`
  in the store). It means owner-claimed, NOT vetted by us (see "Copy rules").
- Free cards show an **"Own this practice? Claim and upgrade"** CTA → in-page sheet
  → `mailto`. Claim/lead email goes to **`artivicolab@gmail.com`** — **never render
  that address as visible text** (mailto target only).
- **Listing photos** come from the scrape (`l.image`, Bing thumbnail URLs) and show
  on **every** listing that has one, with a graceful fallback to initials on load
  error. 92/128 current listings have a photo.

## Adding listings

**Don't hand-edit `lawyers-imported.js`.** Run `npm run import -- <csv>`. A single
`isLawyerRow` gate (GA address + a `categories.js` practice-area match + name
sanity) runs **at ingest**, so non-law rows never enter `data/cities/`. Re-importing
keeps editable monetization fields (tier/paid/verified) — never un-pays a listing.
The gate lives in [scripts/gate.mjs](scripts/gate.mjs) (shared by import + scan)
and uses WORD-BOUNDARY matching so "law"/"legal" can't false-match "lawn"/"Lawrence".

**`~/Downloads` holds CSVs for several projects (contractors too).** To find and
ingest only lawyer scrapes:
```bash
node scripts/scan-downloads.mjs          # report: which CSVs are lawyer files (≥60% law rows)
node scripts/scan-downloads.mjs --list | xargs node scripts/import-csv.mjs   # import them
```
After processing a lawyer CSV, **red-tag it in Finder** (so we can see what's done):
set xattr `com.apple.metadata:_kMDItemUserTags` to a binary plist `["Red\n6"]`
(color index 6 = red). Finder's AppleScript `label index` is unreliable here; the
xattr is authoritative (mdls/Spotlight lags but Finder reads the xattr directly).
When the importer introduces a new city slug, add it to `ga-counties.js` (the build
will otherwise leave it without a county page).

Practice area (`type`) is inferred name-first from Name + Bing Category against
`synonyms`; generic "Lawyer/Legal services" → `general-practice`. **Real-estate is
matched before estate-elder** so "Real estate law" never lands in Estate & Elder.

## SEO surface (target — the whole point; generator is the TODO)

- **City** `/<city>/`, **County** `/county/<name>/`, **Zip** `/zip/<code>/`,
  **Practice area** `/area/<slug>/`, and per-area-per-city `/<city>/<area>/`.
  Each is one indexable URL with real content + a Top 10.
- Zip pages with `< 3` listings → `noindex`.
- Every page: `LegalService`/`Attorney` JSON-LD + `BreadcrumbList` + `WebPage`
  `areaServed`, canonical, OG/Twitter, `<h3>` card names.
- **CTR-tuned titles** (NO dashes — see "Copy rules"): `Top {Area} in {Place}, GA
  ({YEAR})`; descriptions open with a benefit ("Find and compare…"), ≤ ~155 chars.
- **Site name is `Georgia Lawyer Directory`** — keep identical across the `<title>`
  suffix (use a pipe: `… | Georgia Lawyer Directory`), `og:site_name`, and the home
  `WebSite`+`Organization` `name` (`alternateName: "GA.Lawyers"`).
- Every listing page carries an **`.area-intro`** prose paragraph (reader-facing,
  so Google quotes it instead of scraping a card address dump).
- The SPA hash routes (`#/city/...`) are **not crawlable** — they exist for the
  live app. The generator must emit static HTML twins at clean URLs.

## Copy rules (user-mandated)

- **No dashes in user-facing copy.** No em-dashes (—), no " - " connectors, avoid
  hyphenated adjectives ("top rated", not "top-rated"). Use commas/periods; use a
  pipe "|" for `<title>` suffixes. Ampersands are fine in proper names.
- **We are a directory, not a vetting/referral service.** Never claim we vet,
  verify, screen, endorse, or recommend listings. No "vetted"/"verified ratings".
  Listings are aggregated from public sources; a claim is owner-claimed only.
- Made by **Artivicolab** (artivicolab.com); contact `artivicolab@gmail.com` is a
  `mailto` target only and is **never shown as visible text**.

## Conventions

- `id`/slugs are stable URL keys — never change a live one. `city` must match a
  slug; `type` must be a label from `categories.js`.
- Site text stays selectable/copyable (sharing + SEO).
- Footer credits **Artivicolab**; contact via that site, never the gmail.
- Deploy = `git push` to `main` → GitHub Pages.
