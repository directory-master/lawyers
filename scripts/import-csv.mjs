// GA.Lawyers importer: Bing Maps scraper CSV(s) → durable in-project store
// → js/data/lawyers-imported.js.
//
//   node scripts/import-csv.mjs a.csv b.csv     # specific CSV files
//   node scripts/import-csv.mjs                  # all ~/Downloads/Bing_Maps_Scraper_*.csv
//                                                 (non-law rows are filtered out)
//
// For the Google (Maps-Scraper-net) dialect use the SEPARATE scripts/import-google.mjs.
// Both share the durable store + build core in scripts/import-lib.mjs.
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

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { rowsOf } from './gate.mjs';
import { buildStore } from './import-lib.mjs';

const DOWNLOADS = `${process.env.HOME}/Downloads`;
const SRCS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (existsSync(DOWNLOADS) ? readdirSync(DOWNLOADS) : [])
      .filter(f => /^Bing_Maps_Scraper_.*\.csv$/i.test(f)).sort().map(f => join(DOWNLOADS, f));

buildStore(SRCS.flatMap(rowsOf), SRCS.length, 'CSV');
