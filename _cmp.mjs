import { loadStore } from './scripts/import-lib.mjs';
import { cityNameFromAddr } from './scripts/gate.mjs';
const store = loadStore();
const isGoogle = id => /^(ChIJ|0x[0-9a-f]+:)/i.test(id || '');
const g = {}, b = {};
for (const r of store) {
  const c = cityNameFromAddr(r.Address || '') || '?';
  if (isGoogle(r.ID)) g[c] = (g[c] || 0) + 1; else b[c] = (b[c] || 0) + 1;
}
const cities = Object.keys(g).sort((a, z) => (g[z] || 0) - (g[a] || 0));
console.log('City              Google   Bing   winner');
for (const c of cities.slice(0, 18)) {
  const gg = g[c] || 0, bb = b[c] || 0;
  const w = gg > bb ? 'Google' : bb > gg ? 'Bing' : 'tie';
  console.log(c.padEnd(16), String(gg).padStart(5), String(bb).padStart(6), '  ' + w);
}
let GA = 0, BA = 0; for (const c of cities) { GA += g[c] || 0; BA += b[c] || 0; }
console.log('\nAcross the ' + cities.length + ' cities the Google scrape covered:');
console.log('  Google listings:', GA);
console.log('  Bing listings:  ', BA);
