// saved.js — local persistence for Saved (bookmarked) and Visited listings.
// Stored in localStorage as arrays of listing ids. No backend, no accounts.
//
// A single onChange listener keeps the whole DOM in sync: any save toggle or
// visit updates every quick-access counter ([data-qa-count]) and every save
// button ([data-save-id]) currently on the page. That avoids per-component
// listeners leaking across SPA navigations.

const SKEY = 'gal.saved', VKEY = 'gal.visited', VMAX = 100;
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const store = (k, arr) => { try { localStorage.setItem(k, JSON.stringify(arr)); } catch { /* private mode */ } };

let savedArr = load(SKEY);     // most-recently-saved first
let visitedArr = load(VKEY);   // most-recently-visited first

const listeners = new Set();
const emit = () => { for (const f of listeners) f(); };
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const isSaved = (id) => savedArr.includes(id);
export function toggleSave(id) {
  savedArr = isSaved(id) ? savedArr.filter(x => x !== id) : [id, ...savedArr];
  store(SKEY, savedArr); emit(); return isSaved(id);
}
export const savedIds = () => savedArr.slice();

export function markVisited(id) {
  visitedArr = [id, ...visitedArr.filter(x => x !== id)].slice(0, VMAX);
  store(VKEY, visitedArr); emit();
}
export const visitedIds = () => visitedArr.slice();

export const counts = () => ({ saved: savedArr.length, visited: visitedArr.length });

// Keep the live DOM in sync on every change (one global listener).
onChange(() => {
  const c = counts();
  document.querySelectorAll('[data-qa-count="saved"]').forEach(e => e.textContent = c.saved);
  document.querySelectorAll('[data-qa-count="visited"]').forEach(e => e.textContent = c.visited);
  document.querySelectorAll('[data-save-id]').forEach(b => {
    const on = isSaved(b.dataset.saveId);
    b.classList.toggle('is-saved', on);
    b.setAttribute('aria-pressed', String(on));
  });
});
