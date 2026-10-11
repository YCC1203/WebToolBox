const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const fixture = path.join(__dirname, 'fixtures', 'sample.png');
const signature = Buffer.from('89504e470d0a1a0a', 'hex');


async function changedPixels(page, original, exported) {
  return page.evaluate(async ({ before, after }) => {
    const decode = async base64 => {
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    };
    const [a, b] = await Promise.all([decode(before), decode(after)]);
    const canvas = document.createElement('canvas');
    canvas.width = a.width;
    canvas.height = a.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(a, 0, 0);
    const first = ctx.getImageData(0, 0, a.width, a.height).data;
    ctx.clearRect(0, 0, a.width, a.height);
    ctx.drawImage(b, 0, 0);
    const second = ctx.getImageData(0, 0, a.width, a.height).data;
    let changed = 0;
    for (let i = 0; i < first.length; i += 4) {
      if (first[i] !== second[i] || first[i + 1] !== second[i + 1] ||
          first[i + 2] !== second[i + 2] || first[i + 3] !== second[i + 3]) changed++;
    }
    a.close();
    b.close();
    return changed;
  }, { before: original.toString('base64'), after: exported.toString('base64') });
}

async function getPng(page) {
  const promise = page.waitForEvent('download');
  await page.locator('#downloadWatermark').click();
  const item = await promise;
  const bytes = await fs.readFile(await item.path());
  expect(bytes.subarray(0, 8)).toEqual(signature);
  expect(bytes.length).toBeGreaterThan(100);
  expect(item.suggestedFilename()).toMatch(/-watermarked\.png$/);
  return bytes;
}

test('圖片浮水印：文字、透明度、九宮格與原尺寸 PNG 下載', async ({ page }) => {
  await page.goto('/tools/watermark.html');
  await expect(page.locator('#downloadWatermark')).toBeDisabled();
  await page.locator('#sourceFile').setInputFiles(fixture);
  await expect(page.locator('#downloadWatermark')).toBeEnabled();
  await page.locator('#watermarkText').fill('測試 WATERMARK');
  await page.locator('#opacity').fill('75');
  await page.locator('#size').fill('16');
  await page.locator('[data-pos="tl"]').click();
  await expect(page.locator('[data-pos="tl"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#opacityValue')).toHaveText('75%');
  const original = await fs.readFile(fixture);
  const exported = await getPng(page);
  // PNG IHDR keeps full original pixel dimensions, independently of preview scaling.
  expect(exported.readUInt32BE(16)).toBe(original.readUInt32BE(16));
  expect(exported.readUInt32BE(20)).toBe(original.readUInt32BE(20));
  expect(await changedPixels(page, original, exported)).toBeGreaterThan(20);
});

test('圖片浮水印：Logo 模式、即時預覽及 PNG 下載', async ({ page }) => {
  await page.goto('/tools/watermark.html');
  await page.locator('#sourceFile').setInputFiles(fixture);
  await page.locator('input[name="watermarkMode"][value="logo"]').check();
  await expect(page.locator('#downloadWatermark')).toBeDisabled();
  await page.locator('#logoFile').setInputFiles(fixture);
  await expect(page.locator('#downloadWatermark')).toBeEnabled();
  await page.locator('#size').fill('30');
  await page.locator('[data-pos="mc"]').click();
  await expect(page.locator('#previewCanvas')).toBeVisible();
  await expect(page.locator('#watermarkStatus')).toContainText('預覽已更新');
  const bytes = await getPng(page);
  expect(await changedPixels(page, await fs.readFile(fixture), bytes)).toBeGreaterThan(20);
});

test('圖片浮水印：拒絕不支援的檔案', async ({ page }) => {
  await page.goto('/tools/watermark.html');
  await page.locator('#sourceFile').setInputFiles({name:'bad.svg', mimeType:'image/svg+xml', buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')});
  await expect(page.locator('#downloadWatermark')).toBeDisabled();
  await expect(page.locator('#watermarkStatus')).toContainText('僅支援');
});


test('圖片浮水印：透明度零不應改變圖片像素', async ({ page }) => {
  await page.goto('/tools/watermark.html');
  await page.locator('#sourceFile').setInputFiles(fixture);
  await expect(page.locator('#downloadWatermark')).toBeEnabled();
  await page.locator('#opacity').fill('0');
  const bytes = await getPng(page);
  expect(await changedPixels(page, await fs.readFile(fixture), bytes)).toBe(0);
});
