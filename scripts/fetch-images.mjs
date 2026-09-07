#!/usr/bin/env node
// Self-host listing photos.
//
// The scrape gives us hotlinked thumbnails (Bing, Google Maps lh3, Street View).
// Google's lh3 URLs die within weeks (403), so every card that relied on one
// silently fell back to initials. This script downloads each reachable image
// once into assets/photos/<id>.jpg (max 400px, progressive JPEG q62 via PIL), and records
// the outcome in data/photos.json. The importer then points `image` at the
// local file, or at null when the source is known dead, so the page never
// issues a request that will 403.
//
//   node scripts/fetch-images.mjs               # fetch anything not yet tried
//   node scripts/fetch-images.mjs --retry-dead  # also retry previous failures
//   node scripts/fetch-images.mjs --limit 50    # smoke test
//
// Re-run after every import (new listings), then `node scripts/rebuild-imported.mjs`
// and `npm run build`.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { IMPORTED } from '../js/data/lawyers-imported.js';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'assets/photos');
const MANIFEST = join(ROOT, 'data/photos.json');
const TMP = join(ROOT, 'assets/photos/.tmp');
mkdirSync(TMP, { recursive: true });

const args = process.argv.slice(2);
const RETRY_DEAD = args.includes('--retry-dead');
const LIMIT = args.includes('--limit') ? +args[args.indexOf('--limit') + 1] : Infinity;
const CONC = 16;
const MAX_PX = 400;   // cards are ~200 CSS px wide at 2x
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const isRemote = (u) => /^https?:\/\//.test(u || '');
// Ask the source for a sensible size (the scrape gives 80px thumbs for Google).
const sized = (url) => {
  if (/=w\d+-h\d+/.test(url)) return url.replace(/=w\d+-h\d+/, `=w${MAX_PX}-h${MAX_PX}`);
  if (url.includes('streetviewpixels-pa.googleapis.com')) return url.replace(/([?&]w=)\d+/, `$1${MAX_PX}`).replace(/([?&]h=)\d+/, `$1${Math.round(MAX_PX * 0.75)}`);
  return url;
};

const jobs = [];
for (const l of IMPORTED) {
  const prev = manifest[l.id];
  const src = isRemote(l.image) ? l.image : prev?.src;
  if (!src) continue;
  const file = join(DIR, `${l.id}.jpg`);
  if (prev?.file && existsSync(join(ROOT, prev.file))) continue;   // already have it
  if (prev && !prev.file && !RETRY_DEAD) continue;                  // known dead, skip
  jobs.push({ id: l.id, src, file });
  if (jobs.length >= LIMIT) break;
}
console.log(`${jobs.length} image(s) to fetch (${Object.keys(manifest).length} already in manifest)`);

let ok = 0, dead = 0, done = 0;
const today = new Date().toISOString().slice(0, 10);
async function one(j) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  let status = 0;
  try {
    const res = await fetch(sized(j.src), { headers: { 'User-Agent': UA, Accept: 'image/*' }, signal: ctl.signal, redirect: 'follow' });
    status = res.status;
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.startsWith('image/')) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 1500) {
        const tmp = join(TMP, j.id);
        writeFileSync(tmp, buf);
        await run('python3', [join(ROOT, 'scripts/_encode-photo.py'), tmp, j.file, String(MAX_PX)]);
        unlinkSync(tmp);
        if (statSync(j.file).size > 500) {
          manifest[j.id] = { src: j.src, file: `assets/photos/${j.id}.jpg`, status, at: today };
          ok++; return;
        }
      }
    }
  } catch (e) { status = status || (e.name === 'AbortError' ? 'timeout' : e.code || 'error'); }
  finally { clearTimeout(t); }
  manifest[j.id] = { src: j.src, file: null, status, at: today };
  dead++;
}
async function worker() {
  while (jobs.length) {
    const j = jobs.shift();
    await one(j);
    if (++done % 100 === 0) { console.log(`  ${done} done · ${ok} saved · ${dead} dead`); save(); }
  }
}
const save = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
await Promise.all(Array.from({ length: CONC }, worker));
save();
const have = Object.values(manifest).filter(m => m.file).length;
console.log(`saved ${ok}, dead ${dead}. manifest: ${have} local photos, ${Object.keys(manifest).length - have} dead.`);
