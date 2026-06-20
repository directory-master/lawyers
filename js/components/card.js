// card.js — the lawyer card. This IS the product: a tappable iOS-style listing.
// Tier-gates what each listing earns. Reused by the SPA and (markup-mirrored) by
// the static page generator.
//
//   Free      → name, practice area, city, rating, firm/attorney tag, call +
//               directions, website link, a subtle "Claim this listing" CTA.
//   Standard  → + photo, hours, "Verified" eligibility.
//   Premium   → + pinned to top, "Request a consultation" CTA, social links.

import { h } from '../lib/dom.js?v=0.35.8';
import { icon } from '../lib/icons.js?v=0.35.8';
import { isSaved, toggleSave, markVisited } from '../lib/saved.js?v=0.35.8';
import { puffFrom } from '../lib/confetti.js?v=0.35.8';
import { initials, telHref, prettyHost, mapsHref, stars, fmtRating, fmtDistance, fmtReviews, parseHours, hiResImage, ringDur } from '../lib/format.js?v=0.35.8';

const CLAIM_TO = 'artivicolab@gmail.com'; // never rendered as visible text

// Haptic feedback on save toggle: confirming double tap when saving, single
// softer pulse when unsaving. No-op where Vibration API is unsupported/blocked.
const haptic = (saved) => { try { navigator.vibrate?.(saved ? [12, 28, 22] : 18); } catch { /* unsupported */ } };

function saveButton(l) {
  return h('button', {
    class: 'lc-save' + (isSaved(l.id) ? ' is-saved' : ''),
    'data-save-id': l.id, 'aria-pressed': String(isSaved(l.id)),
    'aria-label': 'Save ' + l.name, title: 'Save',
    onclick: (e) => { e.stopPropagation(); e.preventDefault(); const saved = toggleSave(l.id); haptic(saved); if (saved) puffFrom(e.currentTarget, e); },
  }, icon('bookmark', { size: 18 }));
}

// Initials panel sits behind every card as the base layer; the upscaled photo
// overlays it when present, and drops out (revealing the initials) if it fails to
// load — so a broken photo URL never shows a broken-image glyph.
function bgInitials(l) {
  return h('div', { class: 'lc-bg lc-bg--initials', 'aria-hidden': 'true' }, initials(l.name));
}
function cardBg(l) {
  const layers = [bgInitials(l)];
  if (l.image) {
    const img = h('img', { class: 'lc-bg lc-bg--photo', src: hiResImage(l.image), alt: l.name,
      loading: 'lazy', decoding: 'async', onerror: () => img.remove() });
    layers.push(img);
  }
  return layers;
}

// "Bottom glass" photo card with an oxblood letterhead band on top — mirrors
// scripts/generate-pages.mjs cardHTML. Top five ranks get a distinct frame.
export function renderCard(l, { rank = null } = {}) {
  const tel = telHref(l.phone);
  const kind = l.entity === 'firm' ? 'LAW FIRM' : 'ATTORNEY';
  const visit = (e) => { e.stopPropagation(); markVisited(l.id); };
  const cls = 'lc' + (rank != null && rank <= 5 ? ' lc--rank' + rank : '');
  return h('article', {
    class: cls, style: '--ring:' + ringDur(l.id),
    dataset: { listingId: l.id, entity: l.entity, rating: l.rating || 0, reviews: l.reviews || 0 },
  },
    h('div', { class: 'lc-card' },
      // outer letterhead band (sits above the photo, never over it)
      h('div', { class: 'lc-band' },
        h('div', { class: 'lc-tabs' },
          rank != null && h('span', { class: 'lc-tab lc-tab--rank' }, 'No. ' + rank),
          h('span', { class: 'lc-tab lc-tab--kind' }, kind),
          (l.tier === 'premium' || l.tier === 'standard') && h('span', { class: 'lc-tab lc-tab--promoted' }, 'Promoted')),
        saveButton(l)),
      h('div', { class: 'lc-photo' },
        cardBg(l),
        h('div', { class: 'lc-scrim' }),
        h('span', { class: 'lc-wm', 'data-dist': '', 'aria-hidden': 'true' }),
        h('div', { class: 'lc-body' },
          l.rating ? h('div', { class: 'lc-seal' },
            h('span', { class: 'lc-star' }, '★'),
            h('span', { class: 'lc-seal-n' }, l.rating.toFixed(1))) : null,
          // title gives long names a native tooltip; CSS clamps to two lines.
          h('h3', { class: 'lc-name', title: l.name }, l.name),
          h('div', { class: 'lc-sub' }, l.type),
          h('div', { class: 'lc-meta' },
            l.reviews ? h('span', { class: 'lc-reviews' }, `${l.reviews.toLocaleString()} review${l.reviews === 1 ? '' : 's'}`) : null,
          ),
          h('div', { class: 'lc-addr' }, icon('mapPin', { size: 15 }), h('span', {}, l.address || `${l.cityName}, GA`)),
          h('div', { class: 'lc-actions' },
            tel && h('a', { class: 'lc-btn lc-btn--call', href: tel, onclick: visit, title: 'Call' }, icon('phone', { size: 16 }), h('span', {}, 'Call')),
            h('a', { class: 'lc-btn', href: mapsHref(l), target: '_blank', rel: 'noopener', onclick: visit, 'aria-label': 'Directions', title: 'Get directions' }, icon('navigation', { size: 16 }), h('span', {}, 'Directions')),
            l.website && h('a', { class: 'lc-btn', href: l.website, target: '_blank', rel: 'noopener nofollow', onclick: visit, 'aria-label': 'Website', title: 'Visit website' }, icon('globe', { size: 16 }), h('span', {}, 'Website')),
          ),
        ),
      ),
    ),
  );
}

// Placement slot for the paid rows. Fills with a real listing once a firm buys
// the spot; until then it shows the offer and sends people to /pricing/ for the
// rates (prices live on the pricing page only). Honest: we never tag a scraped
// firm as paying.
const SLOT = {
  premium: { tag: 'Premium', blurb: 'Top of the page across your city and practice area, with your photo, hours, and a consultation button.' },
  standard: { tag: 'Standard', blurb: 'Listed above the free results in your city, with your photo, hours, and website link.' },
};
export function promoCard(tier) {
  const s = SLOT[tier];
  return h('article', { class: `card promo promo--${tier}` },
    h('div', { class: 'promo-tag' }, icon('sparkles', { size: 13, fill: true }), s.tag.toUpperCase()),
    h('h3', { class: 'promo-title' }, 'Your practice here'),
    h('p', { class: 'promo-blurb' }, s.blurb),
    h('a', { class: `btn ${tier === 'premium' ? 'btn--gold' : 'btn--primary'} promo-btn`,
      href: '/pricing/' }, 'See pricing'),
  );
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
