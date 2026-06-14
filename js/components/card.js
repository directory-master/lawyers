// card.js — the lawyer card. This IS the product: a tappable iOS-style listing.
// Tier-gates what each listing earns. Reused by the SPA and (markup-mirrored) by
// the static page generator.
//
//   Free      → name, practice area, city, rating, firm/attorney tag, call +
//               directions, website link, a subtle "Claim this listing" CTA.
//   Standard  → + photo, hours, "Verified" eligibility.
//   Premium   → + pinned to top, "Request a consultation" CTA, social links.

import { h } from '../lib/dom.js?v=0.24.5';
import { icon } from '../lib/icons.js?v=0.24.5';
import { isSaved, toggleSave, markVisited } from '../lib/saved.js?v=0.24.5';
import { puffFrom } from '../lib/confetti.js?v=0.24.5';
import { initials, telHref, prettyHost, mapsHref, stars, fmtRating, fmtDistance, fmtReviews, parseHours } from '../lib/format.js?v=0.24.5';

const CLAIM_TO = 'artivicolab@gmail.com'; // never rendered as visible text

function saveButton(l) {
  return h('button', {
    class: 'lc-save' + (isSaved(l.id) ? ' is-saved' : ''),
    'data-save-id': l.id, 'aria-pressed': String(isSaved(l.id)),
    'aria-label': 'Save ' + l.name, title: 'Save',
    onclick: (e) => { e.stopPropagation(); e.preventDefault(); if (toggleSave(l.id)) puffFrom(e.currentTarget, e); },
  }, icon('bookmark', { size: 18 }));
}

// Framed square thumbnail (photo or initials fallback).
function thumb(l) {
  const fallback = () => h('div', { class: 'lc-thumb lc-thumb--initials', 'aria-hidden': 'true' }, initials(l.name));
  if (!l.image) return fallback();
  const img = h('img', { src: l.image, alt: l.name, loading: 'lazy', decoding: 'async',
    onerror: () => { wrap.replaceWith(fallback()); } });
  const wrap = h('div', { class: 'lc-thumb' }, img);
  return wrap;
}

// Editorial "letterhead" card — mirrors scripts/generate-pages.mjs cardHTML.
export function renderCard(l, { rank = null } = {}) {
  const tel = telHref(l.phone);
  const kind = l.entity === 'firm' ? 'LAW FIRM' : 'ATTORNEY';
  const visit = (e) => { e.stopPropagation(); markVisited(l.id); };
  return h('article', {
    class: 'lc', dataset: { listingId: l.id, entity: l.entity, rating: l.rating || 0, reviews: l.reviews || 0 },
  },
    h('div', { class: 'lc-tabs' },
      rank != null && h('span', { class: 'lc-tab lc-tab--rank' }, 'No. ' + rank),
      h('span', { class: 'lc-tab lc-tab--kind' }, kind)),
    h('div', { class: 'lc-card' },
      saveButton(l),
      h('div', { class: 'lc-main' },
        thumb(l),
        h('div', { class: 'lc-info' },
          h('h3', { class: 'lc-name' }, l.name),
          h('div', { class: 'lc-sub' }, l.type),
          h('div', { class: 'lc-meta' },
            l.rating
              ? h('span', { class: 'lc-rating' }, h('span', { class: 'lc-star' }, '★'), ' ' + l.rating.toFixed(1))
              : h('span', { class: 'lc-rating lc-rating--new' }, 'New'),
            l.reviews ? h('span', { class: 'lc-reviews' }, `${l.reviews.toLocaleString()} review${l.reviews === 1 ? '' : 's'}`) : null,
          ),
          h('div', { class: 'lc-addr' }, icon('mapPin', { size: 15 }), h('span', {}, l.address || `${l.cityName}, GA`)),
        ),
      ),
      h('div', { class: 'lc-actions' },
        tel && h('a', { class: 'lc-btn lc-btn--call', href: tel, onclick: visit }, icon('phone', { size: 16 }), h('span', {}, 'Call')),
        h('a', { class: 'lc-btn', href: mapsHref(l), target: '_blank', rel: 'noopener', onclick: visit }, icon('navigation', { size: 16 }), h('span', {}, 'Directions')),
        l.website && h('a', { class: 'lc-btn', href: l.website, target: '_blank', rel: 'noopener nofollow', onclick: visit }, icon('globe', { size: 16 }), h('span', {}, 'Website')),
      ),
    ),
  );
}

// Placement slot for the paid rows. Fills with a real listing once a firm buys
// the spot; until then it shows the offer + price. Honest: we never tag a scraped
// firm as paying.
const SLOT = {
  premium: { tag: 'Premium', price: '$20', blurb: 'Top of the page across your city and practice area, with your photo, hours, and a consultation button.' },
  standard: { tag: 'Standard', price: '$10', blurb: 'Listed above the free results in your city, with your photo, hours, and website link.' },
};
export function promoCard(tier) {
  const s = SLOT[tier];
  return h('article', { class: `card promo promo--${tier}` },
    h('div', { class: 'promo-tag' }, icon('sparkles', { size: 13, fill: true }), s.tag.toUpperCase()),
    h('div', { class: 'promo-price' }, s.price, h('span', { class: 'promo-per' }, '/mo')),
    h('h3', { class: 'promo-title' }, 'Your practice here'),
    h('p', { class: 'promo-blurb' }, s.blurb),
    h('button', { class: `btn ${tier === 'premium' ? 'btn--gold' : 'btn--primary'} promo-btn`,
      onclick: () => openSlot(tier) }, 'Claim this spot'),
  );
}
function openSlot(tier) {
  const s = SLOT[tier];
  const subj = `${s.tag} listing ($${tier === 'premium' ? '20' : '10'}/mo)`;
  window.location.href = `mailto:${CLAIM_TO}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(`I'd like the ${s.tag.toLowerCase()} placement (${s.price}/mo).\n\nPractice name:\nCity:\nWebsite:\nBest phone:`)}`;
}

// Lightweight claim modal → mailto (address never shown as text).
export function openClaim(l) {
  const existing = document.querySelector('.modal-backdrop');
  if (existing) existing.remove();
  const close = () => backdrop.remove();
  const mailto = `mailto:${CLAIM_TO}?subject=${encodeURIComponent('Claim listing: ' + l.name)}&body=${encodeURIComponent(`I want to claim and upgrade:\n\n${l.name}\n${l.address || l.cityName + ', GA'}\n\nName:\nRole:\nBest phone:`)}`;
  const backdrop = h('div', { class: 'modal-backdrop', onclick: e => { if (e.target === backdrop) close(); } },
    h('div', { class: 'modal sheet', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'sheet-grip' }),
      h('h2', { class: 'modal-title' }, 'Claim this listing'),
      h('p', { class: 'modal-body' }, `Is ${l.name} your practice? Claim it to add photos, hours, your website, a consultation button, and pin it to the top of `, h('strong', {}, `${l.cityName}, GA`), ' results.'),
      h('a', { class: 'btn btn--primary', href: mailto }, 'Start claim'),
      h('button', { class: 'btn btn--ghost', onclick: close }, 'Not now'),
    ),
  );
  document.body.append(backdrop);
}
