// format.js — display helpers (no DOM).

export const initials = (name) => (name || '?')
  .replace(/\b(the|law|office|offices|of|firm|group|llc|llp|pc|p\.c\.|associates|and|&|at|attorney|attorneys)\b/gi, ' ')
  .trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || (name || '?')[0].toUpperCase();

export const telHref = (phone) => phone ? 'tel:' + phone.replace(/[^\d+]/g, '') : null;

// Map photos come back as tiny thumbnails (Google as small as 80px wide); that
// was fine for a 60px avatar, but our cards use the photo as a full background, so
// the thumbnails upscale and blur. These hosts honor a larger size token, so ask
// for one. Bing OLC thumbnails are already 480×360 — leave them alone.
export function hiResImage(url, px = 720) {
  if (!url) return url;
  if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+/, `=w${px}-h${px}`); // googleusercontent
  if (url.includes('streetviewpixels-pa.googleapis.com'))                          // street view render
    return url.replace(/([?&]w=)\d+/, `$1${px}`).replace(/([?&]h=)\d+/, `$1${Math.round(px * 0.75)}`);
  return url;
}

// A stable per-listing "ring speed" so every Call icon shakes at its own pace
// (derived from the id, so server and client agree). Range ~1.2s–2.4s.
export function ringDur(seed) {
  const s = String(seed || ''); let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (1.2 + (h % 120) / 100).toFixed(2) + 's';
}

// Per-listing horizontal pan timing for the photo. Both the duration and a
// NEGATIVE start delay are derived from the id, so every card drifts at its own
// pace AND starts mid cycle — the grid never pans in lockstep. Server and client
// agree because it is pure id hashing.
export function panStyle(seed) {
  const s = String(seed || ''); let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const dur = 16 + (h % 1500) / 100;          // 16s – 31s
  const delay = -((Math.floor(h / 7)) % 2400) / 100; // -0s – -24s (offsets phase)
  return `--pan-dur:${dur.toFixed(2)}s;--pan-delay:${delay.toFixed(2)}s`;
}

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
