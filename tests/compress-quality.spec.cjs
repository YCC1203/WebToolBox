'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

// Generated entirely inside the browser: repeatable test media without extra
// binary fixtures or a third-party image library.
async function makeTestImage(page, type, quality = 1) {
  const bytes = await page.evaluate(async ({ type, quality }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(900, 600);
    let seed = 742913;
    for (let y = 0; y < 600; y++) {
      for (let x = 0; x < 900; x++) {
        // Detailed, photographic-like content; random seed is deterministic.
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
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
    if (!blob || blob.type !== type) throw new Error(`Unsupported fixture format: ${type}`);
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { type, quality });
  return Buffer.from(bytes);
}

async function startCase(page, { type, quality, mode = 'original' }) {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('/tools/compress.html');
  const source = await makeTestImage(page, type, quality);
  await page.evaluate(() => {
    window.__compressQualityTrials = [];
    const native = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, mime, value) {
      window.__compressQualityTrials.push(value);
      return native.call(this, callback, mime, value);
    };
  });
  const extension = type === 'image/png' ? 'png' : 'jpg';
  await page.locator('#fileInput').setInputFiles({
    name: `fixture.${extension}`, mimeType: type, buffer: source
  });
  await expect(page.locator('#compressBtn')).toBeEnabled();
  if (mode === 'webp') await page.locator('#outputMode').selectOption('webp');
  await page.locator('#compressBtn').click();
  await expect(page.locator('#status')).toContainText('完成：', { timeout: 30000 });
  await expect(page.locator('#downloadAll')).toBeEnabled();
  const wait = page.waitForEvent('download');
  await page.locator('.compress-actions button').nth(1).click();
  const download = await wait;
  const bytes = await fs.readFile(await download.path());
  const trials = await page.evaluate(() => window.__compressQualityTrials);
  expect(errors, errors.join('\n')).toEqual([]);
  return { source, bytes, trials, filename: download.suggestedFilename() };
}

test('智慧壓縮：高品質 JPEG 優先試 98%，不重複低品質編碼', async ({ page }) => {
  const result = await startCase(page, { type: 'image/jpeg', quality: 1 });
  expect(result.trials).toEqual([0.98]);
  expect(result.bytes.length).toBeLessThan(result.source.length * 0.97);
  expect(result.bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  expect(result.filename).toMatch(/-compressed-1\.jpg$/);
  await expect(page.locator('.compress-note')).toContainText('品質設定 98%');
});

test('智慧壓縮：已有足夠壓縮的 JPEG 保留原檔、不增加大小', async ({ page }) => {
  const result = await startCase(page, { type: 'image/jpeg', quality: 0.6 });
  expect(result.trials.length).toBeLessThanOrEqual(2);
  expect(result.bytes).toEqual(result.source);
  expect(result.filename).toBe('fixture.jpg');
  await expect(page.locator('.compress-note')).toContainText('保留原始檔案');
});

test('智慧壓縮：PNG 轉 WebP，減少重複編碼並確認檔案格式', async ({ page }) => {
  const result = await startCase(page, { type: 'image/png', mode: 'webp' });
  expect(result.trials).toEqual([0.98]);
  expect(result.bytes.length).toBeLessThan(result.source.length * 0.97);
  expect(result.bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(result.bytes.toString('ascii', 8, 12)).toBe('WEBP');
  expect(result.filename).toMatch(/-compressed-1\.webp$/);
});
