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
import { CATEGORIES, TYPE_BY_SLUG, SLUG_BY_TYPE } from '../js/data/categories.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'Georgia Lawyer Directory';
const ORIGIN = 'https://ga.lawyers.artivicolab.com';
const YEAR = new Date().getFullYear();
const V = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const MIN_INDEX = 3;
const CONTACT = 'artivicolab@gmail.com';
const OG_IMAGE = `${ORIGIN}/background-lawyer.jpg`;
const HEAD_SOCIAL = `<meta property="og:image" content="${OG_IMAGE}"><meta property="og:image:width" content="591"><meta property="og:image:height" content="887"><meta name="twitter:image" content="${OG_IMAGE}">`;
const PRECONNECT = `<link rel="preconnect" href="https://www.bing.com" crossorigin><link rel="dns-prefetch" href="https://www.bing.com">`;
const SKIP = `<a class="skip-link" href="#main">Skip to content</a>`;

// ─── helpers ──────────────────────────────────────────────────────────────────
const kebab = (s) => (s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const nf = (n) => Number(n || 0).toLocaleString('en-US');   // 1993 → "1,993"
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (s) => esc(s).replace(/'/g, '&#39;');
const stripArea = (name) => name.replace(/ (Lawyer|Attorney)$/, '');
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const pick = (seed, arr) => arr[hash(seed) % arr.length];
const a_an = (w) => /^[aeiou]/i.test(w) ? 'an' : 'a';
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
  .replace(/\b(the|law|office|offices|of|firm|group|llc|llp|pc|p\.c\.|associates|and|&|at|attorney|attorneys)\b/gi, ' ')
  .trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || (name || '?')[0].toUpperCase();
const stars = (r) => { if (!r) return ''; const f = Math.floor(r), up = r - f >= .75 ? 1 : 0, h = r - f >= .25 && r - f < .75; return '★'.repeat(f + up) + (h ? '⯪' : ''); };
const telHref = (p) => p ? 'tel:' + p.replace(/[^\d+]/g, '') : null;
const mapsHref = (l) => l.lat != null ? `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address || l.name)}`;
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
function nearbyCities(slug, n = 6) {
  const me = CITY_CENT.get(slug); if (!me) return [];
  return CITIES.filter(c => c.slug !== slug && CITY_CENT.get(c.slug))
    .map(c => ({ c, d: distanceMi(me, CITY_CENT.get(c.slug)) }))
    .sort((x, y) => x.d - y.d).slice(0, n).map(x => x.c);
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
const dl = (faq) => `<section class="faq"><h2 class="section-title">Frequently asked questions</h2>${faq.map(f => `<div class="faq-item"><h3 class="faq-q">${esc(f.q)}</h3><p class="faq-a">${esc(f.a)}</p></div>`).join('')}</section>`;
const faqLd = (faq) => ({ '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

const sitemap = [];
const written = new Set();
const out = (urlPath, html, { index = true, priority = 0.5 } = {}) => {
  const clean = urlPath.replace(/^\/?/, '').replace(/\/?$/, '');
  written.add(clean);
  mkdirSync(join(ROOT, clean), { recursive: true });
  writeFileSync(join(ROOT, clean, 'index.html'), html);
  if (index) sitemap.push({ loc: ORIGIN + '/' + clean + '/', priority });
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
function cardHTML(l, rank, extraClass = '') {
  const tel = telHref(l.phone);
  const kind = l.entity === 'firm' ? 'LAW FIRM' : 'ATTORNEY';
  const thumb = l.image
    ? `<div class="lc-thumb"><img src="${attr(l.image)}" alt="${attr(l.name + ', ' + l.type + ' in ' + l.cityName + ', GA')}" loading="lazy" decoding="async"></div>`
    : `<div class="lc-thumb lc-thumb--initials" aria-hidden="true">${esc(initials(l.name))}</div>`;
  const ratingPill = l.rating ? `<span class="lc-rating"><span class="lc-star">★</span> ${l.rating.toFixed(1)}</span>` : `<span class="lc-rating lc-rating--new">New</span>`;
  const reviews = l.reviews ? `<span class="lc-reviews">${nf(l.reviews)} review${l.reviews === 1 ? '' : 's'}${srcFlipHTML(reviewSourceList(l))}</span>` : '';
  return `<article class="lc${extraClass ? ' ' + extraClass : ''}" data-listing-id="${attr(l.id)}" data-entity="${l.entity}" data-rating="${l.rating || 0}" data-reviews="${l.reviews || 0}">
  <div class="lc-tabs">${rank != null ? `<span class="lc-tab lc-tab--rank">No. ${rank}</span>` : ''}<span class="lc-tab lc-tab--kind">${kind}</span></div>
  <div class="lc-card">
    <button class="lc-save" data-save-id="${attr(l.id)}" aria-pressed="false" aria-label="Save ${attr(l.name)}" title="Save">${svg('bookmark', 18)}</button>
    <div class="lc-main">${thumb}
      <div class="lc-info">
        <h3 class="lc-name">${esc(l.name)}</h3>
        <div class="lc-sub">${esc(l.type)}</div>
        <div class="lc-meta">${ratingPill}${reviews}</div>
        <div class="lc-addr">${svg('mapPin', 15)}<span>${esc(l.address || l.cityName + ', GA')}</span></div>
      </div>
    </div>
    <div class="lc-actions">
      ${tel ? `<a class="lc-btn lc-btn--call" href="${attr(tel)}" data-visit>${svg('phone', 16)}<span>Call</span></a>` : ''}
      <a class="lc-btn" href="${attr(mapsHref(l))}" target="_blank" rel="noopener" data-visit>${svg('navigation', 16)}<span>Directions</span></a>
      ${l.website ? `<a class="lc-btn" href="${attr(l.website)}" target="_blank" rel="noopener nofollow" data-visit>${svg('globe', 16)}<span>Website</span></a>` : ''}
    </div>
  </div>
</article>`;
}
function promoCardHTML(tier) {
  const s = tier === 'premium'
    ? { tag: 'PREMIUM', price: '$20', blurb: 'Top of the page across your city and practice area, with your photo, hours, and a consultation button.' }
    : { tag: 'STANDARD', price: '$10', blurb: 'Listed above the free results in your city, with your photo, hours, and website link.' };
  return `<article class="card promo promo--${tier}">
  <div class="promo-tag">${svg('sparkles', 13, true)}${s.tag}</div>
  <div class="promo-price">${s.price}<span class="promo-per">/mo</span></div>
  <h3 class="promo-title">Your practice here</h3>
  <p class="promo-blurb">${s.blurb}</p>
  <a class="btn ${tier === 'premium' ? 'btn--gold' : 'btn--primary'} promo-btn" href="mailto:${CONTACT}?subject=${encodeURIComponent(s.tag.charAt(0) + s.tag.slice(1).toLowerCase() + ' listing (' + s.price + '/mo)')}">Claim this spot</a>
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
  return `<nav class="tabbar" aria-label="Primary">${t('home', 'home', 'Home', '/')}${t('areas', 'scale', 'Areas', '/directory/#areas')}${t('near', 'mapPin', 'Near Me', null, true)}${t('browse', 'map', 'Browse', '/directory/')}</nav>`;
}
function segmentedHTML(listings) {
  const g = groupEntity(listings);
  return `<div class="controls"><div class="segmented" role="tablist">
  <button class="segment is-active" data-filter="all">All<span class="segment-count">${nf(listings.length)}</span></button>
  <button class="segment" data-filter="firm">Law Firms<span class="segment-count">${g.firm.length}</span></button>
  <button class="segment" data-filter="attorney">Attorneys<span class="segment-count">${g.attorney.length}</span></button>
</div></div>`;
}
const chip = (href, label, count) => `<a class="chip" href="${attr(href)}">${esc(label)}${count != null ? `<span class="chip-count">${nf(count)}</span>` : ''}</a>`;
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
    <div><div class="foot-h">Find counsel</div><nav class="foot-links"><a href="/area/personal-injury/">By practice area</a><a href="/directory/">By city</a><a href="/">The Georgia Docket</a><a href="/directory/#counties">By county</a></nav></div>
    <div><div class="foot-h">For attorneys</div><nav class="foot-links"><a href="/pricing/">Pricing</a><a href="${m('Claim free listing')}">Claim your profile</a><a href="${m('Premium placement')}">Premium placement</a></nav></div>
    <div><div class="foot-h">Practice areas</div><nav class="foot-links">${areaLinks}</nav></div>
    <div><div class="foot-h">The directory</div><nav class="foot-links"><a href="https://artivicolab.com" target="_blank" rel="noopener">About Artivicolab</a><a href="${m(SITE)}">Contact us</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a></nav></div>
  </div>
  <p class="foot-disclaimer"><b>Attorney advertising.</b> ${SITE} is an independent directory, not a law firm or lawyer referral service, and does not provide legal advice or endorse any attorney. Listings marked Premium are paid placements; rankings reflect ratings and verified reviews and are not for sale. Prior results do not guarantee a similar outcome. Contacting an attorney through this site does not create an attorney client relationship.</p>
  <div class="foot-brand">${TEMPLE}<div><div class="foot-brand-name">${SITE}</div><div class="foot-brand-tag">Every licensed attorney in Georgia.</div></div><div class="foot-copy">© ${YEAR}<br>Atlanta, GA</div></div>
  <p class="foot-made">Made by <a href="https://artivicolab.com" target="_blank" rel="noopener">Artivicolab</a> · <a href="${m(SITE)}">Contact</a></p>
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
  const bg = l.image ? `<img class="docket-champ-bg" src="${attr(l.image)}" alt="" loading="lazy" decoding="async" aria-hidden="true"><div class="docket-champ-scrim" aria-hidden="true"></div>` : '';
  return `${bg}<button class="docket-champ-save" data-save-id="${attr(l.id)}" aria-pressed="false" aria-label="Save ${attr(l.name)}" title="Save">${svg('bookmark', 18)}</button>
    <div class="docket-champ-body">
    <div class="docket-rank1">— No. ${rank} —</div>
    <div class="docket-champ-name">${esc(l.name)}</div>
    <div class="docket-champ-meta">${esc(l.type)} · ${esc(l.cityName)}</div>
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
    rating: l.rating || null, reviews: l.reviews || 0, srcs: reviewSourceList(l), av: avHTML(l), image: l.image || null, tel: telHref(l.phone), maps: mapsHref(l), web: l.website || null }));
  return `<section class="home-section"><div class="docket" data-docket>
  <span class="docket-corner docket-corner--tl"></span><span class="docket-corner docket-corner--br"></span>
  <div class="docket-head">
    <div class="docket-kicker">The Georgia Docket</div>
    <div class="docket-title">Top 10 lawyers, statewide</div>
    <div class="docket-sub">tap a name to see their details</div>
  </div>
  <div class="docket-champ" id="docket-champ" data-listing-id="${attr(champ.id)}">${champInner(champ, 1)}</div>
  <div class="docket-rows" id="docket-rows">${rest.map((l, i) => `<button class="docket-row" data-docket-i="${i + 1}">
    <span class="docket-roman">${romans[i]}</span>
    <span class="docket-av">${avHTML(l)}</span>
    <span class="docket-row-main"><span class="docket-row-name">${esc(l.name)}</span><span class="docket-row-meta">${esc(l.type)} · ${esc(l.cityName)}</span></span>
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
<link rel="stylesheet" href="/css/style.css?v=${V}">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body class="static">
${SKIP}
<section class="page-hero"><button class="install-btn install-btn--hero" data-install>${svg('download', 16)}<span>Install</span></button><div class="page-hero-inner">
<nav class="breadcrumb" aria-label="Breadcrumb">${crumbHTML}</nav>
${eyebrow ? `<p class="hero-eyebrow">${esc(eyebrow)}</p>` : ''}
<h1 class="hero-title">${esc(h1)}</h1>
${sub ? `<p class="hero-sub">${esc(sub)}</p>` : ''}
${intro ? `<p class="hero-lede">${esc(intro)}</p>` : ''}
</div></section>
${qaBarHTML()}
<main class="view static-wrap" id="main">
${body}
</main>
${footerHTML()}
${tabBarHTML(tab)}
<script type="module" src="/js/static.js?v=${V}"></script>
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
    item: { '@type': 'LegalService', name: l.name, telephone: l.phone || undefined, url: l.website || pageUrl, address: postalAddress(l), geo: l.lat != null ? { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng } : undefined, aggregateRating: l.rating ? { '@type': 'AggregateRating', ratingValue: l.rating, reviewCount: l.reviews || 1 } : undefined },
  })),
});
const crumbLd = (crumbs) => ({ '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: ORIGIN + c.href })) });

// ─── listing page ──────────────────────────────────────────────────────────────
function listingPage({ urlPath, title, desc, h1, sub, eyebrow, intro, breadcrumbs, listings, sections = [], faq = [], index = true, priority = 0.5, geo = null }) {
  const canonical = ORIGIN + '/' + urlPath.replace(/\/?$/, '/');
  const ranked = top(listings, 10);            // top 10 still feeds the ItemList structured data
  const all = [...listings].sort(byRank);      // one ranked list for the page (no "Top 10" split)
  const SHOW = 20;                             // visible before "show more"; the rest stay crawlable
  const g = groupEntity(listings);
  // The descriptive intro now lives in the page header (see pageShell); the
  // Google snippet is a count-aware (~155 char) cut of that same prose.
  const metaDesc = intro ? clamp(intro, 158) : desc;
  const body = `
<div class="stat-row">
  <div class="stat"><div class="stat-num">${nf(listings.length)}</div><div class="stat-label">Listings</div></div>
  <div class="stat"><div class="stat-num">${nf(g.firm.length)}</div><div class="stat-label">Firms</div></div>
  <div class="stat"><div class="stat-num">${nf(g.attorney.length)}</div><div class="stat-label">Attorneys</div></div>
</div>
${promoSlots()}
${listings.length > 1 ? segmentedHTML(listings) : ''}
<div class="section-head"><h2 class="section-title">${esc(h1)}</h2></div>
<div class="card-list" data-more-list>${all.map((l, i) => cardHTML(l, i < 3 ? i + 1 : null, i >= SHOW ? 'card--collapsed' : '')).join('\n')}</div>
${all.length > SHOW ? `<button class="more-btn" data-more-btn>Show ${Math.min(20, all.length - SHOW)} more lawyers</button>` : ''}
${sections.join('\n')}
${faq.length ? dl(faq) : ''}
`;
  const graph = [{ '@type': 'CollectionPage', name: title, description: metaDesc, url: canonical }, crumbLd(breadcrumbs), itemListLd(ranked, canonical)];
  if (faq.length) graph.push(faqLd(faq));
  out(urlPath, pageShell({ title, desc: metaDesc, canonical, h1, sub, eyebrow, intro, breadcrumbs, jsonld: { '@context': 'https://schema.org', '@graph': graph }, body, index, geo, tab: urlPath.startsWith('area/') ? 'areas' : 'browse' }), { index, priority });
}

// ── cities ───────────────────────────────────────────────────────────────────
for (const c of CITIES) {
  const g = groupEntity(c.listings), avg = avgRating(c.listings), tp = top(c.listings, 1)[0];
  const zipsHere = [...new Set(c.listings.map(l => l.zip).filter(Boolean))];
  const areas = AREAS.map(a => ({ a, list: c.listings.filter(l => l.typeSlug === a.slug) })).filter(x => x.list.length);
  const near = nearbyCities(c.slug, 6);
  const v = pick(c.slug, [
    `Looking for a lawyer in ${c.name}, Georgia? Compare ${nf(c.count)} local law firms and attorneys${c.county ? ` in ${c.county} County` : ''}, ranked by rating and review volume.`,
    `${c.name}, GA is served by ${nf(c.count)} law practices in our directory, ${g.firm.length} firms and ${g.attorney.length} solo attorneys. Browse them by practice area, rating, or distance.`,
    `Find and compare ${nf(c.count)} ${c.name}, Georgia lawyers. Every listing shows ratings, reviews, and one-tap contact so you can reach the right firm fast.`,
  ]);
  const data = `${tp ? `${tp.name} is among the top rated. ` : ''}${avg ? `Across ${zipsHere.length || 'several'} ZIP code${zipsHere.length === 1 ? '' : 's'}, these practices average ${avg.toFixed(1)} stars. ` : ''}Filter by practice area or compare firms versus solo attorneys, then call or get directions in a tap.`;
  const intro = v + ' ' + data;
  const faq = [
    { q: `How many lawyers are in ${c.name}, GA?`, a: `Our directory lists ${nf(c.count)} lawyers and law firms in ${c.name}, Georgia, ${g.firm.length} law firms and ${g.attorney.length} solo attorneys${c.county ? `, all in ${c.county} County` : ''}.` },
    tp && tp.rating ? { q: `Who is a top-rated lawyer in ${c.name}?`, a: `${tp.name} is one of the highest-rated ${tp.type.toLowerCase()}s in ${c.name}, with ${tp.rating.toFixed(1)} stars across ${tp.reviews || 'multiple'} reviews.` } : null,
    { q: `What types of lawyers practice in ${c.name}?`, a: `${c.name} has ${areas.map(x => `${x.list.length} ${stripArea(x.a.name).toLowerCase()} ${x.list.length === 1 ? 'lawyer' : 'lawyers'}`).slice(0, 6).join(', ')}.` },
    { q: `Do ${c.name} lawyers offer free consultations?`, a: `Many do. Use the Call or Website button on any listing to ask about a free consultation, fees, and availability before you hire.` },
  ].filter(Boolean);
  const sections = [
    linkSection(`Practice areas in ${c.name}`, areas.map(({ a, list }) => chip(`/${c.slug}/${a.slug}/`, stripArea(a.name), list.length))),
    linkSection(`Lawyers near ${c.name}`, near.map(n => chip(`/${n.slug}/`, n.name, n.count))),
    c.countySlug ? linkSection('In the county', [chip(`/county/${c.countySlug}/`, `${c.county} County`, c.count)]) : '',
  ].filter(Boolean);
  listingPage({
    urlPath: c.slug,
    title: `${nf(c.count)} Lawyers in ${c.name}, GA | Top Rated Law Firms (${YEAR}) | ${SITE}`,
    desc: `Compare ${nf(c.count)} lawyers and law firms in ${c.name}, Georgia. Ratings, reviews, practice areas, and direct contact. Updated ${YEAR}.`,
    h1: `Lawyers in ${c.name}, GA`, sub: c.county ? `${c.county} County · ${nf(c.count)} listings` : `${nf(c.count)} listings`,
    eyebrow: c.county ? `${c.county} County, Georgia` : 'Georgia',
    intro, breadcrumbs: [{ name: 'Home', href: '/' }, { name: 'Cities', href: '/directory/' }, { name: c.name, href: `/${c.slug}/` }],
    listings: c.listings, sections, faq, index: c.count >= MIN_INDEX, priority: 0.8, geo: { placename: `${c.name}, GA`, ...(CITY_CENT.get(c.slug) || {}) },
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
      at && at.rating ? { q: `Who is a top ${short.toLowerCase()} lawyer in ${c.name}?`, a: `${at.name} is among the highest-rated ${short.toLowerCase()} practices serving ${c.name}, with ${at.rating.toFixed(1)} stars${at.reviews ? ` across ${at.reviews} reviews` : ''}.` } : null,
      { q: `How do I choose ${a_an(short)} ${short.toLowerCase()} lawyer in ${c.name}?`, a: `Compare ratings and reviews, confirm the lawyer handles ${a.group.toLowerCase()} matters, and ask about experience and fees in a first consultation. This page lists ${nf(list.length)} option${list.length === 1 ? '' : 's'} in ${c.name}.` },
    ].filter(Boolean);
    listingPage({
      urlPath: `${c.slug}/${a.slug}`,
      title: `Top ${a.name}s in ${c.name}, GA (${YEAR}) | ${SITE}`,
      desc: `Compare ${nf(list.length)} ${a.name.toLowerCase()}${list.length === 1 ? '' : 's'} in ${c.name}, Georgia. Ratings, reviews, and direct contact. Updated ${YEAR}.`,
      h1: `${a.name}s in ${c.name}, GA`, sub: `${nf(list.length)} listing${list.length === 1 ? '' : 's'} · ${c.name}`,
      eyebrow: `${c.name}, GA`,
      intro: aIntro, breadcrumbs: [{ name: 'Home', href: '/' }, { name: c.name, href: `/${c.slug}/` }, { name: short, href: `/${c.slug}/${a.slug}/` }],
      listings: list,
      sections: [linkSection('Related', [chip(`/${c.slug}/`, `All ${c.name} lawyers`, c.count), chip(`/area/${a.slug}/`, `${short} statewide`, a.count), ...near.slice(0, 3).map(n => chip(`/${n.slug}/${a.slug}/`, `${short} in ${n.name}`))])],
      faq: aFaq, index: list.length >= MIN_INDEX, priority: 0.6, geo: { placename: `${c.name}, GA`, ...(CITY_CENT.get(c.slug) || {}) },
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
    tp && tp.rating ? { q: `Who is a top-rated lawyer in ${c.name} County?`, a: `${tp.name} in ${tp.cityName} is among the highest rated, with ${tp.rating.toFixed(1)} stars${tp.reviews ? ` across ${tp.reviews} reviews` : ''}.` } : null,
  ].filter(Boolean);
  listingPage({
    urlPath: `county/${c.slug}`,
    title: `Lawyers in ${c.name} County, GA | ${nf(c.count)} Law Firms and Attorneys (${YEAR}) | ${SITE}`,
    desc: `Find a lawyer in ${c.name} County, Georgia. ${nf(c.count)} law firms and attorneys across ${nf(cities.length)} ${cities.length === 1 ? 'city' : 'cities'}, ranked by rating. Updated ${YEAR}.`,
    h1: `Lawyers in ${c.name} County, GA`, sub: `${nf(c.count)} listings · ${nf(cities.length)} ${cities.length === 1 ? 'city' : 'cities'}`,
    eyebrow: 'Georgia',
    intro: `Find a lawyer anywhere in ${c.name} County, Georgia. We list ${nf(c.count)} law firms and attorneys across ${nf(cities.length)} ${cities.length === 1 ? 'city' : 'cities'}, ranked by rating and review volume, with one tap to call or get directions.`,
    breadcrumbs: [{ name: 'Home', href: '/' }, { name: 'Counties', href: '/directory/#counties' }, { name: `${c.name} County`, href: `/county/${c.slug}/` }],
    listings: c.listings,
    sections: [linkSection('Cities in this county', cities.map(ci => chip(`/${ci.slug}/`, ci.name, ci.count))), linkSection('By practice area', areas.map(({ a, n }) => chip(`/area/${a.slug}/`, stripArea(a.name), n)))],
    faq, priority: 0.7, geo: { placename: `${c.name} County, GA`, ...(centroid(c.listings) || {}) },
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
    title: `Lawyers in ${z.slug} (${z.city}, GA) | Law Firms and Attorneys | ${SITE}`,
    desc: `Lawyers and law firms in the ${z.slug} ZIP code, ${z.city}, Georgia. ${nf(z.count)} local listings ranked by rating, with direct contact.`,
    h1: `Lawyers in ${z.slug}`, sub: `${z.city}, GA · ${nf(z.count)} listings`,
    eyebrow: `${z.city}, GA`,
    intro: `Lawyers and law firms in the ${z.slug} ZIP code (${z.city}, Georgia). ${nf(z.count)} local ${z.count === 1 ? 'listing' : 'listings'} ranked by rating, with one tap to call or get directions.`,
    breadcrumbs: [{ name: 'Home', href: '/' }, { name: z.city, href: `/${z.citySlug}/` }, { name: z.slug, href: `/zip/${z.slug}/` }],
    listings: z.listings, sections: [linkSection('More in this city', [chip(`/${z.citySlug}/`, `All ${z.city} lawyers`, ci ? ci.count : undefined)])],
    faq, index: z.count >= MIN_INDEX, priority: 0.4, geo: { placename: `${z.city}, GA ${z.slug}`, ...(centroid(z.listings) || {}) },
  });
}

// ── practice areas ────────────────────────────────────────────────────────────
for (const a of AREAS) {
  const short = stripArea(a.name), tp = top(a.listings, 1)[0];
  const cities = [...new Set(a.listings.map(l => l.city))].map(s => CITIES.find(ci => ci.slug === s)).filter(Boolean)
    .map(ci => ({ ...ci, n: a.listings.filter(l => l.city === ci.slug).length })).sort((x, y) => y.n - x.n).slice(0, 30);
  const faq = [
    { q: `How many ${short.toLowerCase()} lawyers are in Georgia?`, a: `Our directory lists ${nf(a.count)} ${a.name.toLowerCase()}${a.count === 1 ? '' : 's'} across Georgia, ranked by rating and reviews.` },
    { q: `What should I know before hiring ${a_an(short)} ${short.toLowerCase()} lawyer in Georgia?`, a: FACTS[a.slug] || `Compare ratings, confirm the lawyer handles your type of matter, and ask about fees in a first consultation.` },
    tp && tp.rating ? { q: `Who is a top ${short.toLowerCase()} lawyer in Georgia?`, a: `${tp.name} in ${tp.cityName} is among the highest rated, with ${tp.rating.toFixed(1)} stars${tp.reviews ? ` across ${tp.reviews} reviews` : ''}.` } : null,
  ].filter(Boolean);
  listingPage({
    urlPath: `area/${a.slug}`,
    title: `Best ${a.name}s in Georgia (${YEAR}) | Top Rated | ${SITE}`,
    desc: `Compare the top ${short.toLowerCase()} lawyers across Georgia. ${nf(a.count)} ${a.group.toLowerCase()} practices with ratings, reviews, and direct contact. Updated ${YEAR}.`,
    h1: `${a.name}s in Georgia`, sub: `${nf(a.count)} listings statewide`,
    eyebrow: 'Georgia, statewide',
    intro: `Compare top rated ${a.name.toLowerCase()}s across Georgia. We list ${nf(a.count)} ${a.group.toLowerCase()} practices, both established law firms and solo attorneys, with ratings, reviews, and direct contact.` + (FACTS[a.slug] ? ' ' + FACTS[a.slug] : ''),
    breadcrumbs: [{ name: 'Home', href: '/' }, { name: 'Practice areas', href: '/directory/' }, { name: short, href: `/area/${a.slug}/` }],
    listings: a.listings, sections: [linkSection(`${short} by city`, cities.map(ci => chip(`/${ci.slug}/${a.slug}/`, ci.name, ci.n)))],
    faq, priority: 0.8, geo: { placename: 'Georgia', lat: 32.9, lng: -83.6 },
  });
}

// ── directory hub ─────────────────────────────────────────────────────────────
(function directoryPage() {
  const canonical = ORIGIN + '/directory/';
  const body = `
<p class="area-intro">Browse every Georgia city, county, ZIP code, and practice area in the directory. ${nf(LAWYERS.length)} law firms and attorneys across ${nf(CITIES.length)} cities and ${nf(COUNTIES.length)} counties.</p>
${linkSection('Practice areas', AREAS.map(a => chip(`/area/${a.slug}/`, stripArea(a.name), a.count)))}
<div id="cities"></div>${linkSection(`Cities (${nf(CITIES.length)})`, [...CITIES].sort((a, b) => a.name.localeCompare(b.name)).map(c => chip(`/${c.slug}/`, c.name, c.count)))}
<div id="counties"></div>${linkSection(`Counties (${nf(COUNTIES.length)})`, [...COUNTIES].sort((a, b) => a.name.localeCompare(b.name)).map(c => chip(`/county/${c.slug}/`, `${c.name} County`, c.count)))}
<div id="zips"></div>${linkSection(`ZIP codes (${nf(ZIPS.length)})`, [...ZIPS].sort((a, b) => a.slug.localeCompare(b.slug)).map(z => chip(`/zip/${z.slug}/`, z.slug, z.count)))}`;
  const jsonld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'CollectionPage', name: `Directory | ${SITE}`, url: canonical }, crumbLd([{ name: 'Home', href: '/' }, { name: 'Directory', href: '/directory/' }])] };
  out('directory', pageShell({ title: `Browse Georgia Lawyers by City, County and ZIP | ${SITE}`, desc: `Directory of ${nf(LAWYERS.length)} lawyers and law firms across ${nf(CITIES.length)} Georgia cities, ${nf(COUNTIES.length)} counties, and ${nf(ZIPS.length)} ZIP codes.`, canonical, h1: 'Browse the directory', sub: `${nf(LAWYERS.length)} lawyers across ${nf(CITIES.length)} cities`, eyebrow: 'Georgia', breadcrumbs: [{ name: 'Home', href: '/' }, { name: 'Directory', href: '/directory/' }], jsonld, body }), { index: true, priority: 0.9 });
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
  { q: 'How do I get my law firm listed?', a: 'Email us to claim your free listing or buy a Standard ($10/mo) or Premium ($20/mo) placement that pins your firm above the free results in your city.' },
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
<p class="hero-eyebrow">Georgia, statewide</p>
<h1 class="hero-title">Find the right lawyer, near you.</h1>
<p class="hero-sub">Browse ${nf(LAWYERS.length)} law firms and attorneys across Georgia by city, county, ZIP, or practice area.</p>
<button class="btn btn--primary btn--lg btn--hero" data-near>${svg('crosshair', 20)}<span>Find lawyers near me</span></button>
<form class="search" data-search><span class="search-ic">${svg('search', 18)}</span><input class="search-input" type="search" placeholder="Search firm, attorney, city or area…" enterkeyhint="search"></form>
${trustBandHTML()}
</div>
<div data-near-banner></div>
${qaBarHTML(false)}
<section class="home-section"><div class="section-head"><h2 class="section-title">Featured Attorneys</h2><span class="section-tagline">Premium placement, seen first</span></div>
<div class="featured-grid featured-grid--premium">${Array(4).fill(promoCardHTML('premium')).join('')}</div></section>
<section class="home-section"><div class="section-head"><h2 class="section-title">Standard Listings</h2><span class="section-tagline">Listed above the free results</span></div>
<div class="featured-grid featured-grid--standard">${Array(4).fill(promoCardHTML('standard')).join('')}</div></section>
${issueFinderHTML()}
${citySpotlightsHTML()}
${docketHTML(gaTop)}
<section class="home-section">${linkSection('Practice areas', AREAS.map(a => chip(`/area/${a.slug}/`, stripArea(a.name), a.count)))}</section>
${howItWorksHTML()}
<section class="home-section">${linkSection('Top cities', CITIES.slice(0, 16).map(c => chip(`/${c.slug}/`, c.name, c.count)))}</section>
<section class="home-section">${linkSection('By county', COUNTIES.slice(0, 14).map(c => chip(`/county/${c.slug}/`, `${c.name} County`, c.count)))}</section>
${lawyerCtaHTML()}
<section class="home-section"><div class="section-head"><h2 class="section-title">Frequently asked questions</h2></div>${homeFaqHTML()}</section>
<p style="margin:8px 0 0"><a class="chip" href="/directory/">Browse all ${nf(CITIES.length)} cities and ${nf(COUNTIES.length)} counties →</a></p>`;
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', name: SITE, alternateName: 'GA.Lawyers', url: ORIGIN + '/', potentialAction: { '@type': 'SearchAction', target: ORIGIN + '/search/?q={query}', 'query-input': 'required name=query' } },
    { '@type': 'Organization', name: SITE, alternateName: 'GA.Lawyers', url: ORIGIN + '/', areaServed: 'US-GA' },
    faqLd(HOME_FAQ),
  ] };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5">
<title>${SITE} | Top Lawyers and Law Firms in Georgia (${YEAR})</title>
<meta name="description" content="Find and compare ${nf(LAWYERS.length)} lawyers and law firms across Georgia. Browse by city, county, ZIP, or practice area with ratings, reviews, and direct contact.">
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
<link rel="stylesheet" href="/css/style.css?v=${V}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
${SKIP}
<main class="view view--home" id="main">${homeBody}</main>
${footerHTML()}
${tabBarHTML('home')}
<script type="module" src="/js/static.js?v=${V}"></script>
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
<script type="module" src="/js/static.js?v=${V}"></script>
<script type="module" src="/js/collections.js?v=${V}"></script>`;
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${attr(desc)}">
<meta name="robots" content="${index ? 'index, follow' : 'noindex, follow'}">
<link rel="canonical" href="${canonical}"><meta name="theme-color" content="#1a1a1f">
<meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(desc)}">${HEAD_SOCIAL}<meta name="twitter:card" content="summary_large_image">
${PRECONNECT}
${HEAD_PWA}<link rel="stylesheet" href="/css/style.css?v=${V}">
</head><body class="static">${SKIP}
${body}
</body></html>`;
  out(urlPath, html, { index });
}
appShell({ urlPath: 'search', title: `Search Georgia Lawyers | ${SITE}`, desc: `Search ${nf(LAWYERS.length)} Georgia lawyers and law firms by name, city, county, ZIP, or practice area.`, h1: 'Search', eyebrow: 'Find a lawyer', mode: 'search', index: true });
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
<h2>Analytics and cookies</h2><p>We use minimal, privacy respecting analytics to understand which pages are useful. We do not run advertising trackers.</p>
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
writeFileSync(join(ROOT, '404.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found | ${SITE}</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/css/style.css?v=${V}"></head><body class="static">${headerHTML()}<main class="view static-wrap"><h1 class="static-h1">Page not found</h1><p class="static-sub">That page doesn’t exist. Browse the directory instead.</p><p><a class="btn btn--primary" href="/directory/">Browse all Georgia lawyers</a></p></main>${footerHTML()}</body></html>`);

// ── sitemap + robots ───────────────────────────────────────────────────────────
sitemap.unshift({ loc: ORIGIN + '/', priority: 1.0 });
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemap.map(u => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority.toFixed(1)}</priority></url>`).join('\n') +
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
const HUBS = new Set(['county', 'zip', 'area', 'directory']);
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
