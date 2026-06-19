// static.js — progressive enhancement for the generated static pages.
// Adds the interactivity the retired SPA used to provide, directly on the real
// clean-URL pages: save (bookmark) buttons, Saved/Visited counts, visited
// tracking, the entity filter, "show more" pagination, "near me" → your city,
// the near-you banner, and the search box. Content is already in the HTML.

import { isSaved, toggleSave, markVisited, counts } from './lib/saved.js?v=0.34.0';
import { CITY_CENTROIDS } from './data/city-centroids.js?v=0.34.0';
import { puffFrom } from './lib/confetti.js?v=0.34.0';
import { track, listingOf, grantConsent } from './lib/analytics.js?v=0.34.0';

const PIN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

// Haptic feedback on save toggle: a confirming double tap when saving, a single
// softer pulse when unsaving. No-op where the Vibration API is unsupported
// (iOS Safari) or blocked, so it never throws.
const haptic = (saved) => { try { navigator.vibrate?.(saved ? [12, 28, 22] : 18); } catch { /* unsupported */ } };

// Remember the visitor's detected location + nearest city across visits.
const GEO_KEY = 'gal.geo';
const GEO_OPTS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 };
const saveGeo = (slug, lat, lng) => { try { localStorage.setItem(GEO_KEY, JSON.stringify({ slug, lat, lng, at: Date.now() })); } catch { /* private mode */ } };
const loadGeo = () => { try { return JSON.parse(localStorage.getItem(GEO_KEY)); } catch { return null; } };
const clearGeo = () => { try { localStorage.removeItem(GEO_KEY); } catch { /* private mode */ } };
const X_IC = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

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
  if (save) { e.preventDefault(); const saved = toggleSave(save.dataset.saveId); haptic(saved); if (saved) puffFrom(save, e); return; }
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
  // Only restore the saved firm/attorney choice when this page actually has the
  // segmented control. Single-entity boards (/firms/, /attorneys/, …) hide the
  // control, so a stale saved 'firm' must NOT filter an attorneys-only page down
  // to nothing (that left those pages looking empty).
  let filter = 'all';
  if (segments.length) { try { const f = localStorage.getItem(FILTER_KEY); if (['all', 'firm', 'attorney'].includes(f)) filter = f; } catch { /* */ } }
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
      setRank(card, n);                                    // re-rank the filtered group (every card)
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

// ── browse/directory: per-section sort + "type to filter", remembered ─────────
// Each section on /directory/ (Practice areas, Cities, Counties, ZIP codes) has
// a sort toggle (A to Z / Top rated / Most / Least) and a filter box.
// Matching is substring on the chip label; the count is ignored. The sort choice
// and the filter text are persisted per section so both survive reloads.
(() => {
  const sections = document.querySelectorAll('[data-filter-section]');
  if (!sections.length) return;
  const FKEY = (k) => `gal.dir.${k}`;          // filter text
  const SKEY = (k) => `gal.dirsort.${k}`;      // sort mode
  const SORTS = ['alpha', 'rated', 'most', 'least'];
  sections.forEach((sec) => {
    const key = sec.dataset.filterSection;
    const input = sec.querySelector('[data-filter-input]');
    const empty = sec.querySelector('[data-filter-empty]');
    const wrap = sec.querySelector('[data-filter-chips]');
    const sortBtns = [...sec.querySelectorAll('.dir-sort-btn[data-sort]')];
    if (!wrap) return;
    const chips = [...wrap.querySelectorAll('.chip')].map((el) => ({
      el,
      label: (el.childNodes[0]?.nodeValue || el.textContent).trim().toLowerCase(),
      count: +el.dataset.count || 0,
      rating: +el.dataset.rating || 0,            // top lawyer's rating for this place
    }));

    let sort = 'alpha';
    try { const s = localStorage.getItem(SKEY(key)); if (SORTS.includes(s)) sort = s; } catch { /* private mode */ }

    const reorder = () => {
      const cmp = sort === 'most' ? (a, b) => b.count - a.count || a.label.localeCompare(b.label)
        : sort === 'least' ? (a, b) => a.count - b.count || a.label.localeCompare(b.label)
        : sort === 'rated' ? (a, b) => b.rating - a.rating || b.count - a.count || a.label.localeCompare(b.label)
        : (a, b) => a.label.localeCompare(b.label);
      [...chips].sort(cmp).forEach(({ el }) => wrap.appendChild(el));   // reflow in sorted order
      sortBtns.forEach((b) => { const on = b.dataset.sort === sort; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); });
    };
    const filter = () => {
      const q = (input?.value || '').trim().toLowerCase();
      let n = 0;
      chips.forEach(({ el, label }) => { const hit = !q || label.includes(q); el.hidden = !hit; if (hit) n++; });
      if (empty) empty.hidden = n !== 0;
    };

    sortBtns.forEach((b) => b.addEventListener('click', () => {
      sort = b.dataset.sort;
      try { localStorage.setItem(SKEY(key), sort); } catch { /* private mode */ }
      reorder();
    }));
    if (input) {
      try { const v = localStorage.getItem(FKEY(key)); if (v) input.value = v; } catch { /* private mode */ }
      input.addEventListener('input', () => {
        try { input.value ? localStorage.setItem(FKEY(key), input.value) : localStorage.removeItem(FKEY(key)); } catch { /* private mode */ }
        filter();
      });
    }
    reorder();
    filter();
  });
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
  // Already pinned to a city? Just take them back there, no re-detect. (The tab
  // is locked while you're on that city's page, so this only fires when away.)
  const geo = loadGeo() || {};
  if (geo.slug && CITY_CENTROIDS[geo.slug]) { location.href = `/${geo.slug}/`; return; }
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

// Reflect location state on the "Near Me" tab: green once a city is pinned,
// gently shaking (an invitation to tap) until then. State lives in localStorage,
// so it follows the visitor across every page. Once pinned, the label also swaps
// from "Near Me" to "Near <City>" so the visitor sees which place is remembered.
const cityLabel = (slug) => {
  const c = CITY_CENTROIDS[slug];
  return (c && c.name) || slug.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
};
// Trailing-slash normalize so '/marietta', '/marietta/', and '/marietta/index.html'
// all compare equal when matching a tab's destination to the current page.
const normPath = (p) => { p = (p || '').replace(/index\.html$/, ''); return p.endsWith('/') ? p : p + '/'; };
const markNearTab = () => {
  const geo = loadGeo() || {};
  const pinned = !!(geo.slug && CITY_CENTROIDS[geo.slug]);
  const city = pinned ? cityLabel(geo.slug) : '';
  const here = normPath(location.pathname);
  document.querySelectorAll('[data-near]').forEach(b => {
    b.classList.toggle('tab--located', pinned);
    b.classList.toggle('tab--locate', !pinned);
    // Tab bar uses .tab-label ("Near Me"); the home hero button uses a bare <span>
    // ("Find lawyers near me"). Stash the original once, then swap in the city.
    const el = b.querySelector('.tab-label') || b.querySelector('span:not(.tab-ic)');
    if (!el) return;
    if (el.dataset.nearLabel == null) el.dataset.nearLabel = el.textContent;
    const base = el.dataset.nearLabel;
    el.textContent = pinned ? base.replace(/\bme\b\s*$/i, city) : base;
  });
  // Lock whichever tab points at the page you're already on, so it is not
  // clickable. The Near tab points at the pinned city, so it locks only while
  // you are on that city's page; away from it, tapping returns you there.
  document.querySelectorAll('.tabbar .tab').forEach(tab => {
    const dest = tab.matches('[data-near]') ? (pinned ? `/${geo.slug}/` : null) : tab.getAttribute('href');
    const current = !!dest && normPath(dest) === here;
    tab.classList.toggle('tab--current', current);
    tab.toggleAttribute('aria-disabled', current);
  });
};
markNearTab();

// Show how far each lawyer is from the visitor, once a location is remembered.
// Distance is computed client-side (the static HTML cannot know who is reading
// it) from the visitor's saved coordinates to each card's data-lat/lng.
const fillDistances = () => {
  const geo = loadGeo() || {};
  const known = typeof geo.lat === 'number' && typeof geo.lng === 'number';
  document.querySelectorAll('[data-dist]').forEach(el => {
    const host = el.closest('[data-lat]');           // card article, docket row, or champ
    const lat = parseFloat(host && host.dataset.lat), lng = parseFloat(host && host.dataset.lng);
    if (!known || !isFinite(lat) || !isFinite(lng)) { el.textContent = ''; return; }
    const mi = hav(geo.lat, geo.lng, lat, lng);
    el.textContent = mi < 0.1 ? 'here' : `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
  });
};
fillDistances();

// ── near-you banner (home) — opt-in, no surprise location prompt ──────────────
const banner = document.querySelector('[data-near-banner]');
if (banner) {
  const fill = (slug) => {
    const c = CITY_CENTROIDS[slug]; if (!c) return ask();
    const name = c.name || slug.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
    const tail = c.n ? `see the top ${c.n} ${name} lawyer${c.n === 1 ? '' : 's'}` : `see ${name} lawyers`;
    banner.innerHTML = `<div class="near-row"><a class="near-banner" href="/${slug}/"><span class="near-pin">${PIN}</span><span>Nearest to you: <b>${name}</b>, ${tail}</span><span class="near-go">→</span></a><button class="near-clear" type="button" data-near-clear aria-label="Clear saved location" title="Clear location">${X_IC}</button></div>`;
    banner.querySelector('[data-near-clear]').addEventListener('click', () => {
      clearGeo(); markNearTab();              // forget the city; Near Me tab returns to shaking
      if (passive) banner.remove(); else ask();
    });
  };
  const ask = () => {
    banner.innerHTML = `<button class="near-banner near-banner--prompt"><span class="near-pin">${PIN}</span><span>See top lawyers near you</span></button>`;
    banner.querySelector('button').addEventListener('click', () => locate());
  };
  const locate = () => navigator.geolocation && navigator.geolocation.getCurrentPosition(
    p => {
      const { latitude, longitude } = p.coords;
      const s = nearestCity(latitude, longitude);
      if (s) { saveGeo(s, latitude, longitude); fill(s); markNearTab(); fillDistances(); } else ask();
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
  let current = 0;                                   // which of the 10 is in the No.1 spotlight
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
  const coords = (d) => (d.lat != null && d.lng != null) ? ` data-lat="${d.lat}" data-lng="${d.lng}"` : '';
  const rowHTML = (d, j) => `<button class="docket-row" data-docket-i="${j}"${coords(d)}>
    <span class="docket-roman">${ROMAN[j]}</span>
    <span class="docket-av">${d.av}</span>
    <span class="docket-row-main"><span class="docket-row-name">${esc(d.name)}</span><span class="docket-row-meta">${esc(d.type)} · ${esc(d.cityName)}<span class="docket-dist" data-dist></span></span></span>
    <span class="docket-row-rate"><span><span class="docket-star">★</span> ${rateOf(d)}</span><span class="docket-row-rev">${(d.reviews || 0).toLocaleString()} reviews</span></span>
    <span class="docket-save${saveCls(d.id)}" data-save-id="${esc(d.id)}" role="button" aria-label="Save ${esc(d.name)}" title="Save">${IC_BOOK}</span>
  </button>`;
  const promote = (idx) => {
    const d = data[idx]; if (!d || !champ || !rowsEl) return;
    champ.dataset.listingId = d.id;
    if (d.lat != null && d.lng != null) { champ.dataset.lat = d.lat; champ.dataset.lng = d.lng; }
    else { delete champ.dataset.lat; delete champ.dataset.lng; }
    const bg = d.image ? `<img class="docket-champ-bg" src="${esc(d.image)}" alt="" loading="lazy" decoding="async" aria-hidden="true"><div class="docket-champ-scrim" aria-hidden="true"></div>` : '';
    champ.innerHTML = `${bg}<button class="docket-champ-save${saveCls(d.id)}" data-save-id="${esc(d.id)}" aria-label="Save ${esc(d.name)}" title="Save">${IC_BOOK}</button>
      <div class="docket-champ-body">
      <div class="docket-rank1">— No. ${idx + 1} —</div>
      <div class="docket-champ-name">${esc(d.name)}</div>
      <div class="docket-champ-meta">${esc(d.type)} · ${esc(d.cityName)}<span class="docket-dist" data-dist></span></div>
      <div class="docket-champ-rate"><span class="docket-star">★</span> ${rateOf(d)} <span class="docket-dim">· ${(d.reviews || 0).toLocaleString()} reviews${srcFlip(d.srcs)}</span></div>
      ${actions(d)}
      </div>`;
    rowsEl.innerHTML = data.map((x, j) => j === idx ? '' : rowHTML(x, j)).join('');
    fillDistances();                                  // re-stamp distances on the rebuilt champ + rows
    initFlips(champ);
    current = idx;
    champ.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (narrate) announce(idx);                        // read the newly focused lawyer
  };
  rowsEl && rowsEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-save-id]')) return;   // saving shouldn't promote
    const row = e.target.closest('[data-docket-i]');
    if (row) promote(+row.dataset.docketI);
  });

  // ── announcer: a deep voice introduces whichever lawyer is in the spotlight ───
  // Progressive enhancement via the Web Speech API. The speaker button in the
  // top-left toggles narration; while on, promoting a lawyer reads a one-line
  // intro. Absent or blocked speech support, the button simply never appears.
  let narrate = false;                                // false = muted (the default)
  let announce = () => {};                            // assigned below when speech is supported
  const SPK_BASE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  const SPEAKER_ON = SPK_BASE + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
  const SPEAKER_MUTED = SPK_BASE + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  if ('speechSynthesis' in window) {
    const synth = window.speechSynthesis;
    let voice = null;
    const pickVoice = () => {
      const en = (synth.getVoices() || []).filter(v => /^en\b|^en[-_]/i.test(v.lang));
      const novelty = /fred|zarvox|albert|bahh|bells|boing|bubbles|cellos|wobble|trinoids|whisper|organ|good news|bad news/i;
      // Australian or Canadian accent, as requested. Prefer those by language tag,
      // favouring named AU/CA voices (Lee/Gordon are macOS AU males) and any
      // "Enhanced"/"Premium" variant, then any en-AU / en-CA voice at all.
      const accent = en.filter(v => /en[-_](AU|CA)/i.test(v.lang) && !novelty.test(v.name));
      const named = ['Lee', 'Gordon', 'Matilda', 'Karen', 'Catherine', 'Google'];
      voice = named.map(n => accent.find(v => v.name.includes(n) && /enhanced|premium/i.test(v.name)) || accent.find(v => v.name.includes(n))).find(Boolean)
        || accent.find(v => /enhanced|premium/i.test(v.name))
        || accent[0]
        // Fallback if the OS has no AU/CA voice installed: a natural, non-robotic voice.
        || en.find(v => /enhanced|premium|siri/i.test(v.name) && !novelty.test(v.name))
        || en.find(v => /\b(Alex|Tom|Daniel|Aaron)\b/.test(v.name))
        || en.find(v => !novelty.test(v.name))
        || en[0] || null;
    };
    pickVoice();
    synth.addEventListener && synth.addEventListener('voiceschanged', pickVoice);

    const WORD = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const introOf = (d, idx) => {
      // Short sentences on purpose: periods are the only "pause" the Web Speech
      // API gives us, so each clause becomes its own beat.
      const lines = [`Number ${WORD[idx] || idx + 1}.`, `${d.name}.`];
      const area = d.type ? `a top rated ${d.type.toLowerCase()} practice` : 'a top rated practice';
      lines.push(d.cityName ? `${area}, in ${d.cityName}, Georgia.` : `${area}, in Georgia.`);
      if (d.rating) lines.push(`Rated ${d.rating.toFixed(1)} stars.`);
      return lines.join(' ');
    };

    const spk = document.createElement('button');
    spk.type = 'button';
    spk.className = 'docket-speak';
    docket.appendChild(spk);

    // Muted is the default. setMute(true) silences and shows the crossed-out
    // speaker; setMute(false) unmutes and (when asked) reads the current focus.
    const setMute = (muted) => {
      narrate = !muted;
      spk.innerHTML = muted ? SPEAKER_MUTED : SPEAKER_ON;
      spk.classList.toggle('is-muted', muted);
      spk.classList.toggle('is-on', !muted);
      spk.setAttribute('aria-pressed', String(!muted));
      spk.setAttribute('aria-label', muted ? 'Unmute lawyer introductions' : 'Mute lawyer introductions');
      spk.title = muted ? 'Unmute introductions' : 'Mute introductions';
      if (muted) { synth.cancel(); spk.classList.remove('is-speaking'); }
    };
    setMute(true);                                     // start muted

    announce = (idx) => {
      if (!narrate) return;
      const d = data[idx]; if (!d) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(introOf(d, idx));
      if (voice) u.voice = voice;
      u.pitch = 0.9; u.rate = 0.96; u.volume = 1;      // slightly deep, paced, not a groan
      u.onend = u.onerror = () => spk.classList.remove('is-speaking');
      spk.classList.add('is-speaking');
      synth.speak(u);
    };

    spk.addEventListener('click', () => {
      if (narrate) setMute(true);                      // mute
      else { setMute(false); announce(current); }      // unmute and read the current focus
    });
    // Never keep talking into a backgrounded tab; mute when it is hidden.
    document.addEventListener('visibilitychange', () => { if (document.hidden) setMute(true); });
  }
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
