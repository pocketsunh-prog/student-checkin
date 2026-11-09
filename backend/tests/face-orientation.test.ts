import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { orientImage } from '../src/face/human';

/**
 * Regression for phone photos that store landscape pixels plus an EXIF rotation.
 * TFJS decodeImage ignores EXIF, so the provider must normalise first; otherwise
 * an enrolled sideways face descriptor can never match an upright live scan.
 */
describe('face image EXIF orientation', () => {
  it('rotates EXIF orientation 8 images to upright pixels', async () => {
    const sideways = await sharp({
      create: { width: 120, height: 60, channels: 3, background: { r: 120, g: 80, b: 40 } },
    })
      .jpeg()
      .withMetadata({ orientation: 8 })
      .toBuffer();

    const before = await sharp(sideways).metadata();
    expect([before.width, before.height, before.orientation]).toEqual([120, 60, 8]);

    const upright = await orientImage(sideways);
    const after = await sharp(upright).metadata();
    expect([after.width, after.height]).toEqual([60, 120]);
    expect(after.orientation ?? 1).toBe(1);
  });

  it('keeps an already-upright image byte-for-byte', async () => {
    const upright = await sharp({
      create: { width: 60, height: 120, channels: 3, background: { r: 30, g: 30, b: 30 } },
    })
      .jpeg()
      .withMetadata({ orientation: 1 })
      .toBuffer();

    const result = await orientImage(upright);
    expect(result).toBe(upright);
  });
});
