const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const fixture = path.join(__dirname, 'fixtures', 'sample.png');
const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex');

async function output(page) {
  const event = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('#downloadBtn').click();
  const download = await event;
  const bytes = await fs.readFile(await download.path());
  return { filename: download.suggestedFilename(), bytes };
}

async function readyWithTwoImages(page) {
  await page.goto('/tools/stitch.html');
  await page.locator('#fileInput').setInputFiles([fixture, fixture]);
  await expect(page.locator('#imageList > li')).toHaveCount(2);
  await expect(page.locator('#downloadBtn')).toBeEnabled();
}

test('圖片拼接：直向拼接、排序與 PNG 輸出尺寸', async ({ page }) => {
  await readyWithTwoImages(page);
  await page.locator('#outputWidth').fill('600');
  await page.locator('#gap').fill('20');
  await expect(page.locator('#outputInfo')).toContainText('600 ×');
  await page.getByRole('button', { name: '上移第 2 張圖片' }).click();
  await expect(page.locator('#imageList > li')).toHaveCount(2);
  const { bytes, filename } = await output(page);
  expect(filename).toBe('WebToolbox-Stitched-Image.png');
  expect(bytes.subarray(0, 8)).toEqual(pngHeader);
  expect(bytes.readUInt32BE(16)).toBe(600);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(600);
});

test('圖片拼接：橫向拼接及 JPG／WebP 下載', async ({ page }) => {
  await readyWithTwoImages(page);
  await page.locator('#layoutMode').selectOption('horizontal');
  await page.locator('#outputWidth').fill('800');
  await page.locator('#outputFormat').selectOption('image/jpeg');
  await expect(page.locator('#qualityField')).toBeVisible();
  await page.locator('#quality').fill('80');
  let file = await output(page);
  expect(file.filename).toMatch(/\.jpg$/);
  expect(file.bytes.subarray(0, 2).toString('hex')).toBe('ffd8');
  await page.locator('#outputFormat').selectOption('image/webp');
  file = await output(page);
  expect(file.filename).toMatch(/\.webp$/);
  expect(file.bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(file.bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
});

test('圖片拼接：網格模式可切換格子比例、填滿和背景色', async ({ page }) => {
  await readyWithTwoImages(page);
  await page.locator('#layoutMode').selectOption('grid');
  await expect(page.locator('#columnsField')).toBeVisible();
  await page.locator('#outputWidth').fill('500');
  await page.locator('#columns').selectOption('2');
  await page.locator('#fitMode').selectOption('cover');
  await page.locator('#backgroundColor').fill('#ff0000');
  await expect(page.locator('#downloadBtn')).toBeEnabled();
  const { bytes } = await output(page);
  expect(bytes.readUInt32BE(16)).toBe(500);
  const corner = await page.evaluate(async bytes => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
    const cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0);
    const data = Array.from(cx.getImageData(0, 0, 1, 1).data); bmp.close(); return data;
  }, Array.from(bytes));
  expect(corner).toEqual([255, 0, 0, 255]);
});

test('圖片拼接：無效格式、非法尺寸與清空', async ({ page }) => {
  await page.goto('/tools/stitch.html');
  await expect(page.locator('#downloadBtn')).toBeDisabled();
  await page.locator('#fileInput').setInputFiles({ name: 'invalid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(page.locator('#imageList > li')).toHaveCount(0);
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#downloadBtn')).toBeEnabled();
  await page.locator('#outputWidth').fill('100');
  await expect(page.locator('#downloadBtn')).toBeDisabled();
  await page.locator('#outputWidth').fill('700');
  await expect(page.locator('#downloadBtn')).toBeEnabled();
  await page.locator('#clearAll').click();
  await expect(page.locator('#imageList > li')).toHaveCount(0);
  await expect(page.locator('#downloadBtn')).toBeDisabled();
});

test('圖片拼接：手機畫面沒有橫向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await readyWithTwoImages(page);
  await page.locator('#layoutMode').selectOption('grid');
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: innerWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.view);
});

test('圖片拼接：拖曳重新排序與移除圖片', async ({ page }) => {
  await page.goto('/tools/stitch.html');
  const image = await fs.readFile(fixture);
  await page.locator('#fileInput').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: image },
    { name: 'second.png', mimeType: 'image/png', buffer: image },
    { name: 'third.png', mimeType: 'image/png', buffer: image }
  ]);
  await expect(page.locator('#imageList > li')).toHaveCount(3);
  await expect(page.locator('#downloadBtn')).toBeEnabled();
  // A DataTransfer-backed drag sequence exercises the exact drag handlers.
  await page.evaluate(() => {
    const nodes = document.querySelectorAll('#imageList > li');
    const dataTransfer = new DataTransfer();
    nodes[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    const end = nodes[2].getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, dataTransfer, clientY: end.bottom - 2 };
    nodes[2].dispatchEvent(new DragEvent('dragover', opts));
    nodes[2].dispatchEvent(new DragEvent('drop', opts));
  });
  await expect(page.locator('#imageList > li').last()).toContainText('first.png');
  await page.getByRole('button', { name: '移除第 3 張圖片' }).click();
  await expect(page.locator('#imageList > li')).toHaveCount(2);
});
