// analytics.js — thin GA4 event layer.
//
// The base gtag.js tag and Consent Mode v2 defaults live in the <head> of every
// generated page (see scripts/generate-pages.mjs → GTAG). This module only sends
// named events and updates consent; it never loads the tag itself, so it is safe
// to import everywhere even before the visitor has chosen.

// Always push through dataLayer so events queued before gtag.js finishes loading
// are still delivered once it does. Wrapped in try/catch for private mode / blockers.
const dl = (...args) => {
  try {
    window.dataLayer = window.dataLayer || [];
    (window.gtag || function () { window.dataLayer.push(arguments); })(...args);
  } catch { /* analytics blocked — ignore */ }
};

// Send a GA4 event. Undefined params are dropped so the payload stays clean.
export const track = (name, params = {}) => {
  const clean = {};
  for (const k in params) if (params[k] !== undefined && params[k] !== '') clean[k] = params[k];
  dl('event', name, clean);
};

// Read the listing id from the card wrapping an element, if any.
export const listingOf = (el) => el?.closest?.('[data-listing-id]')?.dataset.listingId;

// Consent Mode v2 — flip analytics storage on once the visitor accepts.
export const grantConsent = () => dl('consent', 'update', { analytics_storage: 'granted' });
