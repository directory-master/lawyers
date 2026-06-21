// Shared ingest core for BOTH importers:
//   import-csv.mjs    → Bing Maps scraper CSVs
//   import-google.mjs → Maps-Scraper-net (Google) CSVs
//
// Each importer parses its own CSV dialect into CANONICAL rows (Bing-style field
// names: Name, Address, Category, Phone, Website, Latitude, Longitude, Rating,
// Rating Info, Emails, Featured image, Open Hours, Facebook, Instagram, Twitter,
// ID) and then calls buildStore(rows, fileCount).
//
// The durable per-city store in data/cities/ is the SINGLE shared warehouse —
// both sources merge into it (deduped by ID then name+address) and the unified
// js/data/lawyers-imported.js is rebuilt from the whole store every run. Editable
// monetization fields (tier/paid/verified) are preserved across re-imports.

import { writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  kebab, inferType, entityKindOf, isGA, isLawyerRow,
  cityNameFromAddr, citySlugOf, rawKey, JUNK_EMAIL, JUNK_LOCAL,
} from './gate.mjs';

const STORE_DIR = fileURLToPath(new URL('../data/cities/', import.meta.url));

// ─── reviews: one rating PER SOURCE, merged across scrapes ────────────────────
// Each scrape row carries a single rating from a single source ("Avvo (25)").
// Re-scraping the same firm may surface a DIFFERENT source, so we accumulate a
// `ratings` array on the stored row instead of overwriting, then aggregate.
const NORM_SOURCE = { google: 'Google', bing: 'Bing', 'yellow pages': 'Yellowpages' };
function ratingOf(r) {
  const val = parseFloat(r['Rating']);
  if (!val) return null;
  const m = (r['Rating Info'] || '').match(/^(.+?)\s*\((\d[\d,]*)\)\s*$/);
  let source = m ? m[1].trim() : null;
  if (source) source = NORM_SOURCE[source.toLowerCase()] || source;
  const reviews = m ? parseInt(m[2].replace(/,/g, ''), 10) || null : null;
  return { source, rating: val, reviews };
}
const srcKey = (rec) => (rec && rec.source ? rec.source : 'rating').toLowerCase();
function mergeRating(ratings, rec) {
  if (!rec) return ratings;
  const i = ratings.findIndex((x) => srcKey(x) === srcKey(rec));
  if (i >= 0) ratings[i] = rec; else ratings.push(rec);
  return ratings;
}

// Aggregate a multi-source ratings list into one display rating + total reviews.
// Reviews ADD UP across sources; the star rating is the review-weighted average so
// a 116-review 4.4 outweighs a 1-review 5.0.
function aggRatings(ratings) {
  const reviews = ratings.reduce((s, x) => s + (x.reviews || 0), 0) || null;
  const wnum = ratings.reduce((s, x) => s + x.rating * ((x.reviews || 0) + 1), 0);
  const wden = ratings.reduce((s, x) => s + ((x.reviews || 0) + 1), 0);
  const rating = wden ? Math.round((wnum / wden) * 10) / 10 : null;
  return { rating, reviews };
}
// Business status from the scrape WHEN the source provides it: Google's
// "Business Status" (OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY), a
// boolean "Permanently/Temporarily Closed" column, or a plain "Temporarily closed"
// in the hours/status cell. Returns 'open' otherwise. NOTE: the current
// Maps-Scraper-net / Bing dialects do NOT export this field, so everything reads
// 'open' until the export includes it — this is the plumbing, ready for that data.
function statusOf(r) {
  const s = `${r['Business Status'] || r['Status'] || r['business_status'] || ''}`.toUpperCase();
  const flag = (v) => /^(true|yes|1)$/i.test(`${v || ''}`.trim());
  const h = `${r['Open Hours'] || ''}`.trim();
  if (/PERMANENT/.test(s) || flag(r['Permanently Closed']) || /^permanently closed$/i.test(h)) return 'permanently_closed';
  if (/TEMPORAR/.test(s) || flag(r['Temporarily Closed']) || /^temporarily closed$/i.test(h)) return 'temporarily_closed';
  return 'open';
}
const RANK_CLOSED = { open: 0, temporarily_closed: 1, permanently_closed: 2 };

function pickEmail(raw) {
  for (const e of (raw || '').split(',').map((s) => s.trim())) {
    if (!e || e.includes('###') || JUNK_EMAIL.test(e) || JUNK_LOCAL.test(e)) continue;
    return e;
  }
  return null;
}

// Load every row already warehoused in data/cities/ (raw scraper shape). Importers
// use this to skip rows that already exist before merging a new source.
export function loadStore() {
  const store = [];
  if (existsSync(STORE_DIR)) {
    for (const f of readdirSync(STORE_DIR)) {
      if (!f.endsWith('.json')) continue;
      try { store.push(...JSON.parse(readFileSync(join(STORE_DIR, f), 'utf8'))); } catch { /* skip */ }
    }
  }
  return store;
}

// Merge canonical rows into the durable store, rebuild data/cities/*.json, then
// rebuild js/data/lawyers-imported.js from the full store. `label` names the source
// for the console report. Returns the out[] listings written.
export function buildStore(csvRows, fileCount, label = 'CSV') {
  const store = loadStore();
  const storeMap = new Map();
  for (const r of store) storeMap.set(rawKey(r), r);
  const priorKeys = new Set(store.filter(isLawyerRow).map(rawKey));

  const todayISO = new Date().toISOString().slice(0, 10);
  for (const r of csvRows) {
    // a fresh scrape refreshes scraped fields but KEEPS our editable monetization
    // fields, so re-importing never un-pays a listing or resets its clock.
    const prev = storeMap.get(rawKey(r));
    r.paid = prev?.paid ?? false;
    r.tier = prev?.tier ?? 'free';
    r.paidAt = prev?.paidAt ?? null;
    r.paidDays = prev?.paidDays ?? 30;
    r.verified = prev?.verified ?? false;   // Bar-verified, granted manually — never from the scrape
    r.barNo = prev?.barNo ?? null;
    r.addedAt = prev?.addedAt ?? todayISO;
    // merge this scrape's rating into the running per-source list (no overwrite)
    r.ratings = mergeRating([...(prev?.ratings || [])], ratingOf(r));
    storeMap.set(rawKey(r), r);
  }
  for (const r of storeMap.values()) {
    r.paid ??= false; r.tier ??= 'free'; r.paidDays ??= 30; r.paidAt ??= null;
    r.verified ??= false; r.addedAt ??= todayISO;
    if (r.paid && !r.paidAt) r.paidAt = todayISO;
    if (!r.paid) r.paidAt = null;
    // backfill ratings for store rows not seen in this run (e.g. older imports)
    if (!r.ratings) { const rec = ratingOf(r); r.ratings = rec ? [rec] : []; }
  }
  const merged = [...storeMap.values()];
  const kept = merged.filter(isLawyerRow);
  const prunedOff = merged.length - kept.length;

  // rewrite the per-city store from scratch (one object per line for easy edits)
  rmSync(STORE_DIR, { recursive: true, force: true });
  mkdirSync(STORE_DIR, { recursive: true });
  const byCityStore = {};
  for (const r of kept) (byCityStore[citySlugOf(r)] ??= []).push(r);
  for (const [slug, rows] of Object.entries(byCityStore)) {
    writeFileSync(join(STORE_DIR, `${slug}.json`), '[\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n]\n');
  }
  const addedToStore = kept.filter(r => !priorKeys.has(rawKey(r))).length;

  // ─── build listings from the full durable store ────────────────────────────
  const stats = { files: fileCount, store: kept.length, added: addedToStore, pruned: prunedOff, nonGA: 0, off: 0, dupes: 0 };
  const seenId = new Set(), byKey = new Map();
  const out = [];
  for (const r of kept) {
    const id = r['ID'];
    if (id && seenId.has(id)) { stats.dupes++; continue; }
    if (id) seenId.add(id);
    const addr = r['Address'] || '';
    if (!isGA(addr)) { stats.nonGA++; continue; }
    const nm = r['Name'] || '';
    const type = inferType(nm, r['Category'] || '');
    if (!type) { stats.off++; continue; }
    // Cross-source dedup: the SAME firm from Google and Bing arrives as two store
    // rows with different scraper IDs and slightly different strings ("St" vs
    // "Street", "&" vs "and"), so an exact name+address match misses them. Key on
    // normalized name + phone instead, which collapses those into one card while
    // NOT merging distinct entities that merely share an office line (a firm and an
    // attorney) — the name guards that. Fall back to name+address when no phone.
    const lnName = nm.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
    const phoneKey = (r['Phone'] || '').replace(/[^0-9]/g, '').slice(-10);
    const key = phoneKey ? `${lnName}|${phoneKey}` : `${lnName}|${addr.toLowerCase()}`;
    // this row's rating source(s); cloned so merging never mutates the store row
    const ratings = (r.ratings && r.ratings.length) ? [...r.ratings] : (ratingOf(r) ? [ratingOf(r)] : []);
    // Same firm re-scraped from a different tool (an old Bing row plus a fresh
    // Google row) carries a different scraper ID, so it arrives as a second store
    // row. Don't drop it: union its rating sources into the listing we already
    // kept so Google reviews ADD to the running count and re-weight the stars, and
    // backfill any scraped field the first row was missing.
    if (byKey.has(key)) {
      const keep = byKey.get(key);
      for (const rec of ratings) keep.ratings = mergeRating(keep.ratings, rec);
      Object.assign(keep, aggRatings(keep.ratings));
      keep.image ||= r['Featured image'] || null;
      keep.hoursText ||= r['Open Hours'] || null;
      keep.phone ||= r['Phone'] || null;
      keep.website ||= r['Website'] || null;
      keep.facebook ||= r['Facebook'] || null;
      keep.instagram ||= r['Instagram'] || null;
      keep.twitter ||= r['Twitter'] || null;
      if (keep.lat == null) keep.lat = parseFloat(r['Latitude']) || null;
      if (keep.lng == null) keep.lng = parseFloat(r['Longitude']) || null;
      if (!keep.email) keep.email = pickEmail(r['Emails']);
      // if either source row was manually paid/verified, the merged card keeps it
      if (r.paid && !keep.paid) { keep.paid = true; keep.tier = r.tier || keep.tier; keep.paidAt = r.paidAt || keep.paidAt; keep.paidDays = r.paidDays || keep.paidDays; }
      if (r.verified && !keep.verified) { keep.verified = true; keep.barNo = keep.barNo || r.barNo; }
      // surface a closure reported by either source (most-closed wins)
      const st = statusOf(r);
      if (RANK_CLOSED[st] > RANK_CLOSED[keep.status || 'open']) keep.status = st === 'open' ? undefined : st;
      stats.merged = (stats.merged || 0) + 1;
      continue;
    }

    const cityName = cityNameFromAddr(addr);
    if (!cityName) { stats.noCity = (stats.noCity || 0) + 1; continue; }
    // Prefer the zip right after the state ("…, GA 30060"); fall back to the last
    // 5-digit group. Validate it's a real GA range (300xx–319xx, 398xx–399xx) so a
    // 5-digit street number never becomes a bogus zip page.
    const zipCand = (addr.match(/\bGA\s+(\d{5})\b/) || [])[1]
      || (addr.match(/(\d{5})(?:-\d{4})?\s*$/) || [])[1]
      || (addr.match(/\b(\d{5})\b/g) || []).pop();
    const zip = zipCand && /^(3[01]\d{3}|39[89]\d{2})$/.test(zipCand) ? zipCand : null;
    // review-weighted rating + total reviews across every source seen so far; later
    // dupe rows (same firm, other source) fold their reviews in via aggRatings above
    const { rating, reviews } = aggRatings(ratings);

    const listing = {
      id: kebab(`${nm}-${cityName}`).slice(0, 60),
      name: nm, city: kebab(cityName), cityName, type, entity: entityKindOf(nm),
      tier: r.tier || 'free', paid: r.paid || false, paidAt: r.paidAt || null, paidDays: r.paidDays || 30,
      verified: r.verified || false, barNo: r.barNo || null,
      rating, reviews, ratings, zip,
      lat: parseFloat(r['Latitude']) || null, lng: parseFloat(r['Longitude']) || null,
      address: addr, phone: r['Phone'] || null, website: r['Website'] || null, email: pickEmail(r['Emails']),
      image: r['Featured image'] || null, hoursText: r['Open Hours'] || null,
      facebook: r['Facebook'] || null, instagram: r['Instagram'] || null, twitter: r['Twitter'] || null,
    };
    const st = statusOf(r);
    if (st !== 'open') listing.status = st;   // only stamped when actually closed
    out.push(listing);
    byKey.set(key, listing);
  }

  // guard id collisions → suffix
  const ids = new Set();
  for (const s of out) { let id = s.id, n = 2; while (ids.has(id)) id = `${s.id}-${n++}`; s.id = id; ids.add(id); }

  out.sort((a, b) => a.cityName.localeCompare(b.cityName) || (b.rating ?? -1) - (a.rating ?? -1) || (b.reviews ?? -1) - (a.reviews ?? -1));

  writeFileSync(
    new URL('../js/data/lawyers-imported.js', import.meta.url),
    '// AUTO-GENERATED by scripts/import-csv.mjs / import-google.mjs — do not edit by hand.\n' +
    'export const IMPORTED = ' + JSON.stringify(out, null, 2) + ';\n'
  );

  // ─── report ────────────────────────────────────────────────────────────────
  const byCity = {}, byType = {}, byEntity = {};
  for (const s of out) {
    byCity[s.cityName] = (byCity[s.cityName] || 0) + 1;
    byType[s.type] = (byType[s.type] || 0) + 1;
    byEntity[s.entity] = (byEntity[s.entity] || 0) + 1;
  }
  console.log(`Store: ${stats.store} law rows across ${Object.keys(byCityStore).length} per-city files in data/cities/ (+${stats.added} new from ${stats.files} ${label}(s); pruned ${stats.pruned} off-vertical rows).`);
  console.log(`Imported ${out.length} GA law practices from the store.`);
  console.log(`  dropped: ${stats.nonGA} non-GA, ${stats.off} off-vertical, ${stats.dupes} dupes; merged ${stats.merged || 0} same-firm rows (reviews added up)`);
  console.log(`  entity:`, byEntity);
  console.log(`  types:`, byType);
  console.log(`  cities: ${Object.keys(byCity).length}`);
  for (const [c, n] of Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`    ${String(n).padStart(3)}  ${c}`);
  console.log(`\nwrote js/data/lawyers-imported.js`);
  return out;
}
