// gate.mjs — shared ingest logic for the Bing Maps scraper CSVs.
// Used by import-csv.mjs (merge + write) and scan-downloads.mjs (classify files).
//
// The gate keeps ONLY GA law-practice rows. Practice-area inference is name-first
// and uses WORD-BOUNDARY matching, so bare synonyms ("law", "legal") can't false
// match substrings like "lawn", "Lawrence", or "outlaw" when scanning mixed
// folders that also hold non-law scrapes.

import { readFileSync } from 'node:fs';
import { CATEGORIES } from '../js/data/categories.js';

export const kebab = (s) => (s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const wb = (syn) => new RegExp('\\b' + syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
const SPECIFIC = CATEGORIES.filter(c => c.slug !== 'general-practice')
  .map(c => ({ type: c.type, res: [...c.synonyms].sort((a, b) => b.length - a.length).map(wb) }));
const GENERAL = CATEGORIES.find(c => c.slug === 'general-practice');
const GENERAL_RES = GENERAL.synonyms.map(wb);

const NAME_EXCLUDE = /\b(bail bonds?|bondsman|process serv\w*|court(house|s)?|clerk of court|paralegal|legal document\w*|document prep\w*|form prep\w*|law school|law enforcement|child support enforcement|district attorney|public defenders?|attorney general|solicitor.?general|marshal'?s? office|notary|title pawn|insurance agency|real estate (agent|broker|agency)|realty|realtor)\b/i;

// Non-attorney legal-support businesses (paralegals, document/form-prep) are not
// lawyers and must never enter the directory. The Bing Category is the clean tell.
const CATEGORY_EXCLUDE = /\bparalegal\b/i;

// Whole business TYPES that are never a law practice. Many such rows still carry
// "law"/"legal" in their NAME (so name-first inference matched them), but the
// scraped Category gives them away: accountants, tax preparers, insurance and real
// estate agencies, government offices (incl. District Attorneys), private
// investigators, security guards, schools, financial advisors, etc. Reject those
// UNLESS the category itself names a lawyer (so a firm that also lists another
// service survives) OR the NAME is unmistakably a law practice ("… Law Firm").
const NON_LAWYER_CAT = /\b(tax preparation|tax consultant|certified public accountant|accountant|accounting firm|bookkeep\w*|insurance (agency|broker)|real estate|realtor|driving school|fingerprint\w*|notary public|process server|courier|marketing (agency|consultant)|private investigat\w*|security (guard|service)|training cent(er|re)|government office|financial (service|consultant|planner|advis\w+)|mediation service|divorce (service|coach\w*))\b/i;
const CAT_IS_LAWYER = /\b(lawyer|attorney|law)\b/i;
const NAME_IS_LAWFIRM = /\b(law (firm|office|offices|group)|attorneys? at law|esq|law (llc|pllc|p\.?c\.?))\b/i;

// Well-known firms whose scraped Category is sometimes blank and whose brand name
// carries no practice-area word, so name-first inference would otherwise miss them
// and drop them as "off-vertical". Matched by NAME so a major firm is never lost.
// Extend this list freely as new brands show up.
const KNOWN_FIRMS = [
  [/\bmorgan\s*(?:&|and)\s*morgan\b/i, 'Personal Injury Lawyer'],
  [/\balexander\s+shunnarah\b/i, 'Personal Injury Lawyer'],
  [/\bken(?:neth)?\s+(?:s\.?\s+)?nugent\b/i, 'Personal Injury Lawyer'],
  [/\bmontlick\b/i, 'Personal Injury Lawyer'],
  [/\bjohn\s+foy\b/i, 'Personal Injury Lawyer'],
  [/\bgary\s+martin\s+hays\b/i, 'Personal Injury Lawyer'],
  [/\bweinstein\s+firm\b/i, 'Personal Injury Lawyer'],
  [/\bwitherite\b|1\s*-?\s*800\s*-?\s*truck\s*-?\s*wreck/i, 'Personal Injury Lawyer'],
];
export const knownFirmType = (name) => { for (const [re, t] of KNOWN_FIRMS) if (re.test(name || '')) return t; return null; };

export function inferType(name, category) {
  const hay = `${name} ${category}`;
  for (const t of SPECIFIC) if (t.res.some(re => re.test(hay))) return t.type;
  if (GENERAL_RES.some(re => re.test(hay))) return GENERAL.type;
  return knownFirmType(name);   // last resort: well-known firms with a blank category
}

const ATTY = /\battorney(?!s)\b|\besq\b|attorney at law|law office of|offices of\b/i;
const FIRM = /\b(firm|group|associates|llp|llc|pllc|p\.?\s?c\.?|&|\band\b|attorneys)\b/i;
export function entityKindOf(name) {
  if (ATTY.test(name)) return 'attorney';
  if (FIRM.test(name)) return 'firm';
  if (/\b(lawyers?|legal|law)\b/i.test(name)) return 'firm';
  return 'attorney';
}

export const stateOf = (addr) => (addr || '').split(',').pop().trim().split(/\s+/)[0];
export const isGA = (addr) => { const s = stateOf(addr); return s === 'GA' || s === 'Georgia'; };

export function isLawyerRow(r) {
  const addr = r['Address'] || '';
  if (!isGA(addr)) return false;
  const nm = r['Name'] || '';
  if (!nm) return false;
  if (NAME_EXCLUDE.test(nm)) return false;
  const cat = r['Category'] || '';
  if (CATEGORY_EXCLUDE.test(cat)) return false;
  // reject non-lawyer business types (by category) unless the category itself or
  // the name says it's a law practice
  if (NON_LAWYER_CAT.test(cat) && !CAT_IS_LAWYER.test(cat) && !NAME_IS_LAWFIRM.test(nm)) return false;
  return inferType(nm, cat) != null;
}

// Bing sometimes truncates long city names in the scraped address ("Peachtree
// Corners" → "Peachtree Cor"). Normalize known truncations so they don't spawn a
// junk duplicate city each re-scrape. Keyed by the lowercased truncated form.
const CITY_FIXUPS = {
  'peachtree cor': 'Peachtree Corners',
};
export const cityNameFromAddr = (addr) => {
  const parts = (addr || '').split(',').map(s => s.trim());
  const raw = parts.length >= 2 ? parts[parts.length - 2] : '';
  const clean = raw.replace(/^private address in\s*/i, '').replace(/^private address.*$/i, '').trim();
  return CITY_FIXUPS[clean.toLowerCase()] || clean;
};
export const citySlugOf = (r) => kebab(cityNameFromAddr(r['Address'])) || '_unknown';
export const rawKey = (r) => ((r['ID'] || '').trim()) || `${(r['Name'] || '').toLowerCase()}|${(r['Address'] || '').toLowerCase()}`;

export const JUNK_EMAIL = /(stripe|zoca|chargebee|yelp|vagaro|twilio|microsoft|mixpanel|uxcam|moengage|imagekit|styleseat|clarity|birdeye|wix\.|squarespace|godaddy|sentry|cloudflare|gmail\.com|hotmail|yahoo\.com|naver|uol\.com|aol\.com)/i;
export const JUNK_LOCAL = /^(privacy|unsubscribe|webmaster|legal|people|help|ir|support|dataprotection|quality|web|noreply|no-reply|admin|info|contact|team|hello|office|intake|billing|orders|feedback|careers|booking)/i;

// ─── minimal RFC-4180 CSV parser ─────────────────────────────────────────────
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
// Some scrapes come from a different Maps tool (e.g. "Maps-Scraper-net") whose
// columns carry the same data under different headers. Normalize those onto the
// canonical Bing field names the importer reads, so every downstream step (gate,
// store, ratings, stars) is schema-agnostic. Canonical Bing rows already have
// these keys, so this is a no-op for them. `Rating Info` is synthesized as
// "Google (<count>)" because that tool's ratings are Google Maps data, which keeps
// the review count and lets mergeRating accumulate it as a distinct source.
function normalizeRow(r) {
  if (!r['Address'] && r['Fulladdress']) r['Address'] = r['Fulladdress'];
  if (!r['Category'] && r['Categories']) r['Category'] = r['Categories'];
  if (!r['ID']) r['ID'] = r['Place Id'] || r['Cid'] || '';
  if (!r['Rating'] && r['Average Rating']) r['Rating'] = r['Average Rating'];
  if (!r['Open Hours'] && r['Opening hours']) r['Open Hours'] = r['Opening hours'];
  if (!r['Emails'] && r['Email']) r['Emails'] = r['Email'];
  if (!r['Rating Info'] && r['Average Rating']) {
    const n = (r['Review Count'] || '').replace(/[^\d]/g, '');
    r['Rating Info'] = `Google (${n || 0})`;
  }
  return r;
}

export function rowsOf(path) {
  const raw = parseCSV(readFileSync(path, 'utf8')).filter(r => r.length > 5);
  const header = raw.shift().map(h => h.trim().replace(/^﻿/, '').replace(/^"|"$/g, ''));
  return raw.map(r => normalizeRow(Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()]))));
}
