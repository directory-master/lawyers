// static.js — progressive enhancement for the generated static pages.
// Adds the interactivity the retired SPA used to provide, directly on the real
// clean-URL pages: save (bookmark) buttons, Saved/Visited counts, visited
// tracking, the entity filter, "show more" pagination, "near me" → your city,
// the near-you banner, and the search box. Content is already in the HTML.

import { isSaved, toggleSave, markVisited, counts } from './lib/saved.js?v=0.24.7';
import { CITY_CENTROIDS } from './data/city-centroids.js?v=0.24.7';
import { puffFrom } from './lib/confetti.js?v=0.24.7';
import { track, listingOf, grantConsent } from './lib/analytics.js?v=0.24.7';

const PIN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

// Remember the visitor's detected location + nearest city across visits.
const GEO_KEY = 'gal.geo';
const GEO_OPTS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 };
const saveGeo = (slug, lat, lng) => { try { localStorage.setItem(GEO_KEY, JSON.stringify({ slug, lat, lng, at: Date.now() })); } catch { /* private mode */ } };
const loadGeo = () => { try { return JSON.parse(localStorage.getItem(GEO_KEY)); } catch { return null; } };

const setCounts = () => {
  const c = counts();
  document.querySelectorAll('[data-qa-count="saved"]').forEach(e => e.textContent = c.saved);
  document.querySelectorAll('[data-qa-count="visited"]').forEach(e => e.textContent = c.visited);
};
const initSaves = () => document.querySelectorAll('[data-save-id]').forEach(b => {
  const on = isSaved(b.dataset.saveId);
  b.classList.toggle('is-saved', on); b.setAttribute('aria-pressed', String(on));
});
setCounts(); initSaves();

// ── delegated clicks ──────────────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const save = e.target.closest('[data-save-id]');
  if (save) { e.preventDefault(); if (toggleSave(save.dataset.saveId)) puffFrom(save, e); return; }
  const near = e.target.closest('[data-near]');
  if (near) { e.preventDefault(); goNear(near); return; }
  const visit = e.target.closest('[data-visit]');           // Call / Directions / Website
  if (visit) { const art = visit.closest('[data-listing-id]'); if (art) markVisited(art.dataset.listingId); }
});

// ── analytics: a named GA4 event for every meaningful interaction ─────────────
// Separate, observe-only listener (never preventDefault) so behavior above is
// untouched. Page views are sent automatically by the gtag config in <head>.
document.addEventListener('click', (e) => {
  const t = e.target.closest('a, button, [data-save-id]');
  if (!t) return;
  const listing_id = listingOf(t);
  const href = t.getAttribute('href') || '';
  if (t.matches('[data-save-id]'))       return track('save_toggle', { listing_id: t.dataset.saveId });
  if (t.matches('[data-near]'))          return track('find_near_me');
  if (t.matches('[data-install]'))       return track('install_click');
  if (t.matches('.segment[data-filter]'))return track('filter', { filter: t.dataset.filter });
  if (t.matches('.qa-tile'))             return track('quick_access', { dest: t.classList.contains('qa-tile--saved') ? 'saved' : 'visited' });
  if (href.startsWith('tel:'))           return track('call_click', { listing_id });
  if (href.includes('google.com/maps'))  return track('directions_click', { listing_id });
  if (href.startsWith('mailto:')) {
    const promo = t.closest('.promo, .price-card');
    const tier = promo?.className.match(/promo--(\w+)|price-card--(\w+)/)?.[0];
    return track('lead_click', { listing_id, tier, label: (t.textContent || '').trim().slice(0, 40) });
  }
  if (/^https?:/.test(href) && t.matches('.lc-btn, .docket-btn, [data-visit]'))
    return track('website_click', { listing_id });
});

// ── Listing filter (All / Law Firms / Attorneys) + ranking + pagination ──────
// The filtered set is re-ranked (No.1/2/3 of the filtered group), paginated on
// its own (first 20, then +20), and the choice is remembered across pages.
const FILTER_KEY = 'gal.filter';
(() => {
  const list = document.querySelector('[data-more-list]');
  if (!list) return;
  const cards = [...list.querySelectorAll('.lc')];
  const segments = [...document.querySelectorAll('.segment[data-filter]')];
  const moreBtn = list.nextElementSibling && list.nextElementSibling.matches('[data-more-btn]') ? list.nextElementSibling : null;
  const STEP = 20;
  let filter = 'all';
  try { const f = localStorage.getItem(FILTER_KEY); if (['all', 'firm', 'attorney'].includes(f)) filter = f; } catch { /* */ }
  let shown = STEP;
  let emptyEl = null;

  const setRank = (card, n) => {
    const tabs = card.querySelector('.lc-tabs'); if (!tabs) return;
    let rk = tabs.querySelector('.lc-tab--rank');
    if (n == null) { if (rk) rk.remove(); return; }
    if (!rk) { rk = document.createElement('span'); rk.className = 'lc-tab lc-tab--rank'; tabs.insertBefore(rk, tabs.firstChild); }
    rk.textContent = 'No. ' + n;
  };

  const apply = () => {
    let n = 0;                                              // count within the filtered set
    cards.forEach(card => {
      card.classList.remove('card--collapsed');            // JS now owns visibility
      if (filter !== 'all' && card.dataset.entity !== filter) { card.style.display = 'none'; setRank(card, null); return; }
      n++;
      setRank(card, n <= 3 ? n : null);                    // re-rank the filtered group
      card.style.display = n <= shown ? '' : 'none';       // paginate the filtered group
    });
    if (moreBtn) {
      const left = n - shown;
      moreBtn.style.display = left > 0 ? '' : 'none';
      if (left > 0) moreBtn.textContent = `Show ${Math.min(STEP, left)} more lawyers`;
    }
    if (n === 0) {
      if (!emptyEl) { emptyEl = document.createElement('p'); emptyEl.className = 'list-empty'; list.appendChild(emptyEl); }
      emptyEl.textContent = `No ${filter === 'firm' ? 'law firms' : 'attorneys'} listed on this page.`;
      emptyEl.style.display = '';
    } else if (emptyEl) emptyEl.style.display = 'none';
    segments.forEach(s => { const on = s.dataset.filter === filter; s.classList.toggle('is-active', on); s.setAttribute('aria-selected', String(on)); });
  };

  segments.forEach(s => s.addEventListener('click', () => {
    filter = s.dataset.filter; shown = STEP;
    try { localStorage.setItem(FILTER_KEY, filter); } catch { /* */ }
    apply();
  }));
  if (moreBtn) moreBtn.addEventListener('click', () => { shown += STEP; apply(); });
  apply();
})();

// ── near me → nearest city's page ─────────────────────────────────────────────
const hav = (aLat, aLng, bLat, bLng) => {
  const R = 3958.8, tr = d => d * Math.PI / 180, dLat = tr(bLat - aLat), dLng = tr(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(tr(aLat)) * Math.cos(tr(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
function nearestCity(lat, lng) {
  let best = null, bd = Infinity;
  for (const s in CITY_CENTROIDS) { const c = CITY_CENTROIDS[s], d = hav(lat, lng, c.lat, c.lng); if (d < bd) { bd = d; best = s; } }
  return best;
}
function goNear(btn) {
  const orig = btn.innerHTML;
  btn.innerHTML = '<span>Finding your city…</span>'; btn.disabled = true;
  const bail = () => { location.href = '/directory/'; };
  if (!navigator.geolocation) return bail();
  navigator.geolocation.getCurrentPosition(
    p => {
      const { latitude, longitude } = p.coords;
      const s = nearestCity(latitude, longitude);
      if (s) saveGeo(s, latitude, longitude);
      location.href = s ? `/${s}/` : '/directory/';
    },
    () => { btn.innerHTML = orig; btn.disabled = false; bail(); },
    GEO_OPTS);
}

// ── near-you banner (home) — opt-in, no surprise location prompt ──────────────
const banner = document.querySelector('[data-near-banner]');
if (banner) {
  const fill = (slug) => {
    const c = CITY_CENTROIDS[slug]; if (!c) return ask();
    const name = c.name || slug.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
    const tail = c.n ? `see the top ${c.n} ${name} lawyer${c.n === 1 ? '' : 's'}` : `see ${name} lawyers`;
    banner.innerHTML = `<a class="near-banner" href="/${slug}/"><span class="near-pin">${PIN}</span><span>Nearest to you: <b>${name}</b> — ${tail}</span><span class="near-go">→</span></a>`;
  };
  const ask = () => {
    banner.innerHTML = `<button class="near-banner near-banner--prompt"><span class="near-pin">${PIN}</span><span>See top lawyers near you</span></button>`;
    banner.querySelector('button').addEventListener('click', () => locate());
  };
  const locate = () => navigator.geolocation && navigator.geolocation.getCurrentPosition(
    p => {
      const { latitude, longitude } = p.coords;
      const s = nearestCity(latitude, longitude);
      if (s) { saveGeo(s, latitude, longitude); fill(s); } else ask();
    },
    () => ask(), GEO_OPTS);
  // Passive banners (on the listing pages) only ever surface an ALREADY known
  // city so the recognized location follows the visitor across pages; they never
  // prompt or show the opt-in. The home banner keeps the full opt-in flow.
  const passive = banner.hasAttribute('data-near-passive');
  // 1) show the remembered city instantly (persisted in localStorage);
  // 2) else if location already granted, detect silently;
  // 3) else show an opt-in button (no surprise prompt).
  const saved = loadGeo();
  if (saved && saved.slug && CITY_CENTROIDS[saved.slug]) fill(saved.slug);
  else if (passive) banner.remove();          // nothing remembered → stay invisible
  else if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(st => st.state === 'granted' ? locate() : ask()).catch(ask);
  } else ask();
}

// ── home search box → /search/?q= ────────────────────────────────────────────
document.querySelectorAll('form[data-search]').forEach(f => f.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = (f.querySelector('input')?.value || '').trim();
  if (q) track('search', { search_term: q });
  location.href = '/search/' + (q ? '?q=' + encodeURIComponent(q) : '');
}));

// ── PWA: register the service worker + wire the "Install" button ──────────────
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
(() => {
  const btn = document.querySelector('[data-install]');
  if (!btn) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) { btn.hidden = true; return; }     // already installed → hide
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferred = null;

  // Capture the real prompt when the browser offers it; the button stays visible
  // either way (clicking shows instructions when no native prompt is available).
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { btn.hidden = true; });

  const hint = (msg) => {
    document.querySelector('.install-hint')?.remove();
    const el = document.createElement('div');
    el.className = 'install-hint';
    el.innerHTML = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 5200);
    el.addEventListener('click', () => el.remove());
  };

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') btn.hidden = true;
      deferred = null;
    } else if (isiOS) {
      hint('Tap <b>Share</b>, then <b>Add to Home Screen</b> to install.');
    } else {
      hint('Open your browser menu and choose <b>Install app</b>.');
    }
  });
})();

// ── Review-source flip: "from Avvo" rotates to "from Yelp" … (2+ sources only) ──
function initFlips(root = document) {
  root.querySelectorAll('.srcflip[data-srcflip]').forEach((el) => {
    if (el.dataset.flipInit) return;
    el.dataset.flipInit = '1';
    const words = [...el.querySelectorAll('.src-word')];
    if (words.length < 2) return;
    let i = 0;
    setInterval(() => {
      const cur = words[i], next = words[(i + 1) % words.length];
      cur.classList.remove('is-on'); cur.classList.add('is-out');
      setTimeout(() => cur.classList.remove('is-out'), 480);
      next.classList.add('is-on');
      i = (i + 1) % words.length;
    }, 2200);
  });
}
initFlips();

// ── The Georgia Docket: tap any of the 10 to promote into the No.1 spotlight.
// The rail always shows the OTHER nine, so whoever was in the spotlight returns
// to the list (nobody gets lost). ──────────────────────────────────────────────
const docket = document.querySelector('[data-docket]');
if (docket) {
  const champ = document.getElementById('docket-champ');
  const rowsEl = document.getElementById('docket-rows');
  let data = [];
  try { data = JSON.parse(document.getElementById('docket-data').textContent); } catch { /* */ }
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const srcFlip = (names) => {
    if (!names || !names.length) return '';
    const sizer = names.reduce((a, b) => (b.length > a.length ? b : a), '');
    return ` from <span class="srcflip" data-srcflip><span class="src-sizer" aria-hidden="true">${esc(sizer)}</span>${names.map((s, j) => `<span class="src-word${j === 0 ? ' is-on' : ''}">${esc(s)}</span>`).join('')}</span>`;
  };
  const ic = (body) => `<span class="icon"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg></span>`;
  const IC_PHONE = ic('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>');
  const IC_NAV = ic('<polygon points="3 11 22 2 13 21 11 13 3 11"/>');
  const IC_GLOBE = ic('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>');
  const IC_BOOK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  const saveCls = (id) => isSaved(id) ? ' is-saved' : '';
  const rateOf = (d) => d.rating ? d.rating.toFixed(1) : '—';
  const actions = (d) => {
    const b = [];
    if (d.tel) b.push(`<a class="docket-btn docket-btn--call" href="${esc(d.tel)}" data-visit>${IC_PHONE}<span>Call</span></a>`);
    b.push(`<a class="docket-btn" href="${esc(d.maps)}" target="_blank" rel="noopener" data-visit>${IC_NAV}<span>Directions</span></a>`);
    if (d.web) b.push(`<a class="docket-btn" href="${esc(d.web)}" target="_blank" rel="noopener nofollow" data-visit>${IC_GLOBE}<span>Website</span></a>`);
    return `<div class="docket-actions">${b.join('')}</div>`;
  };
  const rowHTML = (d, j) => `<button class="docket-row" data-docket-i="${j}">
    <span class="docket-roman">${ROMAN[j]}</span>
    <span class="docket-av">${d.av}</span>
    <span class="docket-row-main"><span class="docket-row-name">${esc(d.name)}</span><span class="docket-row-meta">${esc(d.type)} · ${esc(d.cityName)}</span></span>
    <span class="docket-row-rate"><span><span class="docket-star">★</span> ${rateOf(d)}</span><span class="docket-row-rev">${(d.reviews || 0).toLocaleString()} reviews</span></span>
    <span class="docket-save${saveCls(d.id)}" data-save-id="${esc(d.id)}" role="button" aria-label="Save ${esc(d.name)}" title="Save">${IC_BOOK}</span>
  </button>`;
  const promote = (idx) => {
    const d = data[idx]; if (!d || !champ || !rowsEl) return;
    champ.dataset.listingId = d.id;
    const bg = d.image ? `<img class="docket-champ-bg" src="${esc(d.image)}" alt="" loading="lazy" decoding="async" aria-hidden="true"><div class="docket-champ-scrim" aria-hidden="true"></div>` : '';
    champ.innerHTML = `${bg}<button class="docket-champ-save${saveCls(d.id)}" data-save-id="${esc(d.id)}" aria-label="Save ${esc(d.name)}" title="Save">${IC_BOOK}</button>
      <div class="docket-champ-body">
      <div class="docket-rank1">— No. ${idx + 1} —</div>
      <div class="docket-champ-name">${esc(d.name)}</div>
      <div class="docket-champ-meta">${esc(d.type)} · ${esc(d.cityName)}</div>
      <div class="docket-champ-rate"><span class="docket-star">★</span> ${rateOf(d)} <span class="docket-dim">· ${(d.reviews || 0).toLocaleString()} reviews${srcFlip(d.srcs)}</span></div>
      ${actions(d)}
      </div>`;
    rowsEl.innerHTML = data.map((x, j) => j === idx ? '' : rowHTML(x, j)).join('');
    initFlips(champ);
    champ.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  rowsEl && rowsEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-save-id]')) return;   // saving shouldn't promote
    const row = e.target.closest('[data-docket-i]');
    if (row) promote(+row.dataset.docketI);
  });
}

// ── Cookie consent (GA4 Consent Mode v2) ─────────────────────────────────────
// The <head> tag defaults analytics_storage to "denied" and reads a stored
// "granted" choice on load. This banner lets the visitor accept (full GA cookies)
// or decline (GA stays cookieless). The choice is remembered on this device.
(() => {
  const KEY = 'gal.consent';
  let choice = null;
  try { choice = localStorage.getItem(KEY); } catch { /* private mode */ }
  if (choice === 'granted' || choice === 'denied') return;   // already decided

  const save = (v) => { try { localStorage.setItem(KEY, v); } catch { /* */ } };
  const bar = document.createElement('div');
  bar.className = 'consent';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Cookie notice');
  bar.innerHTML = `<p class="consent-text">We use cookies for analytics to see which pages help people find a lawyer. You can accept or decline. See our <a href="/privacy/">Privacy Policy</a>.</p>
    <div class="consent-btns">
      <button class="consent-btn consent-btn--ghost" data-consent="denied">Decline</button>
      <button class="consent-btn consent-btn--gold" data-consent="granted">Accept</button>
    </div>`;
  const close = (v) => { save(v); if (v === 'granted') grantConsent(); track('consent_choice', { choice: v }); bar.classList.remove('show'); setTimeout(() => bar.remove(), 300); };
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-consent]'); if (b) close(b.dataset.consent); });
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('show'));
})();
