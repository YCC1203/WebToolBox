const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs/promises');
const fixture = path.join(__dirname, 'fixtures', 'sample.png');

async function downloadBytes(page) {
  const itemPromise = page.waitForEvent('download', { timeout: 20000 });
  await page.locator('#downloadBtn').click();
  const item = await itemPromise;
  return { name: item.suggestedFilename(), bytes: await fs.readFile(await item.path()) };
}
async function uploadTwo(page) {
  await page.goto('/tools/composer.html');
  await page.locator('#imageFiles').setInputFiles([fixture, fixture]);
  await expect(page.locator('#layerList > li')).toHaveCount(2);
  await expect(page.locator('#downloadBtn')).toBeEnabled();
}

test('圖片合成：雙圖圖層、縮放、旋轉與原尺寸 PNG 下載', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await uploadTwo(page);
  await page.locator('#layerScale').fill('145');
  await page.locator('#rotation').fill('30');
  await page.locator('#layerOpacity').fill('75');
  await page.locator('#posX').fill('340');
  await page.locator('#posX').press('Tab');
  const { name, bytes } = await downloadBytes(page);
  expect(name).toBe('WebToolbox-Composer.png');
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(800);
  expect(bytes.length).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test('圖片合成：新增文字、復原重做、排序與刪除圖層', async ({ page }) => {
  await uploadTwo(page);
  await page.locator('#addTextBtn').click();
  await expect(page.locator('#layerList > li')).toHaveCount(3);
  await page.locator('#textValue').fill('測試合成文字');
  await page.locator('#textValue').press('Tab');
  await page.locator('#undoBtn').click();
  await expect(page.locator('#textValue')).toHaveValue('合成文字');
  await page.locator('#redoBtn').click();
  await expect(page.locator('#textValue')).toHaveValue('測試合成文字');
  await page.locator('#layerList > li').first().getByRole('button', { name: /^下移/ }).click();
  await page.locator('#layerList > li').first().getByRole('button', { name: /^移除/ }).click();
  await expect(page.locator('#layerList > li')).toHaveCount(2);
  await page.locator('#undoBtn').click();
  await expect(page.locator('#layerList > li')).toHaveCount(3);
});

test('圖片合成：拖曳移動圖層', async ({ page }) => {
  await page.goto('/tools/composer.html');
  await page.locator('#imageFiles').setInputFiles(fixture);
  await expect(page.locator('#layerList > li')).toHaveCount(1);
  const canvas = page.locator('#editorCanvas');
  await canvas.scrollIntoViewIfNeeded();
  const rect = await canvas.boundingBox();
  const initial = Number(await page.locator('#posX').inputValue());
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + Math.min(35, rect.width / 8), cy + 10, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.locator('#posX').inputValue())).toBeGreaterThan(initial);
});

test('圖片合成：透明 PNG 與白底 JPG、WebP 正確匯出', async ({ page }) => {
  await page.goto('/tools/composer.html');
  await page.locator('#addTextBtn').click();
  await page.locator('#transparentBg').check();
  const png = await downloadBytes(page);
  expect(png.name).toMatch(/\.png$/);
  const corner = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const context = c.getContext('2d'); context.drawImage(bmp, 0, 0);
    const pixel = [...context.getImageData(0, 0, 1, 1).data];
    bmp.close(); return pixel;
  }, png.bytes.toString('base64'));
  expect(corner[3]).toBe(0);
  await page.locator('#outputFormat').selectOption('image/jpeg');
  const jpg = await downloadBytes(page);
  expect(jpg.name).toMatch(/\.jpg$/);
  expect(jpg.bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
  await page.locator('#outputFormat').selectOption('image/webp');
  const webp = await downloadBytes(page);
  expect(webp.name).toMatch(/\.webp$/);
  expect(webp.bytes.subarray(0, 4).toString()).toBe('RIFF');
});

test('圖片合成：拒絕 SVG、限制畫布尺寸、手機頁面無溢出', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 730 });
  await page.goto('/tools/composer.html');
  await page.locator('#imageFiles').setInputFiles({
    name: 'not-allowed.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
  });
  await expect(page.locator('#layerList > li')).toHaveCount(0);
  await expect(page.locator('#composerStatus')).toContainText('僅支援');
  await page.locator('#canvasWidth').fill('5001');
  await page.locator('#canvasWidth').press('Tab');
  await expect(page.locator('#canvasWidth')).toHaveValue('1200');
  await expect(page.locator('#canvasHeight')).toHaveValue('800');
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.screen + 2);
});

test('圖片合成：完全透明的上層不阻擋點選下層', async ({ page }) => {
  await uploadTwo(page);
  // 匯入順序為底層、頂層，預設選取最上層。
  await expect(page.locator('#layerList > li').first()).toHaveClass(/is-selected/);
  await page.locator('#layerOpacity').fill('0');
  await page.locator('#layerOpacity').dispatchEvent('change');
  const canvas = page.locator('#editorCanvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator('#layerList > li').last()).toHaveClass(/is-selected/);
  // 透明上層仍然存在，使用者可在圖層清單重新選取並調整。
  await expect(page.locator('#layerList > li')).toHaveCount(2);
  await page.locator('#layerList > li').first().getByRole('button', { name: /^選取/ }).click();
  await expect(page.locator('#layerOpacity')).toHaveValue('0');
});
