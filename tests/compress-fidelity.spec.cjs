'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

// Generate repeatable pictures in Chromium. Do not depend on external images,
// services, or the user's device-specific JPEG encoder.
async function fixture(page, kind, outputType, sourceQuality = 0.92) {
  const bytes = await page.evaluate(async ({ kind, outputType, sourceQuality }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    if (kind === 'photo') {
      const pixels = ctx.createImageData(900, 600);
      let seed = 742913;
      for (let y = 0; y < 600; y++) {
        for (let x = 0; x < 900; x++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
          const noise = (seed >>> 24) - 128;
          const i = (y * 900 + x) * 4;
          pixels.data[i] = Math.max(0, Math.min(255, 100 + x / 8 + noise / 2));
          pixels.data[i + 1] = Math.max(0, Math.min(255, 60 + y / 5 + noise / 2));
          pixels.data[i + 2] = Math.max(0, Math.min(255, 130 + noise / 2));
          pixels.data[i + 3] = 255;
        }
      }
      ctx.putImageData(pixels, 0, 0);
    } else {
      const g = ctx.createLinearGradient(0, 0, 900, 600);
      g.addColorStop(0, '#110d50');
      g.addColorStop(.5, '#f1d3ff');
      g.addColorStop(1, '#0cd0b6');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 900, 600);
      ctx.font = 'bold 13px monospace';
      for (let y = 8; y < 600; y += 28) {
        ctx.fillStyle = y % 3 ? '#101010' : '#ffffff';
        ctx.fillText('WEBTOOLBOX 0123456789 crisp text', 8, y + 14);
        ctx.fillRect(0, y, 900, 1);
      }
      for (let x = 0; x < 900; x += 31) {
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(x, 0, 1, 600);
      }
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, outputType, sourceQuality));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { kind, outputType, sourceQuality });
  return Buffer.from(bytes);
}

async function compress(page, name, mimeType, input, mode = 'original') {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.evaluate(() => {
    window.__compressV4Trials = [];
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
      window.__compressV4Trials.push(quality);
      return original.call(this, callback, type, quality);
    };
  });
  await page.locator('#fileInput').setInputFiles({ name, mimeType, buffer: input });
  await expect(page.locator('#compressBtn')).toBeEnabled();
  if (mode === 'webp') await page.locator('#outputMode').selectOption('webp');
  await page.locator('#compressBtn').click();
  await expect(page.locator('#status')).toContainText('完成：', { timeout: 30000 });
  const wait = page.waitForEvent('download');
  await page.locator('.compress-actions button').nth(1).click();
  const download = await wait;
  const bytes = await fs.readFile(await download.path());
  const trials = await page.evaluate(() => window.__compressV4Trials);
  expect(pageErrors).toEqual([]);
  return { bytes, name: download.suggestedFilename(), trials };
}

test('品質強化：JPEG 自適應搜尋最多四次，遵守最低品質與檔案大小門檻', async ({ page }) => {
  await page.goto('/tools/compress.html');
  const source = await fixture(page, 'photo', 'image/jpeg', 0.92);
  const result = await compress(page, 'photo.jpg', 'image/jpeg', source);
  expect(result.trials.length).toBeGreaterThan(0);
  expect(result.trials.length).toBeLessThanOrEqual(4);
  expect(result.trials.every(q => q >= 0.9 && q <= 0.98)).toBe(true);
  expect(result.bytes.length).toBeLessThanOrEqual(source.length);
  if (result.name !== 'photo.jpg') {
    expect(result.bytes.length).toBeLessThan(source.length * 0.97);
    expect(result.bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  } else {
    expect(result.bytes).toEqual(source);
  }
});

test('品質強化：有損 PNG 轉 WebP 必須符合保真檢查，否則保留 PNG', async ({ page }) => {
  await page.goto('/tools/compress.html');
  const source = await fixture(page, 'graphic', 'image/png');
  const result = await compress(page, 'graphic.png', 'image/png', source, 'webp');
  expect(result.bytes.length).toBeLessThanOrEqual(source.length);
  if (result.name === 'graphic.png') {
    expect(result.bytes).toEqual(source);
    await expect(page.locator('.compress-note')).toContainText('保留原始檔案');
  } else {
    expect(result.name).toMatch(/\.webp$/);
    expect(result.bytes.toString('ascii', 8, 12)).toBe('WEBP');
    // An allowed WebP must pass the built-in PNG fidelity guard.
    const psnr = await page.evaluate(async ({ original, encoded }) => {
      const image = async input => createImageBitmap(new Blob([
        Uint8Array.from(atob(input), c => c.charCodeAt(0))
      ]));
      const a = await image(original), b = await image(encoded);
      const c = document.createElement('canvas');
      const scale = Math.min(1, 448 / a.width, 448 / a.height);
      c.width = Math.max(1, Math.round(a.width * scale));
      c.height = Math.max(1, Math.round(a.height * scale));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(a, 0, 0, c.width, c.height);
      const before = ctx.getImageData(0, 0, c.width, c.height).data;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(b, 0, 0, c.width, c.height);
      const after = ctx.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      for (let i = 0; i < before.length; i += 4) {
        const alphaA = before[i + 3] / 255, alphaB = after[i + 3] / 255;
        for (let k = 0; k < 3; k++) {
          const black = before[i + k] * alphaA - after[i + k] * alphaB;
          const white = black + (alphaB - alphaA) * 255;
          sum += black * black + white * white;
        }
      }
      a.close(); b.close();
      const mse = sum / (c.width * c.height * 6);
      return mse ? 10 * Math.log10(255 * 255 / mse) : 100;
    }, { original: source.toString('base64'), encoded: result.bytes.toString('base64') });
    expect(psnr).toBeGreaterThanOrEqual(37.99);
  }
});
