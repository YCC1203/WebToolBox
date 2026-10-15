const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const fixture = path.join(__dirname, 'fixtures', 'sample.png');

// Verify decoded ImageBitmaps are closed, including after an operation finishes.
async function watchBitmaps(page) {
  await page.addInitScript(() => {
    const original = window.createImageBitmap.bind(window);
    window.__bitmapLifecycle = { created: 0, closed: 0 };
    window.createImageBitmap = async (...args) => {
      const bitmap = await original(...args);
      window.__bitmapLifecycle.created++;
      const originalClose = bitmap.close.bind(bitmap);
      bitmap.close = () => {
        window.__bitmapLifecycle.closed++;
        originalClose();
      };
      return bitmap;
    };
  });
}

async function downloadFile(page, selector) {
  const downloadEvent = page.waitForEvent('download', { timeout: 30000 });
  await page.locator(selector).click();
  const item = await downloadEvent;
  return { name: item.suggestedFilename(), bytes: await fs.readFile(await item.path()) };
}

test('圖片轉檔：釋放解碼資源、輸出 JPEG，並保留透明背景合成設定', async ({ page }) => {
  await watchBitmaps(page);
  await page.goto('/tools/convert.html');

  // Transparent PNG with a small opaque patch. The transparent corner should
  // be composited on the chosen background for JPEG output.
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#ee2222';
    ctx.fillRect(48, 48, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#fileInput').setInputFiles({
    name: 'transparent.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64')
  });
  await expect(page.locator('#fileCount')).toContainText('1 / 20');
  await page.locator('#outputFormat').selectOption('image/jpeg');
  await page.locator('#backgroundColor').fill('#ffffff');
  await page.locator('#convertBtn').click();
  await expect(page.locator('#status')).toContainText('轉換完成');
  const { name, bytes } = await downloadFile(page, '#imageList .image-download');
  expect(name).toMatch(/\.jpg$/i);
  expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

  const corner = await page.evaluate(async data => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/jpeg' }));
    const c = document.createElement('canvas');
    c.width = bitmap.width; c.height = bitmap.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const rgb = Array.from(ctx.getImageData(2, 2, 1, 1).data).slice(0, 3);
    bitmap.close();
    return rgb;
  }, Array.from(bytes));
  expect(corner.every(channel => channel >= 235)).toBe(true);

  const lifecycle = await page.evaluate(() => window.__bitmapLifecycle);
  expect(lifecycle.created).toBeGreaterThanOrEqual(3);
  expect(lifecycle.closed).toBe(lifecycle.created);
  await page.locator('#clearAll').click();
  await expect(page.locator('#fileCount')).toContainText('0 / 20');
});

test('圖片尺寸調整：釋放解碼資源、保留輸出尺寸並在 ZIP 建立中鎖定操作', async ({ page }) => {
  await watchBitmaps(page);
  await page.goto('/tools/resize.html');
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#fileCount')).toContainText('1 / 20');
  await page.locator('#targetWidth').fill('160');
  await page.locator('#processBtn').click();
  await expect(page.locator('#status')).toContainText('處理完成');
  const { bytes } = await downloadFile(page, '#imageList .image-download');
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
  expect(bytes.readUInt32BE(16)).toBe(160);

  const lifecycle = await page.evaluate(() => window.__bitmapLifecycle);
  expect(lifecycle.created).toBeGreaterThanOrEqual(2);
  expect(lifecycle.closed).toBe(lifecycle.created);

  await page.evaluate(() => {
    const original = JSZip.prototype.generateAsync;
    JSZip.prototype.generateAsync = async function (...args) {
      await new Promise(resolve => setTimeout(resolve, 450));
      return original.apply(this, args);
    };
  });
  const downloadEvent = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('#downloadAll').click();
  await expect(page.locator('#fileInput')).toBeDisabled();
  await expect(page.locator('#clearAll')).toBeDisabled();
  await expect(page.locator('#outputFormat')).toBeDisabled();
  const zip = await downloadEvent;
  const zipBytes = await fs.readFile(await zip.path());
  expect(zipBytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  await expect(page.locator('#clearAll')).toBeEnabled();
  await page.locator('#clearAll').click();
  await expect(page.locator('#fileCount')).toContainText('0 / 20');
});
