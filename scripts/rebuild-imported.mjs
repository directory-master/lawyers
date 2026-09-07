#!/usr/bin/env node
// Rebuild js/data/lawyers-imported.js from the durable store WITHOUT importing
// any CSV (e.g. after fetch-images.mjs updated data/photos.json).
import { buildStore } from './import-lib.mjs';
buildStore([], 0, 'store');
