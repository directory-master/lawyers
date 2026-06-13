// confetti.js — a tiny, dependency-free "puff" of confetti from a point.
// Used when a listing is saved. On-brand colors (gilt, oxblood, white).

const COLORS = ['#a8893c', '#c2a75e', '#d4af37', '#6e1b2a', '#ffffff'];

export function puff(x, y) {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const n = 18;
  for (let i = 0; i < n; i++) {
    const bit = document.createElement('span');
    bit.className = 'confetti-bit';
    const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.6;
    const dist = 34 + Math.random() * 56;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist + 22 + Math.random() * 32;   // a little gravity drift
    const sz = 6 + Math.random() * 4;
    bit.style.cssText =
      `left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;background:${COLORS[i % COLORS.length]};`
      + `border-radius:${Math.random() < 0.5 ? '2px' : '50%'};`
      + `--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;--rot:${(Math.random() * 720 - 360).toFixed(0)}deg;`
      + `animation-delay:${(Math.random() * 40).toFixed(0)}ms`;
    document.body.appendChild(bit);
    bit.addEventListener('animationend', () => bit.remove());
  }
}

// Fire a puff from an element's center, or from the click coordinates if present.
export function puffFrom(el, e) {
  const r = el.getBoundingClientRect();
  const x = (e && e.clientX) || r.left + r.width / 2;
  const y = (e && e.clientY) || r.top + r.height / 2;
  puff(x, y);
}
