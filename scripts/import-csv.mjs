// GA.Lawyers importer: Bing Maps scraper CSV(s) → durable in-project store
// → js/data/lawyers-imported.js.
//
//   node scripts/import-csv.mjs a.csv b.csv     # specific CSV files
//   node scripts/import-csv.mjs                  # all ~/Downloads/Bing_Maps_Scraper_*.csv
//                                                 (non-law rows are filtered out)
//
// DURABLE STORE: each kept row is MERGED into data/cities/*.json (one file per
// city, committed to the repo, deduped by ID then name+address). New CSVs only
// ADD — nothing is lost when ~/Downloads is cleared. The store holds ONLY GA
// LAW-PRACTICE rows; off-vertical scrapes are filtered at ingest (isLawyerRow)
// and never warehoused.
//
// PRACTICE AREA (`type`) comes from the scraped Category + the business NAME,
// matched against the `synonyms` in js/data/categories.js. Name-first inference
// makes generic "Lawyer" rows land on a real area when the name reveals one
// (e.g. "Nelson Elder Care Law" → Estate & Elder).
//
// NOTE: the scraper only has a relative "Open Hours" string → imported rows get
// `hoursText` (display) only, NOT the weekly `hours` a live open/closed status
// needs, and `verified:false` (the Bar-verified badge is granted manually).

import { writeFileSync, readFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  kebab, inferType, entityKindOf, isGA, isLawyerRow, rowsOf,
  cityNameFromAddr, citySlugOf, rawKey, JUNK_EMAIL, JUNK_LOCAL,
} from './gate.mjs';

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

const DOWNLOADS = `${process.env.HOME}/Downloads`;
const SRCS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (existsSync(DOWNLOADS) ? readdirSync(DOWNLOADS) : [])
      .filter(f => /^Bing_Maps_Scraper_.*\.csv$/i.test(f)).sort().map(f => join(DOWNLOADS, f));

const STORE_DIR = fileURLToPath(new URL('../data/cities/', import.meta.url));

let store = [];
if (existsSync(STORE_DIR)) {
  for (const f of readdirSync(STORE_DIR)) {
    if (!f.endsWith('.json')) continue;
    try { store.push(...JSON.parse(readFileSync(join(STORE_DIR, f), 'utf8'))); } catch { /* skip */ }
  }
}
const storeMap = new Map();
for (const r of store) storeMap.set(rawKey(r), r);
const priorKeys = new Set(store.filter(isLawyerRow).map(rawKey));

const todayISO = new Date().toISOString().slice(0, 10);
const csvRows = SRCS.flatMap(rowsOf);
for (const r of csvRows) {
  // a fresh scrape refreshes Bing fields but KEEPS our editable monetization
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

// ─── build listings from the full durable store ──────────────────────────────
const stats = { files: SRCS.length, store: kept.length, added: addedToStore, pruned: prunedOff, nonGA: 0, off: 0, dupes: 0 };
const seenId = new Set(), seenKey = new Set();
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
  const key = `${nm}|${addr}`.toLowerCase();
  if (seenKey.has(key)) { stats.dupes++; continue; }
  seenKey.add(key);

  const cityName = cityNameFromAddr(addr);
  if (!cityName) { stats.noCity = (stats.noCity || 0) + 1; continue; }
  // Prefer the zip right after the state ("…, GA 30060"); fall back to the last
  // 5-digit group. Validate it's a real GA range (300xx–319xx, 398xx–399xx) so a
  // 5-digit street number never becomes a bogus zip page.
  const zipCand = (addr.match(/\bGA\s+(\d{5})\b/) || [])[1]
    || (addr.match(/(\d{5})(?:-\d{4})?\s*$/) || [])[1]
    || (addr.match(/\b(\d{5})\b/g) || []).pop();
  const zip = zipCand && /^(3[01]\d{3}|39[89]\d{2})$/.test(zipCand) ? zipCand : null;
  // merged reviews across every source we have seen for this listing
  const ratings = (r.ratings && r.ratings.length) ? r.ratings : (ratingOf(r) ? [ratingOf(r)] : []);
  const reviews = ratings.reduce((s, x) => s + (x.reviews || 0), 0) || null;
  // rating = review-weighted average so a 50-review 4.0 outweighs a 1-review 5.0
  const wnum = ratings.reduce((s, x) => s + x.rating * ((x.reviews || 0) + 1), 0);
  const wden = ratings.reduce((s, x) => s + ((x.reviews || 0) + 1), 0);
  const rating = wden ? Math.round((wnum / wden) * 10) / 10 : null;

  let email = null;
  for (const e of (r['Emails'] || '').split(',').map(s => s.trim())) {
    if (!e || e.includes('###') || JUNK_EMAIL.test(e) || JUNK_LOCAL.test(e)) continue;
    email = e; break;
  }

  out.push({
    id: kebab(`${nm}-${cityName}`).slice(0, 60),
    name: nm, city: kebab(cityName), cityName, type, entity: entityKindOf(nm),
    tier: r.tier || 'free', paid: r.paid || false, paidAt: r.paidAt || null, paidDays: r.paidDays || 30,
    verified: r.verified || false, barNo: r.barNo || null,
    rating, reviews, ratings, zip,
    lat: parseFloat(r['Latitude']) || null, lng: parseFloat(r['Longitude']) || null,
    address: addr, phone: r['Phone'] || null, website: r['Website'] || null, email,
    image: r['Featured image'] || null, hoursText: r['Open Hours'] || null,
    facebook: r['Facebook'] || null, instagram: r['Instagram'] || null, twitter: r['Twitter'] || null,
  });
}

// guard id collisions → suffix
const ids = new Set();
for (const s of out) { let id = s.id, n = 2; while (ids.has(id)) id = `${s.id}-${n++}`; s.id = id; ids.add(id); }

out.sort((a, b) => a.cityName.localeCompare(b.cityName) || (b.rating ?? -1) - (a.rating ?? -1) || (b.reviews ?? -1) - (a.reviews ?? -1));

writeFileSync(
  new URL('../js/data/lawyers-imported.js', import.meta.url),
  '// AUTO-GENERATED by scripts/import-csv.mjs — do not edit by hand.\n' +
  'export const IMPORTED = ' + JSON.stringify(out, null, 2) + ';\n'
);

// ─── report ──────────────────────────────────────────────────────────────────
const byCity = {}, byType = {}, byEntity = {};
for (const s of out) {
  byCity[s.cityName] = (byCity[s.cityName] || 0) + 1;
  byType[s.type] = (byType[s.type] || 0) + 1;
  byEntity[s.entity] = (byEntity[s.entity] || 0) + 1;
}
console.log(`Store: ${stats.store} law rows across ${Object.keys(byCityStore).length} per-city files in data/cities/ (+${stats.added} new from ${stats.files} CSV(s); pruned ${stats.pruned} off-vertical rows).`);
console.log(`Imported ${out.length} GA law practices from the store.`);
console.log(`  dropped: ${stats.nonGA} non-GA, ${stats.off} off-vertical, ${stats.dupes} dupes`);
console.log(`  entity:`, byEntity);
console.log(`  types:`, byType);
console.log(`  cities: ${Object.keys(byCity).length}`);
for (const [c, n] of Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`    ${String(n).padStart(3)}  ${c}`);
console.log(`\nwrote js/data/lawyers-imported.js`);
