#!/usr/bin/env node
/**
 * Re-download the face models used by the backend (already vendored in backend/models).
 * Usage: node scripts/download-face-models.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'backend', 'models');
const base = 'https://raw.githubusercontent.com/vladmandic/human-models/master/models';
const files = [
  'blazeface.json', 'blazeface.bin',
  'facemesh.json', 'facemesh.bin',
  'faceres.json', 'faceres.bin',
];

fs.mkdirSync(outDir, { recursive: true });
for (const name of files) {
  const target = path.join(outDir, name);
  if (fs.existsSync(target) && fs.statSync(target).size > 1000) {
    console.log(`skip ${name} (already present)`);
    continue;
  }
  console.log(`download ${name} ...`);
  const res = await fetch(`${base}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  console.log(`  wrote ${(fs.statSync(target).size / 1024 / 1024).toFixed(2)} MB`);
}
console.log(`face models ready in ${outDir}`);
