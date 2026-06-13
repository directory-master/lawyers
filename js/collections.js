// collections.js — renders the dynamic pages (/search/, /saved/, /visited/) that
// depend on the visitor's localStorage or query. Loaded only on those pages.
// Reuses the store selectors and the real card component, so cards stay fully
// interactive (save, visited, directions).

import * as S from './lib/store.js?v=0.22.3';
import { renderCard } from './components/card.js?v=0.22.3';
import { savedIds, visitedIds } from './lib/saved.js?v=0.22.3';

const root = document.getElementById('collection');
const mode = root && root.dataset.mode;

function emptyState(msg, sub) {
  const d = document.createElement('div');
  d.className = 'empty';
  d.innerHTML = `<p class="empty-msg">${msg}</p>${sub ? `<p class="empty-sub">${sub}</p>` : ''}`;
  return d;
}
function paint(list, msg, sub) {
  root.innerHTML = '';
  if (!list.length) { root.appendChild(emptyState(msg, sub)); return; }
  const head = document.createElement('div');
  head.className = 'section-head';
  head.innerHTML = `<h2 class="section-title">${list.length} listing${list.length === 1 ? '' : 's'}</h2>`;
  root.appendChild(head);
  const wrap = document.createElement('div');
  wrap.className = 'card-list';
  list.forEach(l => wrap.appendChild(renderCard(l, {})));
  root.appendChild(wrap);
}

if (mode === 'saved') {
  paint(S.byIds(savedIds()), 'Nothing saved yet', 'Tap the bookmark on any listing to save it here.');
} else if (mode === 'visited') {
  paint(S.byIds(visitedIds()), 'No visits yet', 'Listings you call, open, or get directions to show up here.');
} else if (mode === 'search') {
  const input = document.querySelector('[data-search-page] input');
  const search = (q) => {
    const ql = q.trim().toLowerCase();
    if (!ql) { paint([], 'Search Georgia lawyers', 'By name, city, county, ZIP, or practice area.'); return; }
    const res = S.LAWYERS.filter(l =>
      l.name.toLowerCase().includes(ql) || l.cityName.toLowerCase().includes(ql) ||
      l.type.toLowerCase().includes(ql) || (l.countyName || '').toLowerCase().includes(ql) ||
      (l.zip || '').includes(ql));
    paint(S.sortBy(res, 'top'), `No matches for “${q}”`, 'Try a city, practice area, or firm name.');
  };
  const sync = () => {
    const q = (input.value || '').trim();
    const url = new URL(location);
    if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
    history.replaceState(null, '', url);
    document.title = q ? `“${q}” | Georgia Lawyer Directory` : 'Search Georgia Lawyers | Georgia Lawyer Directory';
    search(q);
  };
  if (input) {
    const q0 = new URLSearchParams(location.search).get('q') || '';
    input.value = q0;
    input.addEventListener('input', sync);
    search(q0);
    setTimeout(() => input.focus(), 30);
  }
}
