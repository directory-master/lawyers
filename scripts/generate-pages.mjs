// generate-pages.mjs — STATIC SEO GENERATOR.
//
// The live SPA (js/app.js) renders from hash routes, which crawlers don't index.
// This stamps crawlable static HTML at clean URLs so every city / county / zip /
// practice area is its own indexable page with UNIQUE, data-rich content + an FAQ
// (FAQPage rich result) + full schema:
//
//   /                            pre-rendered home (links to every hub)
//   /<city>/                     e.g. /marietta/
//   /<city>/<area>/              e.g. /marietta/personal-injury/   (the SEO grid)
//   /county/<slug>/   /area/<slug>/   /zip/<code>/   /directory/
//   + sitemap.xml, robots.txt, 404.html
//
// To avoid thin/doorway pages: pages under MIN_INDEX listings get noindex,follow.
// To avoid boilerplate: intros vary by slug + carry per-page data; each page has a
// practice-area-specific FAQ. Generator PRUNES orphaned folders each run.
//
// Run:  npm run build   (= stamp + this)

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IMPORTED } from '../js/data/lawyers-imported.js';
import { CITY_COUNTY } from '../js/data/ga-counties.js';
import { CATEGORIES, TYPE_BY_SLUG, SLUG_BY_TYPE, SUBAREAS } from '../js/data/categories.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'Georgia Lawyer Directory';
const ORIGIN = 'https://lawyers.artivicolab.com';
const YEAR = new Date().getFullYear();
const V = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const MIN_INDEX = 3;
const CONTACT = 'artivicolab@gmail.com';
const OG_IMAGE = `${ORIGIN}/background-lawyer.jpg`;
const HEAD_SOCIAL = `<meta property="og:image" content="${OG_IMAGE}"><meta property="og:image:width" content="591"><meta property="og:image:height" content="887"><meta name="twitter:image" content="${OG_IMAGE}">`;
const PRECONNECT = `<link rel="preconnect" href="https://www.bing.com" crossorigin><link rel="dns-prefetch" href="https://www.bing.com">`;
const SKIP = `<a class="skip-link" href="#main">Skip to content</a>`;
// Shown only when JavaScript is disabled. The site relies on JS for search,
// saving, filtering, and near me, so we tell the visitor to turn it on.
const NOSCRIPT = `<noscript><div class="noscript-banner">This site needs JavaScript. Please turn on JavaScript in your browser to search, save, and use ${SITE}.</div></noscript>`;
// Google Analytics 4 (gtag.js) with Consent Mode v2. Defaults analytics to
// "denied" so no GA cookies are set until the visitor accepts the cookie banner
// (static.js writes gal.consent + calls gtag consent update). Goes in every head.
const GA_ID = 'G-6PZ4N6YMGJ';
const GTAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500 });
try { if (localStorage.getItem('gal.consent') === 'granted') gtag('consent', 'update', { analytics_storage: 'granted' }); } catch (e) {}
gtag('config', '${GA_ID}');
</script>`;

// ─── helpers ──────────────────────────────────────────────────────────────────
const kebab = (s) => (s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const nf = (n) => Number(n || 0).toLocaleString('en-US');   // 1993 → "1,993"
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (s) => esc(s).replace(/'/g, '&#39;');
const stripArea = (name) => name.replace(/ (Lawyer|Attorney)$/, '');
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const pick = (seed, arr) => arr[hash(seed) % arr.length];
const a_an = (w) => /^[aeiou]/i.test(w) ? 'an' : 'a';
// <title> budget: Google shows ~60 chars. Keep the brand suffix only when the
// whole thing still fits; otherwise the keyword core wins (og:site_name still
// carries the brand on every page).
const SITE_SUFFIX = ` | ${SITE}`;
const mkTitle = (core) => core.length + SITE_SUFFIX.length <= 60 ? core + SITE_SUFFIX : core;
const lc1 = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const joinList = (arr) => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
const para = (...ps) => ps.filter(Boolean).map(p => `<p>${p}</p>`).join('');
// Cards rendered per page. Everything past the cap lives on the narrower pages
// (city×area, ZIP, county), which keeps each URL light and focused instead of a
// multi-megabyte dump of every card.
const CAP = { city: 60, cityArea: 60, county: 60, zip: 40, area: 50 };
// Count-aware truncation for the meta description / Google snippet (~155 chars).
// Trims to the last full sentence within range, else the last whole word.
const clamp = (s, max = 158) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sent = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (sent >= max * 0.5) return cut.slice(0, sent + 1).trim();
  const sp = cut.lastIndexOf(' ');
  return (sp > 0 ? cut.slice(0, sp) : cut).trim() + '…';
};

const initials = (name) => (name || '?')
  .replace(/[^A-Za-z\s]/g, ' ')                       // drop &, commas, periods, digits
  .replace(/\b(the|law|office|offices|of|firm|group|llc|llp|pc|pa|inc|associates|and|at|attorney|attorneys|esq|jr|sr|ii|iii)\b/gi, ' ')
  .trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || (name || '?').replace(/[^A-Za-z]/g, '')[0]?.toUpperCase() || '?';
const stars = (r) => { if (!r) return ''; const f = Math.floor(r), up = r - f >= .75 ? 1 : 0, h = r - f >= .25 && r - f < .75; return '★'.repeat(f + up) + (h ? '⯪' : ''); };
const telHref = (p) => p ? 'tel:' + p.replace(/[^\d+]/g, '') : null;
const mapsHref = (l) => l.lat != null ? `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address || l.name)}`;
// Mirror of js/lib/format.js: upscale tiny map thumbnails so card backgrounds
// stay crisp, and give each Call icon its own stable shake speed.
const hiResImage = (url, px = 720) => {
  if (!url) return url;
  if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+/, `=w${px}-h${px}`);
  if (url.includes('streetviewpixels-pa.googleapis.com'))
    return url.replace(/([?&]w=)\d+/, `$1${px}`).replace(/([?&]h=)\d+/, `$1${Math.round(px * 0.75)}`);
  return url;
};
const ringDur = (seed) => {
  const s = String(seed || ''); let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (1.2 + (h % 120) / 100).toFixed(2) + 's';
};
const distanceMi = (a, b) => { if (!a || !b) return Infinity; const R = 3958.8, tr = d => d * Math.PI / 180; const dLat = tr(b.lat - a.lat), dLng = tr(b.lng - a.lng); const x = Math.sin(dLat / 2) ** 2 + Math.cos(tr(a.lat)) * Math.cos(tr(b.lat)) * Math.sin(dLng / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };

// Inline SVG icons (matches js/lib/icons.js) for server-rendered markup.
const IC = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  scale: '<path d="M12 4v17"/><path d="M8 21h8"/><path d="M5 8h14"/><path d="M5 8l-2.5 5.5h5z"/><path d="M19 8l-2.5 5.5h5z"/>',
  mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  crosshair: '<circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/>',
  sparkles: '<path d="M12 3l1.9 4.8L18.7 9.7 13.9 11.6 12 16.4 10.1 11.6 5.3 9.7 10.1 7.8z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
};
const svg = (name, size = 18, fill = false) => `<span class="icon"><svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name]}</svg></span>`;
const avgRating = (list) => { const r = list.filter(l => l.rating); return r.length ? (r.reduce((s, l) => s + l.rating, 0) / r.length) : null; };

// ─── normalize + facets (mirrors js/lib/store.js) ─────────────────────────────
const LAWYERS = IMPORTED.map(l => {
  const countyName = CITY_COUNTY[l.city] || null;
  return { ...l, typeSlug: SLUG_BY_TYPE[l.type] || 'general-practice', countyName, countySlug: countyName ? kebab(countyName) : null };
});
const TIER_BOOST = { premium: 3, standard: 2, free: 0 };
const rankScore = (l) => (TIER_BOOST[l.tier] || 0) * 1000 + ((l.rating ?? 0) * (l.reviews ?? 0) + 4 * 8) / ((l.reviews ?? 0) + 8) * 100 + Math.min(l.reviews ?? 0, 50);
const byRank = (a, b) => rankScore(b) - rankScore(a) || (a.name || '').localeCompare(b.name || '');
const top = (list, n = 10) => [...list].sort(byRank).slice(0, n);
const groupEntity = (list) => ({ firm: list.filter(l => l.entity === 'firm'), attorney: list.filter(l => l.entity === 'attorney') });

function facet(keyFn, nameFn, extra = () => ({})) {
  const m = new Map();
  for (const l of LAWYERS) { const k = keyFn(l); if (!k) continue; if (!m.has(k)) m.set(k, { slug: k, name: nameFn(l), listings: [], ...extra(l) }); m.get(k).listings.push(l); }
  return [...m.values()].map(f => ({ ...f, count: f.listings.length })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
const CITIES = facet(l => l.city, l => l.cityName, l => ({ county: l.countyName, countySlug: l.countySlug }));
const COUNTIES = facet(l => l.countySlug, l => l.countyName);
const ZIPS = facet(l => l.zip, l => l.zip, l => ({ city: l.cityName, citySlug: l.city }));
const AREAS = CATEGORIES.map(c => ({ slug: c.slug, name: c.type, group: c.group, listings: LAWYERS.filter(l => l.typeSlug === c.slug) }))
  .filter(a => a.listings.length).map(a => ({ ...a, count: a.listings.length })).sort((a, b) => b.count - a.count);

const citySlugs = new Set(CITIES.map(c => c.slug));
const centroid = (list) => { const g = list.filter(l => l.lat != null); if (!g.length) return null; return { lat: g.reduce((s, l) => s + l.lat, 0) / g.length, lng: g.reduce((s, l) => s + l.lng, 0) / g.length }; };
const CITY_CENT = new Map(CITIES.map(c => [c.slug, centroid(c.listings)]));

// Sub-area (focus) pages. A city gets /<city>/<focus>/ when at least MIN_FOCUS
// of its listings name that focus (indexed from MIN_INDEX); the state gets
// /area/<parent>/<focus>/ when at least MIN_INDEX do. The page lists the firms
// that name the focus, then the rest of the parent area, so it is never a
// re-sort of the parent page under a new URL.
const MIN_FOCUS = 2;
const hasFocus = (l, slug) => Array.isArray(l.focus) && l.focus.includes(slug);
const CITY_FOCUS = new Map();   // citySlug → [{ sub, matches, rest }]
for (const c of CITIES) {
  const arr = [];
  for (const sub of SUBAREAS) {
    const matches = c.listings.filter(l => hasFocus(l, sub.slug));
    if (matches.length < MIN_FOCUS) continue;
    const rest = c.listings.filter(l => l.typeSlug === sub.parent && !hasFocus(l, sub.slug));
    arr.push({ sub, matches, rest });
  }
  if (arr.length) CITY_FOCUS.set(c.slug, arr);
}
const STATE_FOCUS = SUBAREAS.map(sub => ({ sub, matches: LAWYERS.filter(l => hasFocus(l, sub.slug)) })).filter(x => x.matches.length >= MIN_INDEX);
const focusHref = (citySlug, sub) => `/${citySlug}/${sub.slug}/`;
function nearbyCities(slug, n = 6) {
  const me = CITY_CENT.get(slug); if (!me) return [];
  return CITIES.filter(c => c.slug !== slug && CITY_CENT.get(c.slug))
    .map(c => ({ c, d: distanceMi(me, CITY_CENT.get(c.slug)) }))
    .sort((x, y) => x.d - y.d).slice(0, n).map(x => x.c);
}
// Nearest city with real depth (>= min listings). Thin cities point human
// visitors here so they land on a page with choice; the thin page itself stays
// live and indexable so Google searchers can still reach it.
function nearestBiggerCity(slug, min = 5) {
  const me = CITY_CENT.get(slug); if (!me) return null;
  const opts = CITIES.filter(c => c.slug !== slug && c.count >= min && CITY_CENT.get(c.slug))
    .map(c => ({ c, d: distanceMi(me, CITY_CENT.get(c.slug)) }))
    .sort((x, y) => x.d - y.d);
  return opts.length ? opts[0].c : null;
}
// A city with fewer than NEARBY_MIN listings is topped up with the closest
// cities' lawyers (closest city first, its highest ranked listings first) until
// the page offers more than 10 in total. These fill listings are shown in their
// own "More lawyers near <City>" block, never merged into the city's own ranked
// list or its structured data, so each place's page stays an honest count.
const NEARBY_MIN = 10;
function nearbyFill(slug, have) {
  if (have >= NEARBY_MIN) return [];
  const out = [];
  for (const c of nearbyCities(slug, 12)) {
    for (const l of [...c.listings].sort(byRank)) {
      out.push(l);
      if (have + out.length > NEARBY_MIN) return out;   // more than 10 total
    }
  }
  return out;
}

// Per-practice-area facts → unique, genuinely useful FAQ content (Georgia-specific).
const FACTS = {
  'personal-injury': "Georgia's statute of limitations for most personal injury claims is two years from the date of the injury (O.C.G.A. § 9-3-33). Most personal injury lawyers work on contingency, so you pay no fee unless they recover money for you.",
  'criminal-defense': "Criminal cases in Georgia are heard in Magistrate, State, and Superior courts depending on the charge. Acting quickly matters, and many criminal defense lawyers offer a free first consultation and flat-fee representation.",
  'family-divorce': "Georgia requires at least one spouse to have lived in the state for six months before filing for divorce. Family lawyers handle custody, child support, alimony, and the division of marital property.",
  'estate-elder': "A basic Georgia estate plan usually includes a will, a financial power of attorney, and an advance directive for health care. Elder law attorneys also help with probate, Medicaid planning, and guardianship.",
  'real-estate': "Georgia is an 'attorney closing' state, so a licensed attorney typically conducts residential and commercial real estate closings. Real estate lawyers handle title issues, contracts, and disputes.",
  'bankruptcy': "Most Georgians file Chapter 7 or Chapter 13 in the U.S. Bankruptcy Court for the Northern or Middle District of Georgia. Whether you qualify for Chapter 7 depends on the means test.",
  'immigration': "Immigration is federal law, so a Georgia immigration lawyer can help with visas, green cards, naturalization, and removal (deportation) defense no matter where in the state you live.",
  'employment': "Georgia is an at will state, but federal and state law still protect workers from discrimination, retaliation, harassment, and unpaid wages. Employment lawyers handle claims involving the EEOC, the FLSA, and wrongful termination, and many take cases on contingency.",
  'social-security': "Social Security Disability (SSDI and SSI) is a federal program, so a Georgia disability lawyer can represent you from the first application through a hearing before an administrative law judge. Most work on contingency, and federal law caps their fee, so you pay only if you win benefits.",
  'tax-irs': "Tax attorneys help Georgians with IRS audits, back taxes, liens and levies, offers in compromise, and disputes with the Georgia Department of Revenue. Many offer a free consultation to review your notice before you respond.",
  'general-practice': "General practice lawyers handle a range of everyday legal matters and can refer you to a specialist when a case calls for one. Most offer a consultation to review your situation first.",
};
// Benefit first, query matching ledes for the high demand practice areas (the
// pages actually pulling impressions in Search Console). These become BOTH the
// on-page intro and the Google snippet (the meta description is a clamp of the
// intro), so they open with the searcher's words ("Find and compare the best…")
// and the fact that matters most for that area. Other areas fall back to the
// generic intro + FACTS.
// Visible, reader facing prose for the statewide practice area pages. These
// URLs carry most of our search impressions, so they need to read like a guide,
// not a card dump. Plain facts about Georgia law, no advice, no endorsement.
const AREA_PROSE = {
  'personal-injury': (a) => para(
    `Georgia gives most injury victims two years from the date of the injury to file a lawsuit (O.C.G.A. § 9-3-33). Claims against a city or county need a written notice much sooner, often within six or twelve months, so the date of the accident matters more than anything else on this page.`,
    `Georgia follows modified comparative negligence. You can recover as long as you were less than 50 percent at fault, and your award is reduced by your share. Car and truck crashes, motorcycle wrecks, slip and fall injuries, dog bites, medical malpractice and wrongful death all fall under this area, and most of the ${nf(a.count)} lawyers listed here work on contingency, so the fee comes out of the recovery rather than your pocket.`,
    `Compare firms by rating and review count, then look at how many of their reviews mention your kind of case. The city links below narrow this list to lawyers who actually practice near you.`,
  ),
  'criminal-defense': (a) => para(
    `Georgia divides charges into misdemeanors, punishable by up to 12 months in jail, and felonies, which carry more than a year. Where a case is heard depends on the charge: traffic and ordinance cases in Municipal or Magistrate Court, most misdemeanors in State Court, and felonies in Superior Court.`,
    `Timing matters. After a DUI arrest you have 30 days to request an administrative license hearing or install an ignition interlock, or the license suspension starts on its own. Georgia's First Offender Act can keep a first conviction off a public record when a judge allows it, and expungement (record restriction) is available for some outcomes.`,
    `The ${nf(a.count)} criminal defense lawyers listed here handle DUI, drug possession, theft, assault, domestic violence, probation violations and traffic offenses. Many offer a free first consultation and flat fees for misdemeanors. Use the city links below to find one who appears regularly in the court where your case sits.`,
  ),
  'bankruptcy': (a) => para(
    `Most Georgians file under Chapter 7, which wipes out unsecured debt such as credit cards and medical bills in a few months, or Chapter 13, which repays part of the debt through a three to five year plan and can stop a foreclosure or a car repossession. Whether Chapter 7 is open to you depends on the means test, which compares your household income to the Georgia median.`,
    `Georgia has its own exemption list rather than the federal one. It protects a set amount of home equity, a vehicle, household goods, tools of the trade, retirement accounts and a wildcard amount. Filing triggers an automatic stay that halts collection calls, garnishments and lawsuits the same day.`,
    `Cases are filed in the U.S. Bankruptcy Court for the Northern District (Atlanta, Gainesville, Newnan, Rome), Middle District (Macon, Columbus, Albany, Athens, Valdosta) or Southern District (Savannah, Augusta, Brunswick, Dublin, Waycross, Statesboro). The ${nf(a.count)} bankruptcy attorneys listed here are grouped by city below so you can find one who files in your division.`,
  ),
  'family-divorce': (a) => para(
    `To file for divorce in Georgia, at least one spouse must have lived in the state for six months. Georgia is a no fault state, so most divorces cite an irretrievably broken marriage, and an uncontested divorce can be final about a month after the papers are served.`,
    `Property is divided by equitable distribution, not a 50/50 split. Child support follows Georgia's income shares worksheet, custody is decided on the best interest of the child, and a child who is 14 or older can state a preference that the judge weighs. Family lawyers also handle legitimation for unmarried fathers, modifications, contempt actions and protective orders.`,
    `The ${nf(a.count)} divorce and family lawyers here are ranked by rating and review volume. Use the city links below to find one who practices in your county's Superior Court, where family cases are heard.`,
  ),
  'estate-elder': (a) => para(
    `A Georgia will must be signed by someone at least 14 years old in front of two witnesses. Wills are probated in the Probate Court of the county where the person lived, and Georgia has no state estate or inheritance tax. A basic plan usually adds a financial power of attorney and an advance directive for health care.`,
    `Elder law attorneys handle guardianship and conservatorship, Medicaid planning for nursing home care, which looks back five years at transfers, and trusts that keep assets out of probate. Probate lawyers help executors with year's support, creditor claims and disputes between heirs.`,
    `The ${nf(a.count)} estate and elder law practices listed here are sorted by rating. The city links below narrow the list to your area.`,
  ),
  'real-estate': (a) => para(
    `Georgia is an attorney closing state: a licensed Georgia attorney must conduct the closing on a real estate purchase or refinance, examine title and disburse the funds. That attorney usually represents the lender, so buyers and sellers sometimes hire their own lawyer to review the contract.`,
    `Real estate lawyers also handle title disputes and quiet title actions, boundary and easement fights, landlord and tenant matters, HOA disputes, commercial leases and construction claims. Adverse possession in Georgia takes 20 years, or seven under color of title.`,
    `The ${nf(a.count)} real estate lawyers and closing attorneys listed here are ranked by rating and review volume. Use the city links below to find one near the property.`,
  ),
  'immigration': (a) => para(
    `Immigration is federal law, so a Georgia immigration lawyer can help you no matter which county you live in. Most cases start with USCIS, whose Atlanta field office serves the whole state, and removal cases are heard at the Atlanta Immigration Court.`,
    `Common matters include family petitions and green cards, naturalization, work visas such as H‑1B and L‑1, asylum, DACA renewals, waivers and deportation defense for people held at the Stewart and Folkston detention centers.`,
    `The ${nf(a.count)} immigration lawyers here are ranked by rating and reviews. Many speak Spanish, Korean, Vietnamese or other languages; check the listing and ask when you call.`,
  ),
  'employment': (a) => para(
    `Georgia is an at will state, so an employer can fire without cause, but not for an illegal reason. Discrimination, harassment and retaliation claims usually start with a charge at the EEOC, and in Georgia that charge must be filed within 180 days of the act.`,
    `Employment lawyers also handle unpaid overtime and wage claims under the FLSA, severance review, non compete agreements under Georgia's Restrictive Covenants Act, whistleblower cases and workers' compensation, which is a separate system run by the State Board of Workers' Compensation.`,
    `The ${nf(a.count)} employment lawyers listed here are ranked by rating. Many take strong cases on contingency; ask about fees in the first call.`,
  ),
  'social-security': (a) => para(
    `Social Security Disability (SSDI) and Supplemental Security Income (SSI) are federal programs, so a Georgia disability lawyer can represent you at any stage. Most first applications are denied, and the case moves through reconsideration to a hearing before an administrative law judge.`,
    `Disability lawyers gather medical records, work with your doctors on function reports and present your case at the hearing. Federal law caps their fee at a percentage of your back pay, and you pay nothing if you lose.`,
    `The ${nf(a.count)} disability lawyers listed here are ranked by rating and reviews. Use the city links below to find one who appears at the hearing office nearest you.`,
  ),
  'tax-irs': (a) => para(
    `Tax attorneys handle IRS audits, back taxes, liens and levies, wage garnishments, offers in compromise, installment agreements, innocent spouse relief and disputes with the Georgia Department of Revenue. Unlike a CPA, a tax attorney can represent you in U.S. Tax Court, where a petition must be filed within 90 days of a Notice of Deficiency.`,
    `Conversations with a tax attorney are privileged, which matters when an audit could turn into a criminal referral. Many offer a free review of an IRS notice before you respond.`,
    `The ${nf(a.count)} tax lawyers listed here are ranked by rating and review volume.`,
  ),
  'general-practice': (a) => para(
    `A general practice lawyer handles everyday legal matters: contracts, small business questions, landlord and tenant disputes, wills, traffic tickets, name changes and civil claims in Magistrate Court, and can refer you to a specialist when a case needs one.`,
    `In smaller Georgia towns the general practice attorney is often the only lawyer for miles, and many have decades of experience in the local courts. The ${nf(a.count)} listed here are ranked by rating and reviews and grouped by city below.`,
  ),
};

// Local court facts per city, used for the visible "About" prose on city pages.
// seat: is this the county seat. circuit: Georgia Superior Court judicial
// circuit. fed: federal district + division. note: one extra local sentence.
const CITY_NOTES = {
  'brunswick': { seat: true, circuit: 'Brunswick', fed: 'Southern District of Georgia, Brunswick Division', note: 'Brunswick also has its own federal courthouse, so personal injury, maritime, criminal and bankruptcy matters from the whole Golden Isles area, including St. Simons Island and Jekyll Island, are handled by lawyers based here.' },
  'cumming': { seat: true, circuit: 'Bell-Forsyth', fed: 'Northern District of Georgia, Gainesville Division', note: 'Forsyth County is one of the fastest growing counties in the state, and its lawyers see a heavy mix of real estate closings, divorce and custody cases, DUI and traffic matters from GA 400.' },
  'gainesville': { seat: true, circuit: 'Northeastern', fed: 'Northern District of Georgia, Gainesville Division', note: 'Gainesville has a federal courthouse of its own and serves as the legal hub for Northeast Georgia, so lawyers here handle cases from Hall, Dawson, Lumpkin, White and Habersham counties. A number of firms serve Spanish speaking clients.' },
  'dalton': { seat: true, circuit: 'Conasauga', fed: 'Northern District of Georgia, Rome Division', note: 'Dalton is the center of the carpet and flooring industry, so local lawyers handle a lot of workers’ compensation, immigration and employment matters alongside personal injury and family law.' },
  'warner-robins': { seat: false, circuit: 'Houston', fed: 'Middle District of Georgia, Macon Division', note: 'Robins Air Force Base shapes the local practice: military divorce, security clearance issues, VA claims and personal injury cases involving service members are common here.' },
  'decatur': { seat: true, circuit: 'Stone Mountain', fed: 'Northern District of Georgia, Atlanta Division', note: 'The DeKalb County Courthouse on the Decatur square is one of the busiest in Georgia, and many lawyers keep offices within walking distance of it.' },
  'rome': { seat: true, circuit: 'Rome', fed: 'Northern District of Georgia, Rome Division', note: 'Rome has a federal courthouse and serves as the legal center of Northwest Georgia, drawing clients from Floyd, Polk, Chattooga, Gordon and Bartow counties.' },
  'east-ellijay': { seat: false, circuit: 'Appalachian', fed: 'Northern District of Georgia, Gainesville Division', note: 'East Ellijay sits beside Ellijay, the Gilmer County seat, so the lawyers listed here serve the whole county and the surrounding mountain communities.' },
  'ellijay': { seat: true, circuit: 'Appalachian', fed: 'Northern District of Georgia, Gainesville Division', note: 'Ellijay lawyers serve Gilmer County and the surrounding mountain communities, with a heavy share of real estate, estate planning and criminal matters.' },
  'vidalia': { seat: false, circuit: 'Middle', fed: null, note: 'Vidalia is the largest city in Toombs County, whose courthouse is in Lyons a few miles away. Lawyers here also serve Montgomery, Tattnall and Treutlen counties.' },
  'evans': { seat: false, circuit: 'Columbia', fed: 'Southern District of Georgia, Augusta Division', note: 'Columbia County got its own judicial circuit in 2021. Appling is the official county seat, but the county government center and most court business sit in Evans, and many Evans lawyers also practice in nearby Augusta.' },
  'valdosta': { seat: true, circuit: 'Southern', fed: 'Middle District of Georgia, Valdosta Division', note: 'Valdosta has a federal courthouse and is the legal hub of South Georgia, serving Lowndes, Brooks, Echols and Lanier counties and the community around Moody Air Force Base.' },
  'marietta': { seat: true, circuit: 'Cobb', fed: 'Northern District of Georgia, Atlanta Division', note: 'The Cobb County courts on the Marietta square are among the busiest in the state, and many firms keep offices along Roswell Street and Washington Avenue nearby.' },
  'atlanta': { seat: true, circuit: 'Atlanta', fed: 'Northern District of Georgia, Atlanta Division', note: 'Atlanta is also home to the Supreme Court of Georgia, the Court of Appeals, the Richard B. Russell federal courthouse and the Atlanta Immigration Court, so nearly every kind of legal practice is represented here.' },
  'savannah': { seat: true, circuit: 'Eastern', fed: 'Southern District of Georgia, Savannah Division', note: 'Savannah lawyers handle a wide mix of port and maritime work, personal injury, criminal defense and real estate for the coastal counties.' },
  'augusta': { seat: true, circuit: 'Augusta', fed: 'Southern District of Georgia, Augusta Division', note: 'Augusta has a federal courthouse and serves the Central Savannah River Area, including Columbia County and the South Carolina side of the river for federal matters.' },
  'macon': { seat: true, circuit: 'Macon', fed: 'Middle District of Georgia, Macon Division', note: 'Macon is the seat of the Middle District of Georgia, so federal criminal, civil rights and bankruptcy matters for Central Georgia are heard here.' },
  'columbus': { seat: true, circuit: 'Chattahoochee', fed: 'Middle District of Georgia, Columbus Division', note: 'Columbus lawyers serve Muscogee and the surrounding counties, and the community around Fort Moore, with a strong share of military family and personal injury work.' },
  'athens': { seat: true, circuit: 'Western', fed: 'Middle District of Georgia, Athens Division', note: 'Athens has a federal courthouse and a large student population, so criminal defense, landlord and tenant and personal injury matters are common here.' },
  'alpharetta': { seat: false, circuit: 'Atlanta', fed: 'Northern District of Georgia, Atlanta Division', note: 'Alpharetta is in North Fulton County; Superior and State Court cases are heard in downtown Atlanta, while many routine matters go through the North Fulton annex and the Alpharetta Municipal Court.' },
  'lawrenceville': { seat: true, circuit: 'Gwinnett', fed: 'Northern District of Georgia, Atlanta Division', note: 'The Gwinnett Justice and Administration Center in Lawrenceville houses the county’s Superior, State, Magistrate and Probate courts, and most Gwinnett firms keep an office nearby.' },
  'canton': { seat: true, circuit: 'Blue Ridge', fed: 'Northern District of Georgia, Atlanta Division', note: 'The Cherokee County Justice Center in Canton hears cases from Woodstock, Holly Springs, Ball Ground and the rest of the county.' },
  'woodstock': { seat: false, circuit: 'Blue Ridge', fed: 'Northern District of Georgia, Atlanta Division', note: 'Woodstock cases are heard at the Cherokee County Justice Center in Canton, about ten miles north, and most Woodstock lawyers practice in both cities.' },
  'roswell': { seat: false, circuit: 'Atlanta', fed: 'Northern District of Georgia, Atlanta Division', note: 'Roswell is in North Fulton County, so felony and major civil cases go to the Fulton County courts in Atlanta while traffic and ordinance cases stay in Roswell Municipal Court.' },
  'albany': { seat: true, circuit: 'Dougherty', fed: 'Middle District of Georgia, Albany Division', note: 'Albany has a federal courthouse and is the legal center of Southwest Georgia, serving Dougherty, Lee, Worth, Terrell and Mitchell counties.' },
  'statesboro': { seat: true, circuit: 'Ogeechee', fed: 'Southern District of Georgia, Statesboro Division', note: 'Statesboro has a federal courthouse and serves Bulloch, Effingham, Jenkins and Screven counties, plus a large Georgia Southern student population.' },
  'douglasville': { seat: true, circuit: 'Douglas', fed: 'Northern District of Georgia, Atlanta Division', note: 'Douglas County has its own judicial circuit, and its courthouse in Douglasville hears cases from across the county.' },
  'stockbridge': { seat: false, circuit: 'Flint', fed: 'Northern District of Georgia, Atlanta Division', note: 'Stockbridge is in Henry County; cases are heard at the courthouse in McDonough, and most Stockbridge lawyers practice in both cities.' },
  'mcdonough': { seat: true, circuit: 'Flint', fed: 'Northern District of Georgia, Atlanta Division', note: 'The Henry County courts on the McDonough square serve Stockbridge, Hampton and Locust Grove as well.' },
  'pooler': { seat: false, circuit: 'Eastern', fed: 'Southern District of Georgia, Savannah Division', note: 'Pooler is in Chatham County; cases are heard in Savannah, and most Pooler lawyers also serve Savannah, Richmond Hill and Effingham County.' },
  'toccoa': { seat: true, circuit: 'Mountain', fed: 'Northern District of Georgia, Gainesville Division', note: 'Toccoa lawyers serve Stephens County and the neighboring mountain counties of Habersham and Rabun.' },
  'stone-mountain': { seat: false, circuit: 'Stone Mountain', fed: 'Northern District of Georgia, Atlanta Division', note: 'Stone Mountain is in DeKalb County; cases are heard at the DeKalb County Courthouse in Decatur, and the judicial circuit carries the city’s name.' },
  'swainsboro': { seat: true, circuit: 'Middle', fed: 'Southern District of Georgia, Statesboro Division', note: 'Swainsboro lawyers serve Emanuel County and the surrounding rural counties, handling family, criminal, real estate and estate matters in the local courts.' },
  'thomson': { seat: true, circuit: 'Toombs', fed: 'Southern District of Georgia, Augusta Division', note: 'Thomson lawyers serve McDuffie County and often practice in nearby Augusta as well.' },
  'tucker': { seat: false, circuit: 'Stone Mountain', fed: 'Northern District of Georgia, Atlanta Division', note: 'Tucker is in DeKalb County; cases go to the DeKalb courts in Decatur. Several Tucker firms focus on immigration for the area’s large immigrant community.' },
  'duluth': { seat: false, circuit: 'Gwinnett', fed: 'Northern District of Georgia, Atlanta Division', note: 'Duluth is in Gwinnett County; cases are heard in Lawrenceville. Many Duluth lawyers serve Korean, Chinese and Spanish speaking clients.' },
  'norcross': { seat: false, circuit: 'Gwinnett', fed: 'Northern District of Georgia, Atlanta Division', note: 'Norcross is in Gwinnett County; cases are heard in Lawrenceville, and many Norcross firms serve Spanish speaking clients.' },
  'kennesaw': { seat: false, circuit: 'Cobb', fed: 'Northern District of Georgia, Atlanta Division', note: 'Kennesaw is in Cobb County; cases are heard in Marietta, and most Kennesaw lawyers also practice there.' },
  'smyrna': { seat: false, circuit: 'Cobb', fed: 'Northern District of Georgia, Atlanta Division', note: 'Smyrna is in Cobb County; cases are heard in Marietta.' },
  'sandy-springs': { seat: false, circuit: 'Atlanta', fed: 'Northern District of Georgia, Atlanta Division', note: 'Sandy Springs is in North Fulton County; Superior and State Court cases are heard in downtown Atlanta.' },
  'newnan': { seat: true, circuit: 'Coweta', fed: 'Northern District of Georgia, Newnan Division', note: 'Newnan has a federal courthouse and serves Coweta, Carroll, Heard, Meriwether and Troup counties.' },
  'griffin': { seat: true, circuit: 'Griffin', fed: 'Northern District of Georgia, Atlanta Division', note: 'The Griffin Judicial Circuit covers Spalding, Fayette, Pike and Upson counties, so Griffin lawyers often appear in Fayetteville and Thomaston as well.' },
  'carrollton': { seat: true, circuit: 'Coweta', fed: 'Northern District of Georgia, Newnan Division', note: 'Carrollton lawyers serve Carroll County and the University of West Georgia community.' },
  'lagrange': { seat: true, circuit: 'Coweta', fed: 'Northern District of Georgia, Newnan Division', note: 'LaGrange lawyers serve Troup County and the area around West Point and the Kia plant.' },
  'conyers': { seat: true, circuit: 'Rockdale', fed: 'Northern District of Georgia, Atlanta Division', note: 'Rockdale County has its own judicial circuit, and its courthouse in Conyers serves the whole county.' },
  'covington': { seat: true, circuit: 'Alcovy', fed: 'Northern District of Georgia, Atlanta Division', note: 'The Alcovy Judicial Circuit covers Newton and Walton counties, so Covington lawyers often appear in Monroe as well.' },
  'jonesboro': { seat: true, circuit: 'Clayton', fed: 'Northern District of Georgia, Atlanta Division', note: 'The Clayton County courts in Jonesboro serve Morrow, Riverdale, Forest Park and the airport area.' },
  'hinesville': { seat: true, circuit: 'Atlantic', fed: 'Southern District of Georgia, Savannah Division', note: 'Fort Stewart shapes the local practice: military divorce, family law and personal injury cases involving soldiers are common in Hinesville.' },
  'tifton': { seat: true, circuit: 'Tifton', fed: 'Middle District of Georgia, Valdosta Division', note: 'Tifton lawyers serve Tift, Irwin, Turner and Worth counties in the heart of South Georgia farm country.' },
  'moultrie': { seat: true, circuit: 'Southern', fed: 'Middle District of Georgia, Valdosta Division', note: 'Moultrie lawyers serve Colquitt County and often practice in nearby Thomasville and Valdosta.' },
  'thomasville': { seat: true, circuit: 'Southern', fed: 'Middle District of Georgia, Valdosta Division', note: 'Thomasville lawyers serve Thomas County and the Georgia side of the Tallahassee area.' },
  'waycross': { seat: true, circuit: 'Waycross', fed: 'Southern District of Georgia, Waycross Division', note: 'Waycross has a federal courthouse and serves Ware, Pierce, Brantley, Charlton and Bacon counties.' },
  'milledgeville': { seat: true, circuit: 'Ocmulgee', fed: 'Middle District of Georgia, Macon Division', note: 'Milledgeville lawyers serve Baldwin County and the Lake Oconee and Lake Sinclair communities.' },
  'dublin': { seat: true, circuit: 'Dublin', fed: 'Southern District of Georgia, Dublin Division', note: 'Dublin has a federal courthouse and serves Laurens, Johnson, Treutlen and Twiggs counties.' },
  'cartersville': { seat: true, circuit: 'Cherokee', fed: 'Northern District of Georgia, Rome Division', note: 'The Cherokee Judicial Circuit, despite the name, covers Bartow and Gordon counties, with the courthouse in Cartersville.' },
  'dawsonville': { seat: true, circuit: 'Northeastern', fed: 'Northern District of Georgia, Gainesville Division', note: 'Dawsonville lawyers serve Dawson County and often practice in Gainesville and Cumming as well.' },
  'fayetteville': { seat: true, circuit: 'Griffin', fed: 'Northern District of Georgia, Atlanta Division', note: 'The Fayette County courts in Fayetteville serve Peachtree City and Tyrone as well.' },
  'peachtree-city': { seat: false, circuit: 'Griffin', fed: 'Northern District of Georgia, Atlanta Division', note: 'Peachtree City is in Fayette County; cases are heard in Fayetteville a few miles away.' },
  'americus': { seat: true, circuit: 'Southwestern', fed: 'Middle District of Georgia, Americus Division', note: 'Americus lawyers serve Sumter County and the surrounding rural counties of Southwest Georgia.' },
  'cordele': { seat: true, circuit: 'Cordele', fed: null, note: 'Cordele lawyers serve Crisp County and the I‑75 corridor through South Georgia.' },
  'villa-rica': { seat: false, circuit: 'Coweta', fed: 'Northern District of Georgia, Newnan Division', note: 'Villa Rica straddles Carroll and Douglas counties, so its lawyers appear in both Carrollton and Douglasville. Real estate closings and title work are a large part of the local practice.' },
  'bremen': { seat: false, circuit: 'Tallapoosa', fed: 'Northern District of Georgia, Rome Division', note: 'Bremen is in Haralson County; cases are heard in Buchanan, and local lawyers handle a lot of real estate and title work.' },
  'clayton': { seat: true, circuit: 'Mountain', fed: 'Northern District of Georgia, Gainesville Division', note: 'Clayton lawyers serve Rabun County and the Northeast Georgia mountains.' },
  'monroe': { seat: true, circuit: 'Alcovy', fed: 'Northern District of Georgia, Atlanta Division', note: 'Monroe lawyers serve Walton County and often appear in Covington as part of the Alcovy circuit.' },
  'flowery-branch': { seat: false, circuit: 'Northeastern', fed: 'Northern District of Georgia, Gainesville Division', note: 'Flowery Branch is in Hall County; cases are heard in Gainesville, and most local lawyers practice there too.' },
};
function cityProse(c, g, areas, tp, avg) {
  const n = CITY_NOTES[c.slug] || {};
  const county = c.county ? `${c.county} County` : null;
  const where = county
    ? (n.seat ? `${c.name} is the county seat of ${county}, so the county’s Superior, State, Magistrate and Probate courts sit here` : `${c.name} is in ${county}, and most cases are heard at the ${county} courthouse`)
    : `${c.name} is in Georgia`;
  const circuit = n.circuit ? `, part of the ${n.circuit} Judicial Circuit` : '';
  const fed = n.fed ? ` Federal cases go to the U.S. District Court for the ${n.fed}.` : '';
  const mix = areas.slice(0, 5).map(x => `${stripArea(x.a.name).toLowerCase()} (${nf(x.list.length)})`);
  return para(
    `${where}${circuit}.${fed}${n.note ? ' ' + n.note : ''}`,
    `We list ${nf(c.count)} lawyers and law firms in ${c.name}: ${nf(g.firm.length)} ${g.firm.length === 1 ? 'firm' : 'firms'} and ${nf(g.attorney.length)} solo ${g.attorney.length === 1 ? 'attorney' : 'attorneys'}${mix.length ? `, with the most practicing ${joinList(mix)}` : ''}.${avg ? ` Together they average ${avg.toFixed(1)} stars from public reviews.` : ''}${tp && tp.rating ? ` ${tp.name} currently holds the top spot with ${tp.rating.toFixed(1)} stars${tp.reviews ? ` across ${nf(tp.reviews)} reviews` : ''}.` : ''}`,
    `Rankings come from published ratings and review counts, not from us. Call, get directions or open a firm’s website straight from its card, and use the practice area links to narrow the list to your kind of case.`,
  );
}

// Georgia facts per focus, shown as the visible About block on focus pages.
const SUB_PROSE = {
  'car-accident': (n) => para(
    `Georgia is an at fault state: the driver who caused the crash, through their insurer, pays for the damage. Every Georgia driver must carry at least 25/50/25 liability coverage, which is often not enough for a serious injury, so your own uninsured and underinsured motorist coverage matters.`,
    `You have two years from the crash to file suit. Georgia's modified comparative negligence rule lets you recover as long as you were less than 50 percent at fault, reduced by your share. Get the Georgia Motor Vehicle Crash Report, photograph the scene, and see a doctor the same week; gaps in treatment are the first thing an adjuster points to.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} car and auto accident work in their listing. Most take these cases on contingency.`),
  'truck-accident': (n) => para(
    `Commercial truck crashes are governed by federal FMCSA rules as well as Georgia law. Hours of service logs, electronic logging devices, maintenance records and the truck's own event recorder can all prove fault, but carriers are only required to keep some of it for months, so a preservation letter should go out early.`,
    `There are usually several defendants: the driver, the motor carrier, sometimes the shipper or a maintenance contractor. Interstate carriers must carry at least $750,000 in liability coverage, far more than a passenger vehicle. The two year Georgia deadline still applies.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} truck and tractor trailer cases in their listing.`),
  'motorcycle-accident': (n) => para(
    `Georgia requires every rider to wear a DOT approved helmet (O.C.G.A. § 40-6-315) and does not allow lane splitting. Insurers use both to argue the rider shares fault, which matters under Georgia's 50 percent comparative negligence bar.`,
    `Motorcycle injuries are typically severe, so the other driver's 25/50/25 minimum policy runs out fast; your own uninsured motorist coverage and any umbrella policy come into play. The filing deadline is two years from the crash.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} motorcycle cases in their listing.`),
  'wrongful-death': (n) => para(
    `Georgia's Wrongful Death Act measures damages as the full value of the life of the person who died, from their own point of view: lost wages and benefits plus the intangible value of the life they would have lived. A separate estate claim covers medical bills, funeral costs and the pain the person suffered before death.`,
    `The surviving spouse brings the claim, sharing with children; if there is no spouse, the children, then the parents, then the estate. The deadline is two years from the death, with some pauses when a criminal case is pending.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} wrongful death in their listing.`),
  'medical-malpractice': (n) => para(
    `A Georgia medical malpractice suit must be filed within two years of the injury and, with few exceptions, within five years of the negligent act. The complaint must be filed with an expert affidavit from a qualified medical professional stating at least one negligent act (O.C.G.A. § 9-11-9.2), which is why these cases take preparation before filing.`,
    `Nursing home neglect and abuse claims follow the same rules. Georgia's cap on non economic damages was struck down by the state Supreme Court in 2010, so there is no fixed ceiling on pain and suffering awards.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} medical malpractice or nursing home cases in their listing.`),
  'workers-compensation': (n) => para(
    `Georgia workers' compensation is no fault: if you were hurt on the job you are covered whether or not anyone was careless, and in exchange you generally cannot sue your employer. Report the injury to your employer within 30 days and file a WC-14 with the State Board of Workers' Compensation within one year.`,
    `Benefits are two thirds of your average weekly wage up to the state cap, plus medical care from a doctor on the employer's posted panel. Attorney fees are capped at 25 percent of benefits and must be approved by the Board. A separate personal injury claim may exist against a third party, such as another driver.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} workers' compensation in their listing.`),
  'dui': (n) => para(
    `Georgia's per se limit is 0.08 (0.04 for commercial drivers, 0.02 under 21), and you can be charged below it on impairment alone. After an arrest you have 30 days to request an administrative license suspension hearing or install an ignition interlock device, or your license is suspended automatically. Refusing the state test brings its own one year suspension under implied consent.`,
    `A first DUI is a misdemeanor with a fine, community service, DUI school, probation and at least 24 hours in jail, plus a license suspension that can often be converted to a limited permit. Repeat offenses within ten years escalate quickly. Many DUI lawyers charge a flat fee and offer a free first consultation.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} DUI defense in their listing.`),
  'traffic-tickets': (n) => para(
    `Georgia suspends a license at 15 points in 24 months (4 points for drivers under 21). Speeding 15 to 18 over is 2 points, 19 to 23 is 3, 24 to 33 is 4, and reckless driving is a 4 point misdemeanor. The Super Speeder law adds a $200 state fee for 75 or more on a two lane road or 85 anywhere.`,
    `A lawyer can often reduce a ticket to a lesser offense, keep points off your record, or handle the court date so you do not have to appear. A nolo contendere plea avoids points once every five years.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} traffic and ticket defense in their listing.`),
  'child-custody': (n) => para(
    `Georgia separates legal custody, who makes decisions, from physical custody, where the child lives. Every custody case needs a parenting plan, and judges decide on the best interest of the child using the factors in O.C.G.A. § 19-9-3. A child 14 or older may choose which parent to live with, subject to the judge's approval; the wishes of a child 11 to 13 are considered.`,
    `Changing custody later requires a material change in circumstances. Unmarried fathers must file a legitimation action before they can seek custody or visitation.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} child custody in their listing.`),
  'wills-trusts': (n) => para(
    `A Georgia will must be signed by someone at least 14 years old and witnessed by two people; adding a self proving affidavit means the witnesses never have to appear in court. Georgia has no estate or inheritance tax. Without a will, a spouse shares the estate with the children and never receives less than a third.`,
    `A revocable living trust keeps assets out of probate and private, at the cost of retitling them during your lifetime. Most plans also include a durable financial power of attorney and the Georgia Advance Directive for Health Care.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} wills, trusts or estate planning in their listing.`),
  'probate': (n) => para(
    `Probate happens in the Probate Court of the county where the person lived. The executor petitions for letters testamentary, notifies heirs and creditors, gathers assets, pays debts and distributes what remains. A straightforward Georgia estate takes roughly six months to a year.`,
    `Georgia offers shortcuts: when there is no will, no debts and every heir agrees, a petition for no administration necessary skips formal probate, and a surviving spouse or minor children can file for year's support, which takes priority over most creditors.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} probate in their listing.`),
  'elder-law': (n) => para(
    `Elder law centers on paying for long term care. Georgia Medicaid looks back five years at transfers before it will cover a nursing home, and because Georgia is an income cap state, applicants over the limit need a Qualified Income Trust (Miller trust) to qualify. Planning early keeps more options open.`,
    `Elder law attorneys also handle guardianship and conservatorship petitions in Probate Court when a parent can no longer manage, VA Aid and Attendance benefits, powers of attorney, and advance directives.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} elder law in their listing.`),
  'title-closing': (n) => para(
    `Georgia is an attorney closing state: only a licensed Georgia attorney may conduct a real estate closing, examine title and disburse funds. The closing attorney usually represents the lender, so a buyer or seller who wants their own advocate hires a second lawyer to review the contract and the closing statement.`,
    `The closing attorney searches the title, clears liens, issues title insurance (an owner's policy is optional but usually worth it), prepares the security deed, and records everything with the county. Georgia charges a transfer tax of $1 per $1,000 of price and an intangible tax of $1.50 per $500 on a new loan.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} title work or closings in their listing.`),
  'business-law': (n) => para(
    `Georgia LLCs and corporations are formed through the Secretary of State and must file an annual registration by April 1. A business lawyer drafts the operating agreement or bylaws, contracts, commercial leases and employment agreements, and advises on non compete clauses under Georgia's Restrictive Covenants Act.`,
    `Business disputes are heard in State or Superior Court, or in the Georgia State-wide Business Court for larger commercial cases. Written contract claims must be brought within six years, oral ones within four.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} business or corporate law in their listing.`),
  'civil-litigation': (n) => para(
    `Civil disputes in Georgia start in Magistrate Court for claims up to $15,000, where no lawyer is required, and in State or Superior Court above that. Written contract claims have a six year deadline, oral contracts four, and most injury and property damage claims two.`,
    `Litigation attorneys handle pleadings, discovery, motions, mediation and trial. Many Georgia courts require mediation before a case reaches a jury, and Georgia's offer of settlement rule can shift attorney fees onto a party that refuses a reasonable offer.`,
    `${nf(n)} ${n === 1 ? 'practice names' : 'practices name'} litigation or trial work in their listing.`),
};
const subFaq = (sub, place, n, top) => [
  { q: `How many ${sub.label.toLowerCase()} lawyers are in ${place}?`, a: `${nf(n)} ${n === 1 ? 'lawyer or law firm names' : 'lawyers and law firms name'} ${sub.label.toLowerCase()} work in ${place} on this page, ranked by rating and reviews.` },
  top && top.rating ? { q: `Who is a top ${sub.label.toLowerCase()} lawyer in ${place}?`, a: `${top.name} is among the highest rated, with ${top.rating.toFixed(1)} stars${top.reviews ? ` across ${nf(top.reviews)} reviews` : ''}.` } : null,
  { q: `Do I need a specialist for ${a_an(sub.label)} ${sub.label.toLowerCase()} case?`, a: `Not always. Many ${stripArea(TYPE_BY_SLUG[sub.parent] || '').toLowerCase()} lawyers handle these cases too, which is why the rest of that practice area is listed below the specialists. Ask about experience with your exact situation in the first call.` },
].filter(Boolean);

const AREA_LEDE = {
  'personal-injury': (a) => `Find and compare the best personal injury lawyers in Georgia. We list ${nf(a.count)} injury and accident attorneys statewide, from established law firms to solo practitioners, with ratings, real reviews, and one tap to call. Most work on contingency, so you pay no fee unless they win your case.`,
  'criminal-defense': (a) => `Find and compare the best criminal defense lawyers in Georgia. We list ${nf(a.count)} criminal defense attorneys statewide, with ratings, reviews, and one tap to call. Many offer a free first consultation, and acting quickly gives your defense the most room to work.`,
  'bankruptcy': (a) => `Find and compare the best bankruptcy lawyers in Georgia. We list ${nf(a.count)} bankruptcy attorneys statewide, with ratings, reviews, and one tap to call. Whether you are weighing Chapter 7 or Chapter 13, many offer a free first consultation to review your debts.`,
};
const dl = (faq) => `<section class="faq"><h2 class="section-title">Frequently asked questions</h2>${faq.map(f => `<div class="faq-item"><h3 class="faq-q">${esc(f.q)}</h3><p class="faq-a">${esc(f.a)}</p></div>`).join('')}</section>`;
const faqLd = (faq) => ({ '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

const sitemap = [];
const written = new Set();
// Previous sitemap lastmod per URL, so a page whose HTML did not change keeps
// its old date instead of every URL claiming "modified today" on each build
// (Google learns to ignore a lastmod that always moves).
const PREV_LASTMOD = new Map();
try {
  for (const m of readFileSync(join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)) PREV_LASTMOD.set(m[1], m[2]);
} catch { /* first build */ }
const writeIfChanged = (file, html) => {
  let prev = null;
  try { prev = readFileSync(file, 'utf8'); } catch { /* new */ }
  if (prev === html) return false;
  writeFileSync(file, html);
  return true;
};
const out = (urlPath, html, { index = true, priority = 0.5 } = {}) => {
  const clean = urlPath.replace(/^\/?/, '').replace(/\/?$/, '');
  written.add(clean);
  mkdirSync(join(ROOT, clean), { recursive: true });
  const changed = writeIfChanged(join(ROOT, clean, 'index.html'), html);
  if (index) sitemap.push({ loc: ORIGIN + '/' + clean + '/', priority, changed });
};

// ─── markup ────────────────────────────────────────────────────────────────────
// Editorial "letterhead" card: rank + kind tabs on top, gilt rail + framed
// thumbnail, serif name, § review badge, dark rating pill, oxblood Call bar.
// Distinct review sources for a listing (Yelp, Avvo, Yellowpages…), merged across
// scrapes. The total reviews are summed and the rating is averaged upstream; here
// we just surface WHERE the reviews come from.
const reviewSourceList = (l) => [...new Set((l.ratings || []).filter((x) => x.source).map((x) => x.source))];
// "from <flip>": a single source label that flips through each source (animated by
// static.js when there are 2+). Degrades to static text with no JS / one source.
function srcFlipHTML(names) {
  if (!names.length) return '';
  const sizer = names.reduce((a, b) => (b.length > a.length ? b : a), '');
  const words = names.map((s, i) => `<span class="src-word${i === 0 ? ' is-on' : ''}">${esc(s)}</span>`).join('');
  return ` from <span class="srcflip" data-srcflip><span class="src-sizer" aria-hidden="true">${esc(sizer)}</span>${words}</span>`;
}
function cardHTML(l, rank, extraClass = '', link = true) {
  const tel = telHref(l.phone);
  const kind = l.entity === 'firm' ? 'LAW FIRM' : 'ATTORNEY';
  // Initials sit behind as the base layer; the photo overlays it and removes
  // itself if it fails to load, so a broken URL never shows a broken-image glyph.
  const bg = `<div class="lc-bg lc-bg--initials" aria-hidden="true">${esc(initials(l.name))}</div>`
    + (l.image ? `<img class="lc-bg lc-bg--photo" src="${attr(hiResImage(l.image))}" alt="${attr(l.name + ', ' + l.type + ' in ' + l.cityName + ', GA')}" loading="lazy" decoding="async" onerror="this.remove()">` : '');
  const seal = l.rating ? `<div class="lc-seal"><span class="lc-star">★</span><span class="lc-seal-n">${l.rating.toFixed(1)}</span></div>` : '';
  const reviews = l.reviews ? `<span class="lc-reviews">${nf(l.reviews)} review${l.reviews === 1 ? '' : 's'}${srcFlipHTML(reviewSourceList(l))}</span>` : '';
  const coords = (l.lat != null && l.lng != null) ? ` data-lat="${l.lat}" data-lng="${l.lng}"` : '';
  const rankCls = (rank != null && rank <= 5) ? ` lc--rank${rank}` : '';
  // The name opens an in-page profile modal (static.js); title gives the full
  // name on hover, and the name scrolls sideways for long firms.
  const nameInner = `<button type="button" class="lc-namelink" data-profile>${esc(l.name)}</button>`;
  return `<article class="lc${rankCls}${extraClass ? ' ' + extraClass : ''}" style="--ring:${ringDur(l.id)}" data-listing-id="${attr(l.id)}" data-entity="${l.entity}" data-rating="${l.rating || 0}" data-reviews="${l.reviews || 0}" data-address="${attr(l.address || l.cityName + ', GA')}" data-source="${attr(l.source || '')}" data-src-url="${attr(l.sourceUrl || '')}"${coords}>
  <div class="lc-card">
    <div class="lc-band">
      <div class="lc-tabs">${rank != null ? `<span class="lc-tab lc-tab--rank">No. ${rank}</span>` : ''}<span class="lc-tab lc-tab--kind">${kind}</span>${l.tier === 'premium' || l.tier === 'standard' ? `<span class="lc-tab lc-tab--promoted">Promoted</span>` : ''}${l.status === 'temporarily_closed' ? `<span class="lc-tab lc-tab--closed">Temporarily closed</span>` : ''}${l.status === 'permanently_closed' ? `<span class="lc-tab lc-tab--closed">Permanently closed</span>` : ''}</div>
      <button class="lc-save" data-save-id="${attr(l.id)}" aria-pressed="false" aria-label="Save ${attr(l.name)}" title="Save">${svg('bookmark', 18)}</button>
    </div>
    <div class="lc-photo">
      ${bg}
      <div class="lc-scrim"></div>
      <span class="lc-wm" data-dist aria-hidden="true"></span>
      <div class="lc-body">
        ${seal}
        <h3 class="lc-name" title="${attr(l.name)}">${nameInner}</h3>
        <div class="lc-sub">${esc(l.type)}</div>
        <div class="lc-meta">${reviews}</div>
      </div>
    </div>
    <div class="lc-foot">
      <div class="lc-actions">
        ${tel ? `<a class="lc-btn lc-btn--call" href="${attr(tel)}" title="Call" data-visit>${svg('phone', 16)}<span>Call</span></a>` : ''}
        <a class="lc-btn" href="${attr(mapsHref(l))}" target="_blank" rel="noopener" aria-label="Directions" title="Get directions" data-visit>${svg('navigation', 16)}<span>Directions</span></a>
        ${l.website ? `<a class="lc-btn" href="${attr(l.website)}" target="_blank" rel="noopener nofollow" aria-label="Website" title="Visit website" data-visit>${svg('globe', 16)}<span>Website</span></a>` : ''}
      </div>
    </div>
  </div>
</article>`;
}
function promoCardHTML(tier) {
  const s = tier === 'premium'
    ? { tag: 'PREMIUM', blurb: 'Top of the page across your city and practice area, with your photo, hours, and a consultation button.' }
    : { tag: 'STANDARD', blurb: 'Listed above the free results in your city, with your photo, hours, and website link.' };
  return `<article class="card promo promo--${tier}">
  <div class="promo-tag">${svg('sparkles', 13, true)}${s.tag}</div>
  <h3 class="promo-title">Your practice here</h3>
  <p class="promo-blurb">${s.blurb}</p>
  <a class="btn ${tier === 'premium' ? 'btn--gold' : 'btn--primary'} promo-btn" href="/pricing/">See pricing</a>
</article>`;
}
// Premium + standard placement slots, shown on every listing page (like home).
function promoSlots() {
  return `<section class="home-section promo-slots">
  <div class="section-head"><h2 class="section-title">Feature your practice here</h2><span class="section-tagline">Premium and standard placement, pinned above the free results</span></div>
  <div class="featured-grid">${promoCardHTML('premium')}${promoCardHTML('standard')}</div>
</section>`;
}
function qaBarHTML(standalone = true) {
  return `<div class="quick-access${standalone ? ' quick-access--standalone' : ''}">
  <a class="qa-tile qa-tile--saved" href="/saved/"><span class="qa-ic">${svg('bookmark', 18)}</span><span class="qa-label">Saved</span><span class="qa-count" data-qa-count="saved">0</span></a>
  <a class="qa-tile qa-tile--visited" href="/visited/"><span class="qa-ic">${svg('clock', 18)}</span><span class="qa-label">Visited</span><span class="qa-count" data-qa-count="visited">0</span></a>
</div>`;
}
function tabBarHTML(active) {
  const t = (id, ic, label, href, btn) => { const on = active === id; return btn
    ? `<button class="tab${on ? ' is-active' : ''}" data-near aria-label="${label}"><span class="tab-ic">${svg(ic, 24)}</span><span class="tab-label">${label}</span></button>`
    : `<a class="tab${on ? ' is-active' : ''}"${on ? ' aria-current="page"' : ''} href="${href}"><span class="tab-ic">${svg(ic, 24)}</span><span class="tab-label">${label}</span></a>`; };
  return `<nav class="tabbar" aria-label="Primary">${t('home', 'home', 'Home', '/')}${t('areas', 'scale', 'Areas', '/areas/')}${t('near', 'mapPin', 'Near Me', null, true)}${t('browse', 'map', 'Browse', '/directory/')}</nav>`;
}
function segmentedHTML(listings) {
  const g = groupEntity(listings);
  return `<div class="controls"><div class="segmented" role="tablist">
  <button class="segment is-active" data-filter="all">All<span class="segment-count">${nf(listings.length)}</span></button>
  <button class="segment" data-filter="firm">Law Firms<span class="segment-count">${g.firm.length}</span></button>
  <button class="segment" data-filter="attorney">Attorneys<span class="segment-count">${g.attorney.length}</span></button>
</div></div>`;
}
const chip = (href, label, count, rating = null, title = null) => `<a class="chip" href="${attr(href)}"${count != null ? ` data-count="${count}"` : ''}${rating != null ? ` data-rating="${rating}"` : ''}${title ? ` title="${attr(title)}"` : ''}>${esc(label)}${rating != null ? `<span class="chip-rate"><span class="chip-star">★</span>${rating.toFixed(1)}</span>` : ''}${count != null ? `<span class="chip-count">${nf(count)}</span>` : ''}</a>`;
const chips = (arr, cls = '') => arr.length ? `<div class="chips ${cls}">${arr.join('')}</div>` : '';
const linkSection = (title, arr) => arr.length ? `<div class="section-head"><h2 class="section-title">${esc(title)}</h2></div>${chips(arr, 'chips--wrap')}` : '';

// Greek-temple mark (columns), white on charcoal with a gilt base.
const TEMPLE = '<svg width="24" height="24" viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="2" width="20" height="3.4" fill="#fff"/><rect x="5.5" y="7" width="3.2" height="14" fill="#fff"/><rect x="11.4" y="7" width="3.2" height="14" fill="#fff"/><rect x="17.3" y="7" width="3.2" height="14" fill="#fff"/><rect x="3" y="22" width="20" height="2" fill="#a8893c"/></svg>';

function footerHTML() {
  const m = (subj) => `mailto:${CONTACT}?subject=${encodeURIComponent(subj)}`;
  const areaLinks = AREAS.slice(0, 5).map(a => `<a href="/area/${a.slug}/">${esc(stripArea(a.name))}</a>`).join('');
  return `<footer class="site-footer">
  <div class="foot-cta">
    <div class="foot-cta-kicker">For attorneys</div>
    <div class="foot-cta-title">Your next client is reading this page.</div>
    <div class="foot-cta-sub">Claim your free listing, or take a premium seat at the top of your practice area.</div>
    <div class="foot-cta-btns"><a class="btn-gilt" href="${m('Claim free listing')}">Claim free listing</a><a class="btn-ghost-light" href="${m('Premium placement')}">See Premium</a></div>
  </div>
  <div class="foot-rule"><span></span><i></i><span></span></div>
  <div class="foot-cols">
    <div><div class="foot-h">Find counsel</div><nav class="foot-links"><a href="/area/personal-injury/">By practice area</a><a href="/directory/">By city</a><a href="/firms/">Top law firms</a><a href="/attorneys/">Top attorneys</a><a href="/rankings/">How we rank</a></nav></div>
    <div><div class="foot-h">For attorneys</div><nav class="foot-links"><a href="/pricing/">Pricing</a><a href="${m('Claim free listing')}">Claim your profile</a><a href="${m('Premium placement')}">Premium placement</a></nav></div>
    <div><div class="foot-h">Practice areas</div><nav class="foot-links">${areaLinks}</nav></div>
    <div><div class="foot-h">The directory</div><nav class="foot-links"><a href="https://artivicolab.com" target="_blank" rel="noopener">About Artivicolab</a><a href="${m(SITE)}">Contact us</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a></nav></div>
  </div>
  <p class="foot-disclaimer"><b>Attorney advertising.</b> ${SITE} is an independent directory, not a law firm or lawyer referral service, and does not provide legal advice or endorse any attorney. Listings marked Premium are paid placements; rankings reflect ratings and verified reviews and are not for sale. Prior results do not guarantee a similar outcome. Contacting an attorney through this site does not create an attorney client relationship.</p>
  <div class="foot-brand">${TEMPLE}<div><div class="foot-brand-name">${SITE}</div><div class="foot-brand-tag">Every licensed attorney in Georgia.</div></div><div class="foot-copy">© ${YEAR}<br>Atlanta, GA</div></div>
  <p class="foot-made">Made by <a href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a> · <a href="${m(SITE)}">Contact</a></p>
  <p class="foot-credit">Listing photos via Bing Maps.</p>
</footer>`;
}

// "The Georgia Docket" — charcoal Top-10 plaque. Clicking any of the 10 promotes
// that lawyer into the No.1 spotlight (with Call / Directions / Website buttons),
// driven by static.js from the embedded JSON. Server-renders No.1 for SEO/no-JS.
const avHTML = (l) => l.image
  ? `<img src="${attr(l.image)}" alt="${attr(l.name)}" loading="lazy" decoding="async">`
  : `<span class="docket-ini">${esc(initials(l.name))}</span>`;
function champActions(l) {
  const tel = telHref(l.phone);
  return `<div class="docket-actions">${tel ? `<a class="docket-btn docket-btn--call" href="${attr(tel)}" data-visit>${svg('phone', 15)}<span>Call</span></a>` : ''}<a class="docket-btn" href="${attr(mapsHref(l))}" target="_blank" rel="noopener" data-visit>${svg('navigation', 15)}<span>Directions</span></a>${l.website ? `<a class="docket-btn" href="${attr(l.website)}" target="_blank" rel="noopener nofollow" data-visit>${svg('globe', 15)}<span>Website</span></a>` : ''}</div>`;
}
function champInner(l, rank) {
  const bg = l.image ? `<img class="docket-champ-bg" src="${attr(hiResImage(l.image))}" alt="" loading="lazy" decoding="async" aria-hidden="true"><div class="docket-champ-scrim" aria-hidden="true"></div>` : '';
  return `${bg}<button class="docket-champ-save" data-save-id="${attr(l.id)}" aria-pressed="false" aria-label="Save ${attr(l.name)}" title="Save">${svg('bookmark', 18)}</button>
    <div class="docket-champ-body">
    <div class="docket-rank1">— No. ${rank} —</div>
    <div class="docket-champ-name">${esc(l.name)}</div>
    <div class="docket-champ-meta">${esc(l.type)} · ${esc(l.cityName)}<span class="docket-dist" data-dist></span></div>
    <div class="docket-champ-rate"><span class="docket-star">★</span> ${l.rating ? l.rating.toFixed(1) : '—'} <span class="docket-dim">· ${nf(l.reviews || 0)} reviews${srcFlipHTML(reviewSourceList(l))}</span></div>
    ${champActions(l)}
    </div>`;
}
function docketHTML(list) {
  const ten = list.slice(0, 10);
  const champ = ten[0], rest = ten.slice(1);
  const romans = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  if (!champ) return '';
  // compact data for the client to rebuild the spotlight on click
  const data = ten.map(l => ({ id: l.id, name: l.name, type: l.type, cityName: l.cityName,
    rating: l.rating || null, reviews: l.reviews || 0, srcs: reviewSourceList(l), av: avHTML(l), image: hiResImage(l.image) || null, tel: telHref(l.phone), maps: mapsHref(l), web: l.website || null,
    lat: l.lat ?? null, lng: l.lng ?? null }));
  return `<section class="home-section"><div class="docket" data-docket>
  <span class="docket-corner docket-corner--tl"></span><span class="docket-corner docket-corner--br"></span>
  <div class="docket-head">
    <div class="docket-kicker">The Georgia Docket</div>
    <div class="docket-title">Top 10 lawyers, statewide</div>
    <div class="docket-sub">tap a name to see their details</div>
  </div>
  <div class="docket-champ" id="docket-champ" data-listing-id="${attr(champ.id)}"${champ.lat != null && champ.lng != null ? ` data-lat="${champ.lat}" data-lng="${champ.lng}"` : ''}>${champInner(champ, 1)}</div>
  <div class="docket-rows" id="docket-rows">${rest.map((l, i) => `<button class="docket-row" data-docket-i="${i + 1}"${l.lat != null && l.lng != null ? ` data-lat="${l.lat}" data-lng="${l.lng}"` : ''}>
    <span class="docket-roman">${romans[i]}</span>
    <span class="docket-av">${avHTML(l)}</span>
    <span class="docket-row-main"><span class="docket-row-name">${esc(l.name)}</span><span class="docket-row-meta">${esc(l.type)} · ${esc(l.cityName)}<span class="docket-dist" data-dist></span></span></span>
    <span class="docket-row-rate"><span><span class="docket-star">★</span> ${l.rating ? l.rating.toFixed(1) : '—'}</span><span class="docket-row-rev">${nf(l.reviews || 0)} reviews</span></span>
    <span class="docket-save" data-save-id="${attr(l.id)}" role="button" aria-label="Save ${attr(l.name)}" title="Save">${svg('bookmark', 16)}</span>
  </button>`).join('')}</div>
  <script type="application/json" id="docket-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
</div></section>`;
}

// Top bar: brand + animated "Install" button (revealed by static.js when the
// browser supports installation) + Browse all.
function headerHTML() {
  return `<header class="static-header"><a class="static-brand" href="/">${SITE}</a><div class="static-actions"><button class="install-btn" data-install>${svg('download', 16)}<span>Install</span></button><a class="static-browse" href="/directory/">Browse all</a></div></header>`;
}
// Shared PWA + social head tags.
const HEAD_PWA = `<link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" sizes="180x180" href="/apple-icon-180x180.png"><link rel="icon" type="image/svg+xml" href="/assets/icon.svg"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"><link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"><link rel="shortcut icon" href="/favicon.ico"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="GA Lawyers">`;

function pageShell({ title, desc, canonical, h1, sub, eyebrow, intro, breadcrumbs, jsonld, body, index = true, geo = null, tab = 'browse' }) {
  const crumbHTML = breadcrumbs.map((b, i) => i < breadcrumbs.length - 1
    ? `<a href="${attr(b.href)}">${esc(b.name)}</a><span class="crumb-sep">›</span>`
    : `<span>${esc(b.name)}</span>`).join('');
  const geoMeta = geo ? `<meta name="geo.region" content="US-GA">
<meta name="geo.placename" content="${attr(geo.placename)}">${geo.lat != null ? `\n<meta name="ICBM" content="${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}">` : ''}\n` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${GTAG}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
${index ? '' : '<meta name="robots" content="noindex, follow">\n'}${geoMeta}<link rel="canonical" href="${attr(canonical)}">
<meta name="theme-color" content="#1a1a1f">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:url" content="${attr(canonical)}">
<meta property="og:locale" content="en_US">
${HEAD_SOCIAL}
<meta name="twitter:card" content="summary_large_image">
${PRECONNECT}
${HEAD_PWA}
<link rel="stylesheet" href="/css/style.css">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body class="static">
${SKIP}
${NOSCRIPT}
<section class="page-hero"><button class="install-btn install-btn--hero" data-install>${svg('download', 16)}<span>Install</span></button><div class="page-hero-inner">
<nav class="breadcrumb" aria-label="Breadcrumb">${crumbHTML}</nav>
${eyebrow ? `<p class="hero-eyebrow">${esc(eyebrow)}</p>` : ''}
<h1 class="hero-title">${esc(h1)}</h1>
${sub ? `<p class="hero-sub">${esc(sub)}</p>` : ''}
${intro ? `<p class="hero-lede">${esc(intro)}</p>` : ''}
</div></section>
${qaBarHTML()}
<main class="view static-wrap" id="main">
<div data-near-banner data-near-passive></div>
${body}
</main>
${footerHTML()}
${tabBarHTML(tab)}
<script type="module" src="/js/static.js"></script>
</body>
</html>`;
}

function postalAddress(l) {
  const parts = (l.address || '').split(',').map(s => s.trim());
  return { '@type': 'PostalAddress', streetAddress: parts[0] || undefined, addressLocality: l.cityName, addressRegion: 'GA', postalCode: l.zip || undefined, addressCountry: 'US' };
}
const itemListLd = (listings, pageUrl) => ({
  '@type': 'ItemList', itemListElement: listings.slice(0, 10).map((l, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: { '@type': 'LegalService', name: l.name, telephone: l.phone || undefined, url: l.website || undefined, address: postalAddress(l), geo: l.lat != null ? { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng } : undefined, aggregateRating: l.rating ? { '@type': 'AggregateRating', ratingValue: l.rating, reviewCount: l.reviews || 1 } : undefined },
  })),
});
const crumbLd = (crumbs) => ({ '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: ORIGIN + c.href })) });

// ─── listing page ──────────────────────────────────────────────────────────────
function listingPage({ urlPath, title, desc, h1, sub, eyebrow, intro, breadcrumbs, listings, sections = [], faq = [], index = true, priority = 0.5, geo = null, notice = '', nearby = null, listTitle = null, controls = true, cap = null, about = null, capNote = null }) {
  const canonical = ORIGIN + '/' + urlPath.replace(/\/?$/, '/');
  const ranked = top(listings, 10);            // top 10 still feeds the ItemList structured data
  const sorted = [...listings].sort(byRank);   // one ranked list for the page (no "Top 10" split)
  const all = cap ? sorted.slice(0, cap) : sorted;   // cap big leaderboards (full list lives on the city/area pages)
  const SHOW = 20;                             // visible before "show more"; the rest stay crawlable
  const g = groupEntity(listings);
  // The snippet is the hand written, search intent description; the longer
  // intro only backs it up when a page has none.
  const metaDesc = desc ? clamp(desc, 158) : clamp(intro, 158);
  const aboutHTML = about && about.html ? `<section class="page-about"><div class="section-head"><h2 class="section-title">${esc(about.title)}</h2></div>${about.html}</section>` : '';
  const body = `
<div class="stat-row">
  <div class="stat"><div class="stat-num">${nf(listings.length)}</div><div class="stat-label">Listings</div></div>
  <div class="stat"><div class="stat-num">${nf(g.firm.length)}</div><div class="stat-label">Firms</div></div>
  <div class="stat"><div class="stat-num">${nf(g.attorney.length)}</div><div class="stat-label">Attorneys</div></div>
</div>
${notice}
${promoSlots()}
${controls && listings.length > 1 ? segmentedHTML(listings) : ''}
<div class="section-head"><h2 class="section-title">${esc(listTitle || `Top rated ${lc1(h1)}`)}</h2></div>
<p class="rank-note">Ranked by rating and review volume from public sources. Paid placements are marked Promoted. <a href="/rankings/">How we rank</a></p>
<div class="card-list" data-more-list>${all.map((l, i) => cardHTML(l, i + 1, i >= SHOW ? 'card--collapsed' : '')).join('\n')}</div>
${all.length > SHOW ? `<button class="more-btn" data-more-btn>Show ${Math.min(20, all.length - SHOW)} more lawyers</button>` : ''}
${cap && sorted.length > cap ? `<p class="rank-note">Showing the top ${nf(cap)} of ${nf(sorted.length)}. ${capNote || 'Browse by practice area or city for the full ranked list.'}</p>` : ''}
${nearby && nearby.listings.length ? `<div class="section-head"><h2 class="section-title">${esc(nearby.title || `More lawyers near ${nearby.name}`)}</h2><span class="section-tagline">${esc(nearby.tagline || 'From the closest Georgia cities')}</span></div>
<div class="card-list">${nearby.listings.map(l => cardHTML(l, null)).join('\n')}</div>` : ''}
${aboutHTML}
${sections.join('\n')}
${faq.length ? dl(faq) : ''}
`;
  // No FAQPage schema: Google stopped showing FAQ rich results for sites like
  // this in 2023, so it was dead weight. The FAQ stays as visible HTML.
  const graph = [{ '@type': 'CollectionPage', name: title, description: metaDesc, url: canonical }, crumbLd(breadcrumbs), itemListLd(ranked, canonical)];
  out(urlPath, pageShell({ title, desc: metaDesc, canonical, h1, sub, eyebrow, intro, breadcrumbs, jsonld: { '@context': 'https://schema.org', '@graph': graph }, body, index, geo, tab: urlPath.startsWith('area/') ? 'areas' : 'browse' }), { index, priority });
}

// ── cities ───────────────────────────────────────────────────────────────────
for (const c of CITIES) {
  const g = groupEntity(c.listings), avg = avgRating(c.listings), tp = top(c.listings, 1)[0];
  const zipsHere = [...new Set(c.listings.map(l => l.zip).filter(Boolean))];
  const areas = AREAS.map(a => ({ a, list: c.listings.filter(l => l.typeSlug === a.slug) })).filter(x => x.list.length);
  const near = nearbyCities(c.slug, 6);
  // Thin city (under 5 listings): push human visitors to the nearest city with
  // real depth. Page stays indexed so Google searchers still land here.
  const bigger = c.count < 5 ? nearestBiggerCity(c.slug, 5) : null;
  const notice = bigger
    ? `<a class="combine-banner" href="/${bigger.slug}/"><span class="combine-pin">${svg('navigation', 16)}</span><span class="combine-text"><b>${esc(c.name)}</b> has ${nf(c.count)} listed ${c.count === 1 ? 'lawyer' : 'lawyers'}. See ${nf(bigger.count)} more in ${esc(bigger.name)}, GA nearby.</span><span class="combine-go">→</span></a>`
    : '';
  const v = pick(c.slug, [
    `Looking for a lawyer in ${c.name}, Georgia? Compare ${nf(c.count)} local law firms and attorneys${c.county ? ` in ${c.county} County` : ''}, ranked by rating and review volume.`,
    `${c.name}, GA is served by ${nf(c.count)} law practices in our directory, ${g.firm.length} firms and ${g.attorney.length} solo attorneys. Browse them by practice area, rating, or distance.`,
    `Find and compare ${nf(c.count)} ${c.name}, Georgia lawyers. Every listing shows ratings, reviews, and one-tap contact so you can reach the right firm fast.`,
  ]);
  const data = `${tp ? `${tp.name} is among the top rated. ` : ''}${avg ? `Across ${zipsHere.length || 'several'} ZIP code${zipsHere.length === 1 ? '' : 's'}, these practices average ${avg.toFixed(1)} stars. ` : ''}Filter by practice area or compare firms versus solo attorneys, then call or get directions in a tap.`;
  const intro = v + ' ' + data;
  const faq = [
    { q: `How many lawyers are in ${c.name}, GA?`, a: `Our directory lists ${nf(c.count)} lawyers and law firms in ${c.name}, Georgia, ${g.firm.length} law firms and ${g.attorney.length} solo attorneys${c.county ? `, all in ${c.county} County` : ''}.` },
    tp && tp.rating ? { q: `Who is a top rated lawyer in ${c.name}?`, a: `${tp.name} is one of the highest rated ${tp.type.toLowerCase()}s in ${c.name}, with ${tp.rating.toFixed(1)} stars across ${tp.reviews || 'multiple'} reviews.` } : null,
    { q: `What types of lawyers practice in ${c.name}?`, a: `${c.name} has ${areas.map(x => `${x.list.length} ${stripArea(x.a.name).toLowerCase()} ${x.list.length === 1 ? 'lawyer' : 'lawyers'}`).slice(0, 6).join(', ')}.` },
    { q: `Do ${c.name} lawyers offer free consultations?`, a: `Many do. Use the Call or Website button on any listing to ask about a free consultation, fees, and availability before you hire.` },
  ].filter(Boolean);
  const sections = [
    linkSection(`Practice areas in ${c.name}`, areas.map(({ a, list }) => chip(`/${c.slug}/${a.slug}/`, stripArea(a.name), list.length))),
    linkSection(`Lawyers near ${c.name}`, near.map(n => chip(`/${n.slug}/`, n.name, n.count))),
    c.countySlug ? linkSection('In the county', [chip(`/county/${c.countySlug}/`, `${c.county} County`, c.count)]) : '',
  ].filter(Boolean);
  const areaWords = areas.slice(0, 4).map(x => stripArea(x.a.name).toLowerCase());
  listingPage({
    urlPath: c.slug,
    title: mkTitle(`Lawyers in ${c.name}, GA | Top Law Firms and Attorneys (${YEAR})`),
    desc: `Compare ${nf(c.count)} ${c.name}, GA lawyers and law firms by rating and reviews.${areaWords.length ? ` ${areaWords.map((w, i) => i ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(', ')} and more.` : ''}`,
    h1: `Lawyers in ${c.name}, GA`, sub: c.county ? `${c.county} County · ${nf(c.count)} listings` : `${nf(c.count)} listings`,
    eyebrow: c.county ? `${c.county} County, Georgia` : 'Georgia',
    intro, breadcrumbs: [{ name: 'Home', href: '/' }, { name: 'Cities', href: '/directory/' }, { name: c.name, href: `/${c.slug}/` }],
    listings: c.listings, sections, faq, index: c.count >= MIN_INDEX, priority: 0.8, geo: { placename: `${c.name}, GA`, ...(CITY_CENT.get(c.slug) || {}) }, notice,
    nearby: (() => { const fill = nearbyFill(c.slug, c.count); return fill.length ? { name: c.name, listings: fill } : null; })(),
    cap: CAP.city, capNote: 'The practice area links below carry the full ranked list for each kind of case.',
    about: { title: `About lawyers in ${c.name}`, html: cityProse(c, g, areas, tp, avg) },
  });
  for (const { a, list } of areas) {
    const at = top(list, 1)[0], short = stripArea(a.name);
    const av = pick(c.slug + a.slug, [
      `Need ${a_an(short)} ${short.toLowerCase()} lawyer in ${c.name}, Georgia? We list ${nf(list.length)} ${a.group.toLowerCase()} ${list.length === 1 ? 'practice' : 'practices'} serving ${c.name}.`,
      `Compare ${nf(list.length)} ${a.name.toLowerCase()}${list.length === 1 ? '' : 's'} in ${c.name}, GA, ranked by rating and reviews.`,
      `${c.name}, Georgia ${short.toLowerCase()} lawyers: ${nf(list.length)} ${list.length === 1 ? 'practice' : 'practices'} you can call or get directions to in one tap.`,
    ]);
    const aIntro = (av + ' ' + (FACTS[a.slug] || '')).trim();
    const aFaq = [
      { q: `How much does ${a_an(short)} ${short.toLowerCase()} lawyer cost in ${c.name}?`, a: `Fees vary by case and firm. ${FACTS[a.slug] || ''} Ask each ${c.name} listing about fees and free consultations using the Call or Website button.` },
      at && at.rating ? { q: `Who is a top ${short.toLowerCase()} lawyer in ${c.name}?`, a: `${at.name} is among the highest rated ${short.toLowerCase()} practices serving ${c.name}, with ${at.rating.toFixed(1)} stars${at.reviews ? ` across ${at.reviews} reviews` : ''}.` } : null,
      { q: `How do I choose ${a_an(short)} ${short.toLowerCase()} lawyer in ${c.name}?`, a: `Compare ratings and reviews, confirm the lawyer handles ${a.group.toLowerCase()} matters, and ask about experience and fees in a first consultation. This page lists ${nf(list.length)} option${list.length === 1 ? '' : 's'} in ${c.name}.` },
    ].filter(Boolean);
    const cn = CITY_NOTES[c.slug] || {};
    const local = c.county
      ? `${c.name} is in ${c.county} County${cn.circuit ? `, part of the ${cn.circuit} Judicial Circuit` : ''}, so ${a.group.toLowerCase()} cases from ${c.name} are heard in the ${c.county} County courts${cn.seat ? ' here in town' : ''}.${cn.fed && ['bankruptcy', 'immigration', 'social-security', 'tax-irs', 'employment'].includes(a.slug) ? ` Federal matters go to the ${cn.fed}.` : ''}`
      : '';
    listingPage({
      urlPath: `${c.slug}/${a.slug}`,
      title: mkTitle(`${c.name}, GA ${short} Lawyers | Top Rated (${YEAR})`),
      desc: `Compare ${nf(list.length)} ${short.toLowerCase()} ${list.length === 1 ? 'lawyer' : 'lawyers'} in ${c.name}, GA by rating and reviews.${at && at.rating ? ` ${at.name} leads with ${at.rating.toFixed(1)} stars.` : ''} Call or visit their site from the listing.`,
      h1: `${a.name}s in ${c.name}, GA`, sub: `${nf(list.length)} listing${list.length === 1 ? '' : 's'} · ${c.name}`,
      eyebrow: `${c.name}, GA`,
      intro: aIntro, breadcrumbs: [{ name: 'Home', href: '/' }, { name: c.name, href: `/${c.slug}/` }, { name: short, href: `/${c.slug}/${a.slug}/` }],
      listings: list,
      sections: [
        linkSection(`${short} focus in ${c.name}`, (CITY_FOCUS.get(c.slug) || []).filter(f => f.sub.parent === a.slug).map(f => chip(focusHref(c.slug, f.sub), f.sub.label, f.matches.length))),
        linkSection('Related', [chip(`/${c.slug}/`, `All ${c.name} lawyers`, c.count), chip(`/area/${a.slug}/`, `${short} statewide`, a.count), ...near.slice(0, 3).map(n => chip(`/${n.slug}/${a.slug}/`, `${short} in ${n.name}`))]),
      ].filter(Boolean),
      faq: aFaq, index: list.length >= MIN_INDEX, priority: 0.6, geo: { placename: `${c.name}, GA`, ...(CITY_CENT.get(c.slug) || {}) },
      cap: CAP.cityArea, capNote: `See all ${c.name} lawyers or the statewide ${short.toLowerCase()} list for the rest.`,
      about: { title: `About ${short.toLowerCase()} lawyers in ${c.name}`, html: para(local, FACTS[a.slug], `We list ${nf(list.length)} ${short.toLowerCase()} ${list.length === 1 ? 'practice' : 'practices'} serving ${c.name}, ranked by published ratings and review counts.${at && at.rating ? ` ${at.name} currently ranks first with ${at.rating.toFixed(1)} stars${at.reviews ? ` from ${nf(at.reviews)} reviews` : ''}.` : ''} Compare a few, then ask each about fees and a first consultation.`) },
    });
  }
}

// ── city focus pages (/<city>/<focus>/) ───────────────────────────────────────
for (const c of CITIES) {
  for (const { sub, matches, rest } of CITY_FOCUS.get(c.slug) || []) {
    const parentType = TYPE_BY_SLUG[sub.parent] || '';
    const parentShort = stripArea(parentType);
    const tp = top(matches, 1)[0];
    const lbl = sub.label.toLowerCase();
    const near = nearbyCities(c.slug, 8).filter(n => (CITY_FOCUS.get(n.slug) || []).some(f => f.sub.slug === sub.slug)).slice(0, 3);
    listingPage({
      urlPath: `${c.slug}/${sub.slug}`,
      title: mkTitle(`${c.name}, GA ${sub.label} Lawyers | Top Rated (${YEAR})`),
      desc: `Compare ${nf(matches.length)} ${lbl} lawyers in ${c.name}, GA by rating and reviews${tp && tp.rating ? `, led by ${tp.name} at ${tp.rating.toFixed(1)} stars` : ''}, plus ${nf(rest.length)} more ${parentShort.toLowerCase()} ${rest.length === 1 ? 'lawyer' : 'lawyers'} nearby.`,
      h1: `${sub.label} Lawyers in ${c.name}, GA`, sub: `${nf(matches.length)} ${matches.length === 1 ? 'listing' : 'listings'} · ${c.name}`,
      eyebrow: `${c.name}, GA · ${parentShort}`,
      intro: `${sub.label} lawyers in ${c.name}, Georgia: ${nf(matches.length)} ${matches.length === 1 ? 'practice that names' : 'practices that name'} ${lbl} work, ranked by rating and reviews, followed by other ${parentShort.toLowerCase()} lawyers in ${c.name}.`,
      breadcrumbs: [{ name: 'Home', href: '/' }, { name: c.name, href: `/${c.slug}/` }, { name: parentShort, href: `/${c.slug}/${sub.parent}/` }, { name: sub.label, href: focusHref(c.slug, sub) }],
      listings: matches,
      listTitle: `Top rated ${lbl} lawyers in ${c.name}`,
      nearby: rest.length ? { name: c.name, listings: [...rest].sort(byRank).slice(0, 20), title: `More ${parentShort.toLowerCase()} lawyers in ${c.name}`, tagline: 'Also handle these cases' } : null,
      sections: [linkSection('Related', [
        chip(`/${c.slug}/${sub.parent}/`, `All ${parentShort.toLowerCase()} lawyers in ${c.name}`, matches.length + rest.length),
        chip(`/area/${sub.parent}/${sub.slug}/`, `${sub.label} statewide`, STATE_FOCUS.find(x => x.sub.slug === sub.slug)?.matches.length),
        chip(`/${c.slug}/`, `All ${c.name} lawyers`, c.count),
        ...near.map(n => chip(focusHref(n.slug, sub), `${sub.label} in ${n.name}`)),
      ].filter(Boolean))],
      faq: subFaq(sub, c.name, matches.length, tp),
      index: matches.length >= MIN_INDEX, priority: 0.5, geo: { placename: `${c.name}, GA`, ...(CITY_CENT.get(c.slug) || {}) },
      about: { title: `${sub.label} law in Georgia, in brief`, html: SUB_PROSE[sub.slug] ? SUB_PROSE[sub.slug](matches.length) : para(FACTS[sub.parent]) },
    });
  }
}

// ── counties ──────────────────────────────────────────────────────────────────
for (const c of COUNTIES) {
  const g = groupEntity(c.listings), tp = top(c.listings, 1)[0];
  const cities = [...new Set(c.listings.map(l => l.city))].map(s => CITIES.find(ci => ci.slug === s)).filter(Boolean).sort((a, b) => b.count - a.count);
  const areas = AREAS.map(a => ({ a, n: c.listings.filter(l => l.typeSlug === a.slug).length })).filter(x => x.n);
  const faq = [
    { q: `How many lawyers are in ${c.name} County, GA?`, a: `${nf(c.count)} lawyers and law firms across ${nf(cities.length)} ${cities.length === 1 ? 'city' : 'cities'} in ${c.name} County are listed here, ${g.firm.length} firms and ${g.attorney.length} solo attorneys.` },
    { q: `Which cities in ${c.name} County have lawyers listed?`, a: `${cities.slice(0, 8).map(ci => `${ci.name} (${ci.count})`).join(', ')}${cities.length > 8 ? ', and more' : ''}.` },
    tp && tp.rating ? { q: `Who is a top rated lawyer in ${c.name} County?`, a: `${tp.name} in ${tp.cityName} is among the highest rated, with ${tp.rating.toFixed(1)} stars${tp.reviews ? ` across ${tp.reviews} reviews` : ''}.` } : null,
  ].filter(Boolean);
  const seat = cities.find(ci => (CITY_NOTES[ci.slug] || {}).seat);
  const seatNote = seat ? CITY_NOTES[seat.slug] : null;
  listingPage({
    urlPath: `county/${c.slug}`,
    title: mkTitle(`Lawyers in ${c.name} County, GA | Top Attorneys (${YEAR})`),
    desc: `Compare ${nf(c.count)} lawyers and law firms across ${c.name} County, GA by city, practice area, rating and reviews. ${cities.slice(0, 3).map(ci => ci.name).join(', ')} and more.`,
    h1: `Lawyers in ${c.name} County, GA`, sub: `${nf(c.count)} listings · ${nf(cities.length)} ${cities.length === 1 ? 'city' : 'cities'}`,
    eyebrow: 'Georgia',
    intro: `Find a lawyer anywhere in ${c.name} County, Georgia. We list ${nf(c.count)} law firms and attorneys across ${nf(cities.length)} ${cities.length === 1 ? 'city' : 'cities'}, ranked by rating and review volume.`,
    breadcrumbs: [{ name: 'Home', href: '/' }, { name: 'Counties', href: '/directory/#counties' }, { name: `${c.name} County`, href: `/county/${c.slug}/` }],
    listings: c.listings,
    sections: [linkSection('Cities in this county', cities.map(ci => chip(`/${ci.slug}/`, ci.name, ci.count))), linkSection('By practice area', areas.map(({ a, n }) => chip(`/area/${a.slug}/`, stripArea(a.name), n)))],
    faq, priority: 0.7, geo: { placename: `${c.name} County, GA`, ...(centroid(c.listings) || {}) },
    cap: CAP.county, capNote: 'Open a city below for its full ranked list.',
    about: { title: `About lawyers in ${c.name} County`, html: para(
      `${seat ? `${seat.name} is the county seat of ${c.name} County, and the county’s Superior, Magistrate and Probate courts sit there${seatNote && seatNote.circuit ? `, part of the ${seatNote.circuit} Judicial Circuit` : ''}.` : `${c.name} County is in Georgia.`}${seatNote && seatNote.fed ? ` Federal cases go to the U.S. District Court for the ${seatNote.fed}.` : ''}`,
      `We list ${nf(c.count)} lawyers and law firms across ${joinList(cities.slice(0, 6).map(ci => `${ci.name} (${nf(ci.count)})`))}${cities.length > 6 ? ` and ${nf(cities.length - 6)} more ${cities.length - 6 === 1 ? 'city' : 'cities'}` : ''}: ${nf(g.firm.length)} firms and ${nf(g.attorney.length)} solo attorneys.${tp && tp.rating ? ` ${tp.name} in ${tp.cityName} currently ranks first with ${tp.rating.toFixed(1)} stars${tp.reviews ? ` across ${nf(tp.reviews)} reviews` : ''}.` : ''}`,
      `Rankings come from published ratings and review counts. Pick a city for the lawyers closest to you, or a practice area for the kind of case you have.`,
    ) },
  });
}

// ── zips ──────────────────────────────────────────────────────────────────────
for (const z of ZIPS) {
  const ci = CITIES.find(c => c.slug === z.citySlug);
  const faq = [
    { q: `How many lawyers are in the ${z.slug} ZIP code?`, a: `${nf(z.count)} lawyer${z.count === 1 ? '' : 's'} and law firm${z.count === 1 ? '' : 's'} in ${z.slug} (${z.city}, GA) are listed here, ranked by rating.` },
    { q: `What city is ZIP code ${z.slug}?`, a: `${z.slug} is in ${z.city}, Georgia${ci && ci.county ? `, ${ci.county} County` : ''}. See all ${z.city} lawyers for more options nearby.` },
  ];
  listingPage({
    urlPath: `zip/${z.slug}`,
    title: mkTitle(`Lawyers in ${z.slug}, ${z.city}, GA | Law Firms and Attorneys`),
    desc: `Compare ${nf(z.count)} lawyers and law firms in ZIP code ${z.slug}, ${z.city}, GA, ranked by rating and reviews. See all ${z.city} lawyers for more options nearby.`,
    h1: `Lawyers in ${z.slug}`, sub: `${z.city}, GA · ${nf(z.count)} listings`,
    eyebrow: `${z.city}, GA`,
    intro: `Lawyers and law firms in the ${z.slug} ZIP code (${z.city}, Georgia). ${nf(z.count)} local ${z.count === 1 ? 'listing' : 'listings'} ranked by rating.`,
    breadcrumbs: [{ name: 'Home', href: '/' }, { name: z.city, href: `/${z.citySlug}/` }, { name: z.slug, href: `/zip/${z.slug}/` }],
    listings: z.listings, sections: [linkSection('More in this city', [chip(`/${z.citySlug}/`, `All ${z.city} lawyers`, ci ? ci.count : undefined)])],
    faq, index: z.count >= MIN_INDEX, priority: 0.4, geo: { placename: `${z.city}, GA ${z.slug}`, ...(centroid(z.listings) || {}) },
    cap: CAP.zip, capNote: `See all ${z.city} lawyers for the full list.`,
  });
}

// ── practice areas ────────────────────────────────────────────────────────────
for (const a of AREAS) {
  const short = stripArea(a.name), tp = top(a.listings, 1)[0];
  const nFirm = a.listings.filter(l => l.entity === 'firm').length, nAtt = a.listings.filter(l => l.entity === 'attorney').length;
  // Every city with an indexable city×area page, not just the top 30: the city
  // grid IS the body of a statewide page (the cards are a sample), and it is
  // the only internal link many of those pages get.
  const cities = [...new Set(a.listings.map(l => l.city))].map(s => CITIES.find(ci => ci.slug === s)).filter(Boolean)
    .map(ci => ({ ...ci, n: a.listings.filter(l => l.city === ci.slug).length })).filter(ci => ci.n >= MIN_INDEX).sort((x, y) => y.n - x.n);
  const faq = [
    { q: `How many ${short.toLowerCase()} lawyers are in Georgia?`, a: `Our directory lists ${nf(a.count)} ${a.name.toLowerCase()}${a.count === 1 ? '' : 's'} across Georgia, ranked by rating and reviews.` },
    { q: `What should I know before hiring ${a_an(short)} ${short.toLowerCase()} lawyer in Georgia?`, a: FACTS[a.slug] || `Compare ratings, confirm the lawyer handles your type of matter, and ask about fees in a first consultation.` },
    tp && tp.rating ? { q: `Who is a top ${short.toLowerCase()} lawyer in Georgia?`, a: `${tp.name} in ${tp.cityName} is among the highest rated, with ${tp.rating.toFixed(1)} stars${tp.reviews ? ` across ${tp.reviews} reviews` : ''}.` } : null,
  ].filter(Boolean);
  listingPage({
    urlPath: `area/${a.slug}`,
    title: mkTitle(`Georgia ${short} Lawyers | Top Rated Attorneys (${YEAR})`),
    desc: `Compare ${nf(a.count)} ${short.toLowerCase()} lawyers across Georgia by city, rating and reviews. ${cities.slice(0, 3).map(ci => ci.name).join(', ')} and ${nf(Math.max(0, cities.length - 3))} more cities.`,
    h1: `${a.name}s in Georgia`, sub: `${nf(a.count)} listings statewide`,
    eyebrow: 'Georgia, statewide',
    intro: AREA_LEDE[a.slug] ? AREA_LEDE[a.slug](a) : (`Compare top rated ${a.name.toLowerCase()}s across Georgia. We list ${nf(a.count)} ${a.group.toLowerCase()} practices, both established law firms and solo attorneys, with ratings, reviews, and direct contact.` + (FACTS[a.slug] ? ' ' + FACTS[a.slug] : '')),
    breadcrumbs: [{ name: 'Home', href: '/' }, { name: 'Practice areas', href: '/areas/' }, { name: short, href: `/area/${a.slug}/` }],
    listings: a.listings, sections: [
      linkSection('Rank firms vs attorneys', [
        nFirm ? chip(`/firms/${a.slug}/`, `Top ${short.toLowerCase()} law firms`, nFirm) : null,
        nAtt ? chip(`/attorneys/${a.slug}/`, `Top ${short.toLowerCase()} attorneys`, nAtt) : null,
      ].filter(Boolean)),
      linkSection(`${short} by focus`, STATE_FOCUS.filter(x => x.sub.parent === a.slug).map(x => chip(`/area/${a.slug}/${x.sub.slug}/`, x.sub.label, x.matches.length))),
      linkSection(`${short} by city`, cities.map(ci => chip(`/${ci.slug}/${a.slug}/`, ci.name, ci.n))),
    ],
    faq, priority: 0.8, geo: { placename: 'Georgia', lat: 32.9, lng: -83.6 },
    cap: CAP.area, listTitle: `Top rated ${short.toLowerCase()} lawyers in Georgia`,
    capNote: `Pick a city below for every ${short.toLowerCase()} lawyer near you.`,
    about: { title: `${short} law in Georgia, in brief`, html: AREA_PROSE[a.slug] ? AREA_PROSE[a.slug](a) : para(FACTS[a.slug]) },
  });
}

// ── statewide focus pages (/area/<parent>/<focus>/) ───────────────────────────
for (const { sub, matches } of STATE_FOCUS) {
  const parentType = TYPE_BY_SLUG[sub.parent] || '', parentShort = stripArea(parentType);
  const tp = top(matches, 1)[0], lbl = sub.label.toLowerCase();
  const cities = CITIES.filter(c => (CITY_FOCUS.get(c.slug) || []).some(f => f.sub.slug === sub.slug && f.matches.length >= MIN_INDEX))
    .map(c => ({ c, n: CITY_FOCUS.get(c.slug).find(f => f.sub.slug === sub.slug).matches.length })).sort((x, y) => y.n - x.n);
  listingPage({
    urlPath: `area/${sub.parent}/${sub.slug}`,
    title: mkTitle(`Georgia ${sub.label} Lawyers | Top Rated Attorneys (${YEAR})`),
    desc: `Compare ${nf(matches.length)} ${lbl} lawyers across Georgia by city, rating and reviews.${cities.length ? ` ${cities.slice(0, 3).map(x => x.c.name).join(', ')}${cities.length > 3 ? ` and ${nf(cities.length - 3)} more cities` : ''}.` : ''}`,
    h1: `${sub.label} Lawyers in Georgia`, sub: `${nf(matches.length)} listings statewide`,
    eyebrow: `Georgia, statewide · ${parentShort}`,
    intro: `${sub.label} lawyers across Georgia: ${nf(matches.length)} practices that name ${lbl} work, ranked by rating and review volume.`,
    breadcrumbs: [{ name: 'Home', href: '/' }, { name: 'Practice areas', href: '/areas/' }, { name: parentShort, href: `/area/${sub.parent}/` }, { name: sub.label, href: `/area/${sub.parent}/${sub.slug}/` }],
    listings: matches, cap: CAP.area, listTitle: `Top rated ${lbl} lawyers in Georgia`,
    capNote: `Pick a city below for ${lbl} lawyers near you.`,
    sections: [
      linkSection(`${sub.label} by city`, cities.map(x => chip(focusHref(x.c.slug, sub), x.c.name, x.n))),
      linkSection('Related', [chip(`/area/${sub.parent}/`, `All ${parentShort.toLowerCase()} lawyers in Georgia`, AREAS.find(a => a.slug === sub.parent)?.count), ...STATE_FOCUS.filter(x => x.sub.parent === sub.parent && x.sub.slug !== sub.slug).map(x => chip(`/area/${sub.parent}/${x.sub.slug}/`, x.sub.label, x.matches.length))]),
    ],
    faq: subFaq(sub, 'Georgia', matches.length, tp), priority: 0.6, geo: { placename: 'Georgia', lat: 32.9, lng: -83.6 },
    about: { title: `${sub.label} law in Georgia, in brief`, html: SUB_PROSE[sub.slug] ? SUB_PROSE[sub.slug](matches.length) : para(FACTS[sub.parent]) },
  });
}

// ── individual listing profiles (/lawyer/<id>/) ────────────────────────────────
// Each listing gets its own crawlable page so it can rank for navigational
// "<firm name> <city/zip>" searches. To protect a young domain from thin/doorway
// penalties, these profiles are noindex,follow by default (see `index` below):
// they stay crawlable and pass link equity to the city/area pages without
// flooding the index with 5,000+ near-duplicate thin pages. Only PAID listings
// are indexed standalone.
// Precompute each listing's rank within its city×area peer group and within its
// practice area statewide, so a profile can state "Ranked No. 3 of 42 …". Built
// once (not per profile) from the same byRank order the list pages use, so the
// badge always matches the position on the list it links to.
// (no precomputed per-listing ranks: profiles are now an in-page modal)

// Individual lawyer profiles are no longer standalone pages — the card opens an
// in-page profile modal instead (built client-side from the card, see static.js
// openProfile). This keeps the repo to the aggregation pages that actually rank.

// ── firm vs attorney leaderboards (/firms/, /attorneys/, + per area) ──────────
// Dedicated ranked boards for each entity, since "best law firms" and "top
// attorneys" are distinct searches. Statewide board + one per practice area
// (gated to MIN_INDEX so we don't emit thin boards). The entity segmented filter
// is hidden here (the page IS one entity).
const ENTITIES = [
  { key: 'firm', path: 'firms', noun: 'Law Firms', nounLc: 'law firms', one: 'law firm' },
  { key: 'attorney', path: 'attorneys', noun: 'Attorneys', nounLc: 'attorneys', one: 'attorney' },
];
for (const e of ENTITIES) {
  const all = LAWYERS.filter(l => l.entity === e.key);
  if (!all.length) continue;
  const other = e.key === 'firm' ? { path: 'attorneys', noun: 'attorneys' } : { path: 'firms', noun: 'law firms' };
  const eAreas = AREAS.map(a => ({ a, list: all.filter(l => l.typeSlug === a.slug) })).filter(x => x.list.length);
  const tp = top(all, 1)[0];
  const faq = [
    { q: `How many ${e.nounLc} are listed in Georgia?`, a: `${SITE} ranks ${nf(all.length)} ${e.nounLc} across Georgia by rating and review volume from public sources.` },
    tp && tp.rating ? { q: `What is a top rated ${e.one} in Georgia?`, a: `${tp.name} in ${tp.cityName} is among the highest rated ${e.nounLc}, with ${tp.rating.toFixed(1)} stars${tp.reviews ? ` across ${nf(tp.reviews)} reviews` : ''}.` } : null,
    { q: `How are these ${e.nounLc} ranked?`, a: `By average rating and number of reviews from public sources, with paid placements marked Promoted. See How we rank for the full method.` },
  ].filter(Boolean);
  listingPage({
    urlPath: e.path,
    title: mkTitle(`Best ${e.noun} in Georgia | Top Rated ${e.noun} (${YEAR})`),
    desc: `Compare the best ${e.nounLc} in Georgia, ranked by rating and review volume. ${nf(all.length)} ${e.nounLc} with ratings, reviews, and direct contact. Updated ${YEAR}.`,
    h1: `Top ${e.noun} in Georgia`, sub: `${nf(all.length)} ${e.nounLc} statewide`, eyebrow: 'Georgia, statewide',
    intro: `Find and compare the best ${e.nounLc} in Georgia, ranked by rating and review volume from public sources. We list ${nf(all.length)} ${e.nounLc} statewide, each with ratings, reviews, and one tap to call. Looking for ${other.noun} instead? See the ${other.noun} board.`,
    breadcrumbs: [{ name: 'Home', href: '/' }, { name: `Top ${e.noun}`, href: `/${e.path}/` }],
    listings: all, controls: false, cap: 100, listTitle: `Top ${Math.min(100, all.length)} ${e.noun} in Georgia`,
    sections: [
      linkSection(`${e.noun} by practice area`, eAreas.map(({ a, list }) => chip(`/${e.path}/${a.slug}/`, stripArea(a.name), list.length))),
      linkSection('Other leaderboards', [chip(`/${other.path}/`, `Top ${other.noun}`, LAWYERS.filter(l => l.entity !== e.key).length), chip('/rankings/', 'How we rank')]),
    ],
    faq, priority: 0.8, geo: { placename: 'Georgia', lat: 32.9, lng: -83.6 },
  });
  for (const { a, list } of eAreas) {
    const short = stripArea(a.name);
    const otherN = LAWYERS.filter(l => l.entity !== e.key && l.typeSlug === a.slug).length;
    listingPage({
      urlPath: `${e.path}/${a.slug}`,
      title: mkTitle(`Best ${short} ${e.noun} in Georgia (${YEAR})`),
      desc: `Compare the best ${short.toLowerCase()} ${e.nounLc} in Georgia, ranked by rating and reviews. ${nf(list.length)} ${e.nounLc} with direct contact. Updated ${YEAR}.`,
      h1: `Top ${short} ${e.noun} in Georgia`, sub: `${nf(list.length)} ${e.nounLc}`, eyebrow: 'Georgia, statewide',
      intro: `Find and compare the best ${short.toLowerCase()} ${e.nounLc} in Georgia, ranked by rating and review volume. We list ${nf(list.length)} ${short.toLowerCase()} ${e.nounLc} statewide.` + (FACTS[a.slug] ? ' ' + FACTS[a.slug] : ''),
      breadcrumbs: [{ name: 'Home', href: '/' }, { name: `Top ${e.noun}`, href: `/${e.path}/` }, { name: short, href: `/${e.path}/${a.slug}/` }],
      listings: list, controls: false, cap: 100, listTitle: `Top ${Math.min(100, list.length)} ${short} ${e.noun} in Georgia`,
      sections: [linkSection('Related', [
        chip(`/area/${a.slug}/`, `All ${short} lawyers`, a.count),
        otherN ? chip(`/${other.path}/${a.slug}/`, `${short} ${other.noun}`, otherN) : null,
        chip(`/${e.path}/`, `All ${e.noun}`, all.length),
      ].filter(Boolean))],
      faq: [], index: list.length >= MIN_INDEX, priority: 0.6, geo: { placename: 'Georgia', lat: 32.9, lng: -83.6 },
    });
  }
}

// ── directory hub ─────────────────────────────────────────────────────────────
// A "type to filter" box per section, enhanced + persisted (localStorage) by
// static.js. The chips ARE the indexable content; the input only hides/shows
// them client side, so the page stays fully crawlable with JS off. The section
// id doubles as the #anchor the footer links to (#cities / #counties / #zips).
function filterSection(key, title, noun, arr) {
  if (!arr.length) return '';
  const sortBtn = (s, label, on) => `<button class="dir-sort-btn${on ? ' is-active' : ''}" type="button" data-sort="${s}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  return `<section class="dir-section" id="${key}" data-filter-section="${key}">
  <div class="section-head"><h2 class="section-title">${esc(title)}</h2>
    <div class="dir-sort" role="group" aria-label="Sort ${esc(title)}">${sortBtn('alpha', 'A to Z', true)}${sortBtn('rated', 'Top rated')}${sortBtn('most', 'Most')}${sortBtn('least', 'Least')}</div>
  </div>
  <div class="dir-filter">${svg('search', 16)}<input class="dir-filter-input" type="search" enterkeyhint="search" placeholder="Filter ${esc(noun)}…" aria-label="Filter ${esc(title)}" data-filter-input></div>
  <div class="chips chips--wrap" data-filter-chips>${arr.join('')}</div>
  <p class="dir-empty" data-filter-empty hidden>No ${esc(noun)} match that filter.</p>
</section>`;
}
// A place's headline number for the browse chips: its highest ranked lawyer's
// star rating, plus that lawyer's name as a tooltip. Powers the "Top rated" sort.
const placeChip = (href, label, list) => {
  const t = top(list, 1)[0];
  const rating = t && t.rating ? t.rating : null;
  const tip = t ? `Top ${label}: ${t.name}${t.rating ? ` (${t.rating.toFixed(1)}★)` : ''}` : null;
  return chip(href, label, list.length, rating, tip);
};
(function directoryPage() {
  const canonical = ORIGIN + '/directory/';
  const boards = linkSection('Leaderboards', [
    chip('/firms/', 'Top law firms', LAWYERS.filter(l => l.entity === 'firm').length),
    chip('/attorneys/', 'Top attorneys', LAWYERS.filter(l => l.entity === 'attorney').length),
    chip('/rankings/', 'How we rank'),
  ]);
  const body = `${boards}
${filterSection('areas', 'Practice areas', 'practice areas', AREAS.map(a => placeChip(`/area/${a.slug}/`, stripArea(a.name), a.listings)))}
${filterSection('cities', `Cities (${nf(CITIES.length)})`, 'cities', [...CITIES].sort((a, b) => a.name.localeCompare(b.name)).map(c => placeChip(`/${c.slug}/`, c.name, c.listings)))}
${filterSection('counties', `Counties (${nf(COUNTIES.length)})`, 'counties', [...COUNTIES].sort((a, b) => a.name.localeCompare(b.name)).map(c => placeChip(`/county/${c.slug}/`, `${c.name} County`, c.listings)))}
${filterSection('zips', `ZIP codes (${nf(ZIPS.length)})`, 'ZIP codes', [...ZIPS].sort((a, b) => a.slug.localeCompare(b.slug)).map(z => placeChip(`/zip/${z.slug}/`, z.slug, z.listings)))}`;
  const jsonld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'CollectionPage', name: `Directory | ${SITE}`, url: canonical }, crumbLd([{ name: 'Home', href: '/' }, { name: 'Directory', href: '/directory/' }])] };
  out('directory', pageShell({ title: `Browse Georgia Lawyers by City, County and ZIP | ${SITE}`, desc: `Browse every Georgia city, county, ZIP code, and practice area in the directory. ${nf(LAWYERS.length)} law firms and attorneys across ${nf(CITIES.length)} cities and ${nf(COUNTIES.length)} counties.`, canonical, h1: 'Browse the directory', sub: `${nf(LAWYERS.length)} lawyers across ${nf(CITIES.length)} cities`, eyebrow: 'Georgia', breadcrumbs: [{ name: 'Home', href: '/' }, { name: 'Directory', href: '/directory/' }], jsonld, body }), { index: true, priority: 0.9 });
})();

// ── practice-areas hub (/areas/) ───────────────────────────────────────────────
(function areasPage() {
  const canonical = ORIGIN + '/areas/';
  const ordered = [...AREAS].sort((a, b) => b.count - a.count);
  const body = `
<p class="area-intro">Browse Georgia lawyers by what you need help with. We list ${nf(LAWYERS.length)} law firms and attorneys across ${ordered.length} practice areas, from personal injury and criminal defense to family law, real estate, and bankruptcy, each with ratings, reviews, and one tap contact.</p>
${linkSection(`Practice areas (${ordered.length})`, ordered.map(a => chip(`/area/${a.slug}/`, stripArea(a.name), a.count)))}`;
  const jsonld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', name: `Practice areas | ${SITE}`, url: canonical },
    { '@type': 'ItemList', itemListElement: ordered.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: stripArea(a.name), url: ORIGIN + `/area/${a.slug}/` })) },
    crumbLd([{ name: 'Home', href: '/' }, { name: 'Practice areas', href: '/areas/' }]) ] };
  out('areas', pageShell({ title: `Browse Lawyers by Practice Area in Georgia | ${SITE}`, desc: `Find Georgia lawyers by practice area. Personal injury, criminal defense, family, real estate, bankruptcy and more, with ratings, reviews, and direct contact.`, canonical, h1: 'Practice areas', sub: `${ordered.length} areas of law across Georgia`, eyebrow: 'Georgia', breadcrumbs: [{ name: 'Home', href: '/' }, { name: 'Practice areas', href: '/areas/' }], jsonld, body, tab: 'areas' }), { index: true, priority: 0.9 });
})();

// ── home section builders ─────────────────────────────────────────────────────
function trustBandHTML() {
  const avg = avgRating(LAWYERS);
  const cell = (n, l) => `<div class="trust-cell"><div class="trust-num">${n}</div><div class="trust-label">${l}</div></div>`;
  return `<div class="trust-band">${cell(nf(LAWYERS.length), 'Lawyers')}${cell(CITIES.length, 'Cities')}${cell(COUNTIES.length, 'Counties')}${cell(avg ? avg.toFixed(1) + '★' : ZIPS.length, avg ? 'Avg rating' : 'ZIP codes')}</div>`;
}
const ISSUES = [
  ['I was in an accident', 'personal-injury'], ['I’m getting divorced', 'family-divorce'],
  ['I was charged with a crime', 'criminal-defense'], ['I’m facing debt or bankruptcy', 'bankruptcy'],
  ['I need a will or estate plan', 'estate-elder'], ['I have an immigration matter', 'immigration'],
  ['I’m buying or selling property', 'real-estate'],
  ['I faced discrimination or was fired', 'employment'], ['I have a tax or IRS problem', 'tax-irs'],
  ['I can’t work due to a disability', 'social-security'], ['I need general legal help', 'general-practice'],
];
function issueFinderHTML() {
  const cells = ISSUES.map(([q, slug]) => { const a = AREAS.find(x => x.slug === slug); if (!a) return ''; return `<a class="issue" href="/area/${slug}/"><span class="issue-q">${q}</span><span class="issue-a">${stripArea(a.name)} · ${nf(a.count)} lawyers</span></a>`; }).join('');
  return `<section class="home-section"><div class="section-head"><h2 class="section-title">What do you need help with?</h2></div><div class="issue-grid">${cells}</div></section>`;
}
function citySpotlightsHTML() {
  const cards = CITIES.slice(0, 8).map(c => {
    const t3 = top(c.listings, 3);
    const items = t3.map((l, i) => `<li><span class="spot-rank">${i + 1}</span><span class="spot-name">${esc(l.name)}</span>${l.rating ? `<span class="spot-rate">${l.rating.toFixed(1)}★</span>` : ''}</li>`).join('');
    return `<div class="spot"><div class="spot-head"><h3 class="spot-city">${esc(c.name)}</h3><a href="/${c.slug}/">See all ${nf(c.count)} →</a></div><ol class="spot-list">${items}</ol></div>`;
  }).join('');
  return `<section class="home-section"><div class="section-head"><h2 class="section-title">Top-rated by city</h2></div><div class="spot-grid">${cards}</div></section>`;
}
function howItWorksHTML() {
  const step = (n, t, d) => `<div class="step"><div class="step-n">${n}</div><div class="step-t">${t}</div><div class="step-d">${d}</div></div>`;
  return `<section class="home-section"><div class="section-head"><h2 class="section-title">How it works</h2></div><div class="steps">${step(1, 'Search', 'Find lawyers by city, ZIP, or what you need help with.')}${step(2, 'Compare', 'Check ratings, reviews, and practice areas side by side.')}${step(3, 'Contact', 'Call, get directions, or visit their site in one tap.')}</div></section>`;
}
function lawyerCtaHTML() {
  return `<section class="home-section"><a class="cta-band" href="mailto:${CONTACT}?subject=${encodeURIComponent('Get my firm listed')}"><div><div class="cta-title">Are you a lawyer?</div><div class="cta-sub">Get your firm listed and pinned to the top of your city.</div></div><span class="cta-go">${svg('sparkles', 18, true)}</span></a></section>`;
}
const HOME_FAQ = [
  { q: 'Is this directory free to use?', a: 'Yes. Browsing, searching, and contacting any lawyer in the Georgia Lawyer Directory is completely free for the public.' },
  { q: 'How are the lawyers ranked?', a: 'Listings are ordered by rating and review volume from public sources, with paid placements clearly marked. We are an independent directory and do not vet or endorse any lawyer.' },
  { q: 'How do I get my law firm listed?', a: 'Claim your free listing, or take a Standard or Premium placement that pins your firm above the free results in your city. See the pricing page for current placement options and rates.' },
  { q: 'Are these lawyers vetted or recommended?', a: 'No. This is a directory, not a referral service. Listings come from public sources and do not constitute an endorsement, and nothing here is legal advice.' },
];
function homeFaqHTML() {
  return `<div class="faq">${HOME_FAQ.map(f => `<div class="faq-item"><h3 class="faq-q">${esc(f.q)}</h3><p class="faq-a">${esc(f.a)}</p></div>`).join('')}</div>`;
}

// ── home (index.html) — static, rich, clean-URL links, enhanced by static.js ──
(function home() {
  const gaTop = top(LAWYERS, 10);
  const homeBody = `<div class="hero">
<button class="install-btn install-btn--hero" data-install>${svg('download', 16)}<span>Install</span></button>
<div class="hero-inner">
<p class="hero-eyebrow">Georgia, statewide</p>
<h1 class="hero-title">Find a lawyer in Georgia, near you.</h1>
<p class="hero-sub">Compare ${nf(LAWYERS.length)} law firms and attorneys across Georgia by city, county, ZIP, or practice area.</p>
<button class="btn btn--primary btn--lg btn--hero" data-near>${svg('crosshair', 20)}<span>Find lawyers near me</span></button>
<form class="search" data-search><span class="search-ic">${svg('search', 18)}</span><input class="search-input" type="search" placeholder="Search firm, attorney, city or area…" enterkeyhint="search"></form>
${trustBandHTML()}
</div>
</div>
<div data-near-banner></div>
${qaBarHTML(false)}
<section class="home-section"><div class="section-head"><h2 class="section-title">Featured Attorneys</h2><span class="section-tagline">Premium placement, seen first</span></div>
<div class="featured-grid featured-grid--premium">${promoCardHTML('premium')}</div></section>
<section class="home-section"><div class="section-head"><h2 class="section-title">Standard Listings</h2><span class="section-tagline">Listed above the free results</span></div>
<div class="featured-grid featured-grid--standard">${promoCardHTML('standard')}</div></section>
${issueFinderHTML()}
${citySpotlightsHTML()}
${docketHTML(gaTop)}
<section class="home-section">${linkSection('Practice areas', AREAS.map(a => chip(`/area/${a.slug}/`, stripArea(a.name), a.count)))}</section>
${howItWorksHTML()}
<section class="home-section">${linkSection('Top cities', CITIES.slice(0, 16).map(c => chip(`/${c.slug}/`, c.name, c.count)))}</section>
<section class="home-section">${linkSection('By county', COUNTIES.slice(0, 14).map(c => chip(`/county/${c.slug}/`, `${c.name} County`, c.count)))}</section>
${lawyerCtaHTML()}
<section class="home-section page-about"><div class="section-head"><h2 class="section-title">About this directory</h2></div>${para(
    `Georgia Lawyer Directory lists ${nf(LAWYERS.length)} lawyers and law firms across ${nf(CITIES.length)} Georgia cities and ${nf(COUNTIES.length)} counties, gathered from public sources and ranked by published ratings and review counts. It is a directory, not a referral service: we do not vet, endorse or recommend any lawyer, and nothing here is legal advice.`,
    `Start with the kind of case you have, such as <a href="/area/personal-injury/">personal injury</a>, <a href="/area/criminal-defense/">criminal defense</a>, <a href="/area/family-divorce/">divorce and family law</a> or <a href="/area/bankruptcy/">bankruptcy</a>, then narrow to your city. Each page explains how that area of Georgia law works and which local courts hear the case, so you know what to ask before you call.`,
  )}</section>
<section class="home-section"><div class="section-head"><h2 class="section-title">Frequently asked questions</h2></div>${homeFaqHTML()}</section>
<p style="margin:8px 0 0"><a class="chip" href="/directory/">Browse all ${nf(CITIES.length)} cities and ${nf(COUNTIES.length)} counties →</a></p>`;
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', name: SITE, alternateName: 'GA.Lawyers', url: ORIGIN + '/', potentialAction: { '@type': 'SearchAction', target: ORIGIN + '/search/?q={query}', 'query-input': 'required name=query' } },
    { '@type': 'Organization', name: SITE, alternateName: 'GA.Lawyers', url: ORIGIN + '/', areaServed: 'US-GA' },
  ] };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${GTAG}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5">
<title>Find a Lawyer in Georgia | ${SITE} (${YEAR})</title>
<meta name="description" content="Find and compare ${nf(LAWYERS.length)} lawyers and law firms across Georgia by city, county, ZIP or practice area, ranked by ratings and reviews. Personal injury, divorce, criminal defense and more.">
<meta name="theme-color" content="#1a1a1f" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a1a1f" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="GA Lawyers">
<meta name="geo.region" content="US-GA">
<link rel="canonical" href="${ORIGIN}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${SITE} | Top Lawyers and Law Firms in Georgia">
<meta property="og:description" content="Find and compare lawyers and law firms across Georgia by city, county, ZIP, or practice area.">
<meta property="og:url" content="${ORIGIN}/">
${HEAD_SOCIAL}
<meta name="twitter:card" content="summary_large_image">
${PRECONNECT}
${HEAD_PWA}
<link rel="stylesheet" href="/css/style.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
${SKIP}
${NOSCRIPT}
<main class="view view--home" id="main">${homeBody}</main>
${footerHTML()}
${tabBarHTML('home')}
<script type="module" src="/js/static.js"></script>
</body>
</html>`;
  writeFileSync(join(ROOT, 'index.html'), html);
})();

// ── dynamic pages (search / saved / visited) — static shell + collections.js ──
function appShell({ urlPath, title, desc, h1, eyebrow, mode, index = false }) {
  const canonical = ORIGIN + '/' + urlPath.replace(/\/?$/, '/');
  const searchUi = mode === 'search'
    ? `<div class="search search--page" data-search-page><span class="search-ic">${svg('search', 18)}</span><input class="search-input" type="search" placeholder="Search Georgia lawyers…" enterkeyhint="search"></div>` : '';
  const body = `<section class="page-hero"><button class="install-btn install-btn--hero" data-install>${svg('download', 16)}<span>Install</span></button><div class="page-hero-inner">
<nav class="breadcrumb"><a href="/">Home</a><span class="crumb-sep">›</span><span>${esc(h1)}</span></nav>
<p class="hero-eyebrow">${esc(eyebrow)}</p><h1 class="hero-title">${esc(h1)}</h1>
</div></section>
${qaBarHTML()}
<main class="view static-wrap" id="main">${searchUi}<div id="collection" data-mode="${mode}"></div></main>
${footerHTML()}${tabBarHTML(mode === 'near' ? 'near' : 'browse')}
<script type="module" src="/js/static.js"></script>
<script type="module" src="/js/collections.js"></script>`;
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">${GTAG}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${attr(desc)}">
<meta name="robots" content="${index ? 'index, follow' : 'noindex, follow'}">
<link rel="canonical" href="${canonical}"><meta name="theme-color" content="#1a1a1f">
<meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(desc)}">${HEAD_SOCIAL}<meta name="twitter:card" content="summary_large_image">
${PRECONNECT}
${HEAD_PWA}<link rel="stylesheet" href="/css/style.css">
</head><body class="static">${SKIP}
${NOSCRIPT}
${body}
</body></html>`;
  out(urlPath, html, { index });
}
// /search/ is an empty shell until JS runs, so it has nothing for Google to
// rank; noindex keeps it out of the way of the real pages (it stays crawlable).
appShell({ urlPath: 'search', title: `Search Georgia Lawyers | ${SITE}`, desc: `Search ${nf(LAWYERS.length)} Georgia lawyers and law firms by name, city, county, ZIP, or practice area.`, h1: 'Search', eyebrow: 'Find a lawyer', mode: 'search', index: false });
appShell({ urlPath: 'saved', title: `Saved Lawyers | ${SITE}`, desc: `Your saved Georgia lawyers and law firms.`, h1: 'Saved', eyebrow: 'Your shortlist', mode: 'saved' });
appShell({ urlPath: 'visited', title: `Recently Visited | ${SITE}`, desc: `Lawyers you recently viewed.`, h1: 'Visited', eyebrow: 'Recently viewed', mode: 'visited' });

// city centroids for client-side "near me" → nearest city redirect
writeFileSync(join(ROOT, 'js/data/city-centroids.js'),
  '// AUTO-GENERATED by scripts/generate-pages.mjs — slug → {lat,lng,name,n} for near-me.\n' +
  'export const CITY_CENTROIDS = ' + JSON.stringify(Object.fromEntries(CITIES.filter(c => CITY_CENT.get(c.slug)).map(c => {
    const ct = CITY_CENT.get(c.slug);
    return [c.slug, { lat: +ct.lat.toFixed(4), lng: +ct.lng.toFixed(4), name: c.name, n: c.count }];
  }))) + ';\n');

// ── info pages (pricing / privacy / terms) ───────────────────────────────────
function infoPage({ urlPath, title, desc, h1, eyebrow, body }) {
  const canonical = `${ORIGIN}/${urlPath}/`;
  const crumbs = [{ name: 'Home', href: '/' }, { name: h1, href: `/${urlPath}/` }];
  const jsonld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage', name: title, description: desc, url: canonical }, crumbLd(crumbs)] };
  out(urlPath, pageShell({ title, desc, canonical, h1, eyebrow, breadcrumbs: crumbs, jsonld, body }), { index: true, priority: 0.4 });
}
const mailtoC = (s) => `mailto:${CONTACT}?subject=${encodeURIComponent(s)}`;
infoPage({
  urlPath: 'rankings', eyebrow: 'Methodology', h1: 'How we rank',
  title: `How We Rank Georgia Lawyers and Law Firms | ${SITE}`,
  desc: `How ${SITE} orders its Top lists. Rankings reflect public ratings and review volume, with paid placements clearly marked. We do not vet or endorse any lawyer.`,
  body: `<p class="area-intro">${SITE} ranks ${nf(LAWYERS.length)} lawyers and law firms across Georgia so you can compare the strongest options first. Every Top list on this site is ordered the same way, using public signals, never our opinion. We are an independent directory, not a referral or vetting service, and a high rank is not an endorsement.</p>
<div class="legal">
<h2>What decides the order</h2>
<p>Each listing earns a score from two public signals: its <b>average star rating</b> and the <b>number of reviews</b> behind that rating. We weight the two together so that a lawyer with 4.9 stars from 200 reviews ranks above one with a perfect 5.0 from a single review, because a larger number of reviews gives more confidence that the rating is real. Listings with no reviews yet are shown as New and fall below rated practices.</p>
<h2>Where the data comes from</h2>
<p>Ratings, reviews, addresses, and contact details are aggregated from public sources such as review sites and Bing Maps. Numbers can be incomplete or out of date, so confirm details directly with the lawyer before you rely on them.</p>
<h2>Paid placement, clearly marked</h2>
<p>Attorneys can buy a Standard or Premium placement that pins their listing above the free results in their city and practice area. Paid listings always carry a <b>Promoted</b> label so you can tell them apart. Paid placement changes where a listing appears, it never changes a listing's rating or review count, and a rating can never be bought.</p>
<h2>Firms and attorneys</h2>
<p>Every listing is tagged as a <b>law firm</b> or an <b>individual attorney</b>, so you can rank either group on its own. See the <a href="/firms/">top law firms in Georgia</a> and the <a href="/attorneys/">top attorneys in Georgia</a>, or filter any city or practice area page by firm or attorney.</p>
<h2>Not legal advice, not an endorsement</h2>
<p>This is a directory. A ranking reflects public ratings and review volume, not our judgment of any lawyer's skill, and nothing here is legal advice. Contacting a lawyer through this site does not create an attorney client relationship.</p>
<h2>Are you a lawyer?</h2>
<p>More genuine client reviews are the surest way to climb the rankings. <a href="${mailtoC('Claim free listing')}">Claim your free listing</a> to keep your details current, or see <a href="/pricing/">placement options</a>.</p>
</div>`,
});
infoPage({
  urlPath: 'pricing', eyebrow: 'For attorneys', h1: 'Pricing',
  title: `Pricing for Attorneys | ${SITE}`,
  desc: `Free for the public. Attorneys can claim a free listing or take a Standard ($10/mo) or Premium ($20/mo) placement above the free results.`,
  body: `<p class="area-intro">Browsing and contacting any lawyer here is always free for the public. If you are an attorney, claim your free listing or take a paid placement that pins your firm above the free results in your city and practice area.</p>
<div class="pricing">
  <div class="price-card"><div class="price-tier">Free</div><div class="price-amt">$0</div>
    <ul class="price-list"><li>Your name, practice area, and city</li><li>Rating and review count</li><li>Call, directions, and website buttons</li><li>Listed in your city and practice area</li></ul>
    <a class="btn btn--primary" href="${mailtoC('Claim free listing')}">Claim free listing</a></div>
  <div class="price-card price-card--gold"><div class="price-tier">Standard</div><div class="price-amt">$10<span>/mo</span></div>
    <ul class="price-list"><li>Everything in Free</li><li>Listed above the free results in your city</li><li>Your photo and website highlighted</li></ul>
    <a class="btn btn--primary" href="${mailtoC('Standard placement ($10/mo)')}">Get Standard</a></div>
  <div class="price-card price-card--ink"><div class="price-tier">Premium</div><div class="price-amt">$20<span>/mo</span></div>
    <ul class="price-list"><li>Everything in Standard</li><li>Pinned to the top across your city and practice area</li><li>Featured on the home page Docket</li></ul>
    <a class="btn btn--gold" href="${mailtoC('Premium placement ($20/mo)')}">Get Premium</a></div>
</div>
<p class="legal-note">Placements are clearly marked. Rankings reflect ratings and verified reviews and are not for sale.</p>`,
});
infoPage({
  urlPath: 'privacy', eyebrow: 'Legal', h1: 'Privacy Policy',
  title: `Privacy Policy | ${SITE}`, desc: `How ${SITE}, an independent directory, handles information.`,
  body: `<div class="legal">
<p>This Privacy Policy explains how ${SITE} handles information. We are an independent directory, not a law firm or lawyer referral service.</p>
<h2>Information we show</h2><p>Listings are aggregated from public sources and include business name, address, phone, website, ratings, and reviews. We do not sell personal data.</p>
<h2>Information stored on your device</h2><p>Saved listings, recently viewed listings, and your detected city are stored only in your browser using local storage. They are not uploaded to us.</p>
<h2>Analytics and cookies</h2><p>We use Google Analytics to understand which pages help people find a lawyer. When you first visit, a cookie banner lets you accept or decline analytics cookies. Until you accept, analytics runs without cookies and does not identify you. If you accept, Google Analytics sets cookies to measure visits. We do not run advertising trackers and we do not sell personal data. You can change your choice by clearing this site's data in your browser.</p>
<h2>Contact</h2><p>Questions about privacy? <a href="${mailtoC('Privacy')}">Contact us</a>.</p>
</div>`,
});
infoPage({
  urlPath: 'terms', eyebrow: 'Legal', h1: 'Terms of Use',
  title: `Terms of Use | ${SITE}`, desc: `The terms for using ${SITE}.`,
  body: `<div class="legal">
<p>By using ${SITE} you agree to these terms.</p>
<h2>Not legal advice</h2><p>This is a directory, not a law firm or lawyer referral service. Nothing here is legal advice, and a listing is not an endorsement. Contacting an attorney through this site does not create an attorney client relationship.</p>
<h2>Accuracy</h2><p>Listings come from public sources and may be incomplete or out of date. Verify details directly with the attorney before relying on them.</p>
<h2>Attorney listings</h2><p>Paid placements are clearly marked. Rankings reflect ratings and verified reviews and are not for sale.</p>
<h2>Contact</h2><p>Questions about these terms? <a href="${mailtoC('Terms')}">Contact us</a>.</p>
</div>`,
});

// ── 404 ────────────────────────────────────────────────────────────────────────
writeFileSync(join(ROOT, '404.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">${GTAG}<meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found | ${SITE}</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/css/style.css">
<script>
// Old per-lawyer URLs (/lawyer/<firm-slug-city>/) were retired Jun 2026. GitHub
// Pages cannot 301, so send those visitors (and crawlers that still hold the
// link) to a search for the firm name instead of a dead end.
(function () {
  var m = location.pathname.match(/^\\/lawyer\\/([a-z0-9-]+)\\/?$/);
  if (m) location.replace('/search/?q=' + encodeURIComponent(m[1].replace(/-/g, ' ')));
})();
</script></head><body class="static">${NOSCRIPT}${headerHTML()}<main class="view static-wrap"><h1 class="static-h1">Page not found</h1><p class="static-sub">That page doesn’t exist. Browse the directory instead.</p><p><a class="btn btn--primary" href="/directory/">Browse all Georgia lawyers</a></p></main>${footerHTML()}</body></html>`);

// ── sitemap + robots ───────────────────────────────────────────────────────────
sitemap.unshift({ loc: ORIGIN + '/', priority: 1.0 });
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemap.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.changed === false ? (PREV_LASTMOD.get(u.loc) || today) : today}</lastmod><priority>${u.priority.toFixed(1)}</priority></url>`).join('\n') +
  `\n</urlset>\n`);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);

// ── service worker (offline shell + makes the app installable) ────────────────
// Cache name carries the version, so each build supersedes the old SW + cache.
writeFileSync(join(ROOT, 'sw.js'), `// AUTO-GENERATED by scripts/generate-pages.mjs
const CACHE = 'gal-${V}';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || network;
  })());
});
`);

// ── prune orphaned page folders (generator writes; this removes the stale) ────
const RESERVED = new Set(['css', 'js', 'data', 'scripts', 'assets', 'node_modules', '.git', '.github', '.vscode']);
const HUBS = new Set(['county', 'zip', 'area', 'lawyer', 'firms', 'attorneys', 'directory']);
let pruned = 0;
for (const e of readdirSync(ROOT, { withFileTypes: true })) {
  if (!e.isDirectory() || RESERVED.has(e.name)) continue;
  if (HUBS.has(e.name)) {
    if (e.name === 'directory') continue;
    for (const sub of readdirSync(join(ROOT, e.name), { withFileTypes: true })) {
      if (sub.isDirectory() && !written.has(`${e.name}/${sub.name}`)) { rmSync(join(ROOT, e.name, sub.name), { recursive: true, force: true }); pruned++; }
    }
    continue;
  }
  if (!written.has(e.name)) {                          // stale page folder (old city, etc.)
    if (existsSync(join(ROOT, e.name, 'index.html'))) { rmSync(join(ROOT, e.name), { recursive: true, force: true }); pruned++; }
    continue;
  }
  for (const sub of readdirSync(join(ROOT, e.name), { withFileTypes: true })) { // stale city×area
    if (sub.isDirectory() && !written.has(`${e.name}/${sub.name}`)) { rmSync(join(ROOT, e.name, sub.name), { recursive: true, force: true }); pruned++; }
  }
}

const idx = sitemap.length;
console.log(`Generated ${idx} indexable pages (+ noindex thin pages), pruned ${pruned} orphan folder(s).`);
console.log(`  cities ${nf(CITIES.length)} · counties ${nf(COUNTIES.length)} · zips ${nf(ZIPS.length)} · areas ${AREAS.length} · pre-rendered home · /directory/`);
console.log(`  per page: unique intro + FAQ (FAQPage) + Breadcrumb + ItemList(LegalService) + geo meta`);
console.log(`  wrote index.html, 404.html, sitemap.xml (${idx}), robots.txt`);
