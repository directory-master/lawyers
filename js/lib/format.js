// format.js — display helpers (no DOM).

export const initials = (name) => (name || '?')
  .replace(/\b(the|law|office|offices|of|firm|group|llc|llp|pc|p\.c\.|associates|and|&|at|attorney|attorneys)\b/gi, ' ')
  .trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || (name || '?')[0].toUpperCase();

export const telHref = (phone) => phone ? 'tel:' + phone.replace(/[^\d+]/g, '') : null;

export function prettyHost(url) {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]; }
}

export function mapsHref(l) {
  if (l.lat != null && l.lng != null) return `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address || l.name)}`;
}

// Star string for ratings, e.g. 4.5 → "★★★★⯪"
export function stars(rating) {
  if (!rating) return '';
  const full = Math.floor(rating), half = rating - full >= 0.25 && rating - full < 0.75;
  const up = rating - full >= 0.75 ? 1 : 0;
  return '★'.repeat(full + up) + (half ? '⯪' : '') ;
}

export const fmtRating = (r) => r ? r.toFixed(1) : null;
export const fmtDistance = (mi) => mi == null || !isFinite(mi) ? null : (mi < 0.1 ? 'here' : mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`);
export const fmtReviews = (n) => n ? `${n} review${n === 1 ? '' : 's'}` : null;

// "Closed · Opens tomorrow 9 AM" → { open: false, text: 'Opens tomorrow 9 AM' }
export function parseHours(text) {
  if (!text) return null;
  const open = /open/i.test(text) && !/closed/i.test(text.split('·')[0]);
  const tail = text.split('·').map(s => s.trim()).filter(Boolean).pop();
  return { open, text: tail || text };
}
