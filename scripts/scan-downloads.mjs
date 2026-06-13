// scan-downloads.mjs — classify which ~/Downloads/Bing_Maps_Scraper_*.csv files
// are LAWYER scrapes (vs the contractors project's CSVs in the same folder).
//
//   node scripts/scan-downloads.mjs            # human-readable report
//   node scripts/scan-downloads.mjs --list     # print lawyer-file paths only
//
// A file is a "lawyer file" when a strong majority of its GA rows pass the law
// gate. Prints share so you can eyeball borderline scrapes.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { rowsOf, isLawyerRow } from './gate.mjs';

const DOWNLOADS = `${process.env.HOME}/Downloads`;
const LIST_ONLY = process.argv.includes('--list');
const MIN_ROWS = 8;       // ignore tiny files
const MIN_SHARE = 0.6;    // ≥60% law rows → a lawyer scrape

const files = readdirSync(DOWNLOADS)
  .filter(f => /^Bing_Maps_Scraper_.*\.csv$/i.test(f)).sort();

const lawyerFiles = [];
const report = [];
for (const f of files) {
  const path = join(DOWNLOADS, f);
  let rows;
  try { rows = rowsOf(path); } catch { continue; }
  const total = rows.length;
  if (!total) continue;
  const law = rows.filter(isLawyerRow).length;
  const share = law / total;
  const isLawyer = law >= MIN_ROWS && share >= MIN_SHARE;
  if (isLawyer) lawyerFiles.push(path);
  report.push({ f, total, law, share, isLawyer });
}

if (LIST_ONLY) { for (const p of lawyerFiles) console.log(p); process.exit(0); }

report.sort((a, b) => b.law - a.law);
console.log(`Scanned ${files.length} Bing CSV(s) in ~/Downloads.\n`);
console.log('LAWYER FILES (law rows / total, share):');
for (const r of report.filter(r => r.isLawyer))
  console.log(`  ✓ ${String(r.law).padStart(3)}/${String(r.total).padEnd(3)} ${(r.share * 100).toFixed(0).padStart(3)}%  ${r.f}`);
const other = report.filter(r => !r.isLawyer && r.law > 0);
if (other.length) {
  console.log('\nother files with a few law rows (NOT tagged, but their law rows still import):');
  for (const r of other.slice(0, 12))
    console.log(`    ${String(r.law).padStart(3)}/${String(r.total).padEnd(3)} ${(r.share * 100).toFixed(0).padStart(3)}%  ${r.f}`);
}
console.log(`\n${lawyerFiles.length} lawyer file(s).`);
