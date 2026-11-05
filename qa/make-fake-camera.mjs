#!/usr/bin/env node
/**
 * Build a Y4M "webcam" video from a test portrait so Playwright/Chromium can emulate a camera.
 * Output: qa/fixtures/face-camera.y4m
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, 'fixtures');
const srcName = process.env.FACE_SRC || 'amy1.png';
const src = path.isAbsolute(srcName) ? srcName : path.join(fixtures, srcName);
const outName = process.env.FACE_OUT || `face-camera-${path.basename(srcName, path.extname(srcName))}.y4m`;
const out = path.join(fixtures, outName);
const W = 640, H = 480, FPS = 10, SECONDS = 15;

if (!fs.existsSync(src)) {
  console.error(`Missing ${src}. Run: node scripts/e2e-api.mjs (downloads fixtures) or fetch it first.`);
  process.exit(1);
}

const { data: rgb } = await sharp(src)
  .resize(W, H, { fit: 'contain', background: { r: 38, g: 42, b: 48, alpha: 1 }, kernel: 'lanczos3' })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const ySize = W * H;
const uvW = Math.ceil(W / 2), uvH = Math.ceil(H / 2);
const uvSize = uvW * uvH;

function frame() {
  const y = Buffer.alloc(ySize);
  const u = Buffer.alloc(uvSize);
  const v = Buffer.alloc(uvSize);
  const rgbAt = (x, yy) => { const i = (yy * W + x) * 3; return [rgb[i], rgb[i + 1], rgb[i + 2]]; };
  for (let yy = 0; yy < H; yy++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = rgbAt(x, yy);
      y[yy * W + x] = Math.max(0, Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b)));
    }
  }
  for (let yy = 0; yy < uvH; yy++) {
    for (let x = 0; x < uvW; x++) {
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (const dy of [0, 1]) {
        for (const dx of [0, 1]) {
          const px = x * 2 + dx, py = yy * 2 + dy;
          if (px >= W || py >= H) continue;
          const [r, g, b] = rgbAt(px, py); sr += r; sg += g; sb += b; n++;
        }
      }
      const r = sr / n, g = sg / n, b = sb / n;
      u[yy * uvW + x] = Math.max(0, Math.min(255, Math.round(-0.169 * r - 0.331 * g + 0.5 * b + 128)));
      v[yy * uvW + x] = Math.max(0, Math.min(255, Math.round(0.5 * r - 0.419 * g - 0.081 * b + 128)));
    }
  }
  return Buffer.concat([Buffer.from('FRAME\n'), y, u, v]);
}

const one = frame();
const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`);
const fd = fs.openSync(out, 'w');
fs.writeSync(fd, header);
for (let i = 0; i < FPS * SECONDS; i++) fs.writeSync(fd, one);
fs.closeSync(fd);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB, ${SECONDS}s)`);
