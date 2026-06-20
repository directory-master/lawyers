// store.js — the data brain. Loads the imported listings + GA geography and
// exposes every selector the UI and the static generator need: by city, county,
// zip, practice area; top-10 rankings; firm-vs-attorney grouping; near-me.
//
// Pure data, no DOM. Used by both js/app.js (the live SPA) and, conceptually,
// scripts/generate-pages.mjs (which mirrors these selectors server-side).

import { IMPORTED } from '../data/lawyers-imported.js?v=0.35.8';
import { CITY_COUNTY } from '../data/ga-counties.js?v=0.35.8';
import { CATEGORIES, TYPE_BY_SLUG, SLUG_BY_TYPE } from '../data/categories.js?v=0.35.8';

export const kebab = (s) => (s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (slug) => (slug || '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// ─── normalize: attach county + practice-area slug to every listing ──────────
export const LAWYERS = IMPORTED.map(l => {
  const countyName = CITY_COUNTY[l.city] || null;
  return {
    ...l,
    typeSlug: SLUG_BY_TYPE[l.type] || 'general-practice',
    countyName,
    countySlug: countyName ? kebab(countyName) : null,
  };
});

// ─── ranking: drives every "Top 10". paid/tier pin to the top, then rating,
// then review volume, then a stable name tiebreak. ──────────────────────────
const TIER_BOOST = { premium: 3, standard: 2, free: 0 };
export function rankScore(l) {
  const tier = (TIER_BOOST[l.tier] || 0) + (l.paid ? 1 : 0);
  const rating = l.rating ?? 0;
  const reviews = l.reviews ?? 0;
  // Bayesian-ish: a 5.0 with 1 review shouldn't beat a 4.7 with 80.
  const weighted = (rating * reviews + 4.0 * 8) / (reviews + 8);
  return tier * 1000 + weighted * 100 + Math.min(reviews, 50);
}
export const byRank = (a, b) => rankScore(b) - rankScore(a) || (a.name || '').localeCompare(b.name || '');
export function top(list, n = 10) { return [...list].sort(byRank).slice(0, n); }

// ─── facets ──────────────────────────────────────────────────────────────────
function facet(keyFn, nameFn, extra = () => ({})) {
  const map = new Map();
  for (const l of LAWYERS) {
    const key = keyFn(l);
    if (!key) continue;
    if (!map.has(key)) map.set(key, { slug: key, name: nameFn(l), count: 0, listings: [], ...extra(l) });
    const f = map.get(key);
    f.count++; f.listings.push(l);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export const CITIES = facet(l => l.city, l => l.cityName, l => ({ county: l.countyName, countySlug: l.countySlug }));
export const COUNTIES = facet(l => l.countySlug, l => l.countyName);
export const ZIPS = facet(l => l.zip, l => l.zip, l => ({ city: l.cityName, citySlug: l.city }));
export const AREAS = CATEGORIES
  .map(c => ({ slug: c.slug, name: c.type, group: c.group, listings: LAWYERS.filter(l => l.typeSlug === c.slug) }))
  .filter(a => a.listings.length)
  .map(a => ({ ...a, count: a.listings.length }))
  .sort((a, b) => b.count - a.count);

// ─── lookups ──────────────────────────────────────────────────────────────────
export const cityBySlug = (slug) => CITIES.find(c => c.slug === slug);
export const countyBySlug = (slug) => COUNTIES.find(c => c.slug === slug);
export const zipByCode = (code) => ZIPS.find(z => z.slug === code);
export const areaBySlug = (slug) => AREAS.find(a => a.slug === slug);
export { TYPE_BY_SLUG, titleCase };

const BY_ID = new Map(LAWYERS.map(l => [l.id, l]));
export const byId = (id) => BY_ID.get(id) || null;
export const byIds = (ids) => ids.map(byId).filter(Boolean);

export const inCity = (slug) => LAWYERS.filter(l => l.city === slug);
export const inCounty = (slug) => LAWYERS.filter(l => l.countySlug === slug);
export const inZip = (code) => LAWYERS.filter(l => l.zip === code);
export const inArea = (slug) => LAWYERS.filter(l => l.typeSlug === slug);

// ─── group by entity kind (Law Firms vs. Attorneys) ──────────────────────────
export function groupByEntity(list) {
  return {
    firm: list.filter(l => l.entity === 'firm'),
    attorney: list.filter(l => l.entity === 'attorney'),
  };
}

// ─── group a list by practice area, ranked, for hub pages ────────────────────
export function groupByArea(list) {
  const map = new Map();
  for (const l of list) {
    if (!map.has(l.typeSlug)) map.set(l.typeSlug, []);
    map.get(l.typeSlug).push(l);
  }
  return [...map.entries()]
    .map(([slug, listings]) => ({ slug, name: TYPE_BY_SLUG[slug], listings: top(listings, 999), count: listings.length }))
    .sort((a, b) => b.count - a.count);
}

// ─── sorting options exposed in the UI ───────────────────────────────────────
export const SORTS = {
  top: { label: 'Top rated', fn: byRank },
  reviews: { label: 'Most reviewed', fn: (a, b) => (b.reviews ?? 0) - (a.reviews ?? 0) || byRank(a, b) },
  az: { label: 'A to Z', fn: (a, b) => (a.name || '').localeCompare(b.name || '') },
};
export function sortBy(list, key) { return [...list].sort((SORTS[key] || SORTS.top).fn); }

// ─── near me: haversine, miles ───────────────────────────────────────────────
export function distanceMi(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lat2 == null) return Infinity;
  const R = 3958.8, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function nearest(lat, lng, n = 20) {
  return LAWYERS
    .map(l => ({ ...l, distance: distanceMi(lat, lng, l.lat, l.lng) }))
    .filter(l => isFinite(l.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}

export const TOTAL = LAWYERS.length;
