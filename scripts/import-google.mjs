// GA.Lawyers importer: Maps-Scraper-net (Google) CSV(s) → durable in-project store
// → js/data/lawyers-imported.js.
//
//   node scripts/import-google.mjs a.csv b.csv   # specific CSV files
//   node scripts/import-google.mjs                # all ~/Downloads/Maps-Scraper-net_*.csv
//
// SEPARATE from the Bing importer (scripts/import-csv.mjs) only because the CSV
// dialect differs: this scraper uses `Fulladdress`/`Categories`/`Average Rating`/
// `Review Count`/`Opening hours`/`Place Id` instead of Bing's column names. We map
// those to the CANONICAL row shape and hand off to the SAME shared store + build
// core (scripts/import-lib.mjs), so Bing and Google feed ONE unified directory.
//
// DEDUPE: a firm already in the store (from Bing or a prior Google run) is matched
// by name + city slug and SKIPPED, so cross-source duplicates never become two
// cards. Only genuinely new GA law practices are added. Re-running is idempotent.
//
// Like the Bing scrape, rows get `hoursText` (display only, no weekly `hours`) and
// `verified:false` (the Bar badge is granted manually, never from the scrape).

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { rowsOf, isLawyerRow, citySlugOf, kebab } from './gate.mjs';
import { loadStore, buildStore } from './import-lib.mjs';

const DOWNLOADS = `${process.env.HOME}/Downloads`;
const SRCS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (existsSync(DOWNLOADS) ? readdirSync(DOWNLOADS) : [])
      .filter(f => /^Maps-Scraper-net_.*\.csv$/i.test(f)).sort().map(f => join(DOWNLOADS, f));

// The scraper leaves un-enriched cells as this sentinel — treat it as empty.
const clean = (v) => { v = (v || '').trim(); return v === '*** Waiting for processing ***' ? '' : v; };

// Map one Google (Maps-Scraper-net) row → the CANONICAL row shape that gate.mjs
// and import-lib.mjs expect (Bing-style field names).
function toCanonical(g) {
  const rating = clean(g['Average Rating']);
  const reviews = clean(g['Review Count']);
  const website = clean(g['Website']);
  return {
    ID: clean(g['Place Id']) || clean(g['Cid']),
    Name: clean(g['Name']),
    Address: clean(g['Fulladdress']),
    Category: clean(g['Categories']),
    Phone: clean(g['Phone']),
    // some rows carry a templated junk website ("https://{}/?utm_campaign=gmb")
    Website: website.includes('{}') ? '' : website,
    Latitude: clean(g['Latitude']),
    Longitude: clean(g['Longitude']),
    Rating: rating,
    // synthesize the "Source (count)" form the shared ratingOf() parses
    'Rating Info': rating ? (reviews ? `Google (${reviews})` : 'Google') : '',
    Emails: clean(g['Email']),
    'Featured image': clean(g['Featured image']),
    'Open Hours': clean(g['Opening hours']),
    Facebook: clean(g['Facebook']),
    Instagram: clean(g['Instagram']),
    Twitter: clean(g['Twitter']),
  };
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cityKey = (r) => `${norm(r.Name)}|${citySlugOf(r)}`;

// firms already warehoused (Bing or a prior Google run), keyed by name + city
const have = new Set(loadStore().filter(isLawyerRow).map(cityKey));

const all = SRCS.flatMap(rowsOf).map(toCanonical).filter(r => r.Name && isLawyerRow(r));
const seen = new Set();
const fresh = [];
let skippedExisting = 0, skippedDupeInFile = 0;
for (const r of all) {
  const k = cityKey(r);
  if (have.has(k)) { skippedExisting++; continue; }      // already in the directory
  if (seen.has(k)) { skippedDupeInFile++; continue; }    // dupe within this file
  seen.add(k); fresh.push(r);
}

console.log(`Google scrape: ${all.length} GA law rows · ${skippedExisting} already in directory · ${skippedDupeInFile} in-file dupes · ${fresh.length} new to add.\n`);
buildStore(fresh, SRCS.length, 'Google CSV');
