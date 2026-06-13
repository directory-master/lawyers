// version-stamp.mjs — cache-busting stamper.
//
// The browser caches CSS and ES modules by URL. Without a changing URL, GitHub
// Pages can serve a stale file, so the site flips between old and new design
// until a hard refresh. This stamps `?v=<package.json version>` onto:
//   1. the CSS/JS asset links in index.html
//   2. every relative `import … from './x.js'` in js/**/*.js (so the WHOLE module
//      graph re-fetches, not just the entry file)
//
// Workflow on any change:  bump "version" in package.json  →  `npm run stamp`.
// Re-running is idempotent (existing ?v=… are replaced).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const V = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

let changed = 0;
const write = (path, next, prev) => { if (next !== prev) { writeFileSync(path, next); changed++; console.log('  stamped', path.replace(ROOT, '')); } };

// 1) index.html — versioned css/js links
const htmlPath = join(ROOT, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const html2 = html.replace(/((?:href|src)=")(\/(?:css|js)\/[^"?]+\.(?:css|js))(\?v=[^"]*)?(")/g,
  (_, a, url, _q, z) => `${a}${url}?v=${V}${z}`);
write(htmlPath, html2, html);

// 2) all js/**/*.js — versioned relative imports
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) {
      const src = readFileSync(p, 'utf8');
      const out = src.replace(/(from\s+['"])(\.{1,2}\/[^'"]+?\.js)(\?v=[^'"]*)?(['"])/g,
        (_, a, spec, _q, z) => `${a}${spec}?v=${V}${z}`);
      write(p, out, src);
    }
  }
}
walk(join(ROOT, 'js'));

console.log(`\nStamped v${V} on ${changed} file(s).`);
