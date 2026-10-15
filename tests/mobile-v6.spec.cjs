'use strict';
const { test, expect } = require('@playwright/test');
const path = require('node:path');

const sampleImage = path.join(__dirname, 'fixtures', 'sample.png');
const pages = [
  ['首頁', '/index.html'],
  ['QR Code', '/tools/qr.html'],
  ['密碼', '/tools/password.html'],
  ['文字', '/tools/text.html'],
  ['JSON', '/tools/json.html'],
  ['圖片尺寸', '/tools/resize.html'],
  ['圖片轉檔', '/tools/convert.html'],
  ['圖片壓縮', '/tools/compress.html'],
  ['圖片裁切', '/tools/crop.html'],
  ['浮水印', '/tools/watermark.html'],
  ['圖片拼接', '/tools/stitch.html'],
  ['PDF', '/tools/pdf.html'],
];

async function assertNoPageOverflow(page, name) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, `${name}: ${JSON.stringify(dimensions)}`)
    .toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, `${name}: ${JSON.stringify(dimensions)}`)
    .toBeLessThanOrEqual(dimensions.viewport + 1);
}

for (const [name, url] of pages) {
  test(`${name}：390px 手機版無橫向溢出`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(url, { waitUntil: 'load' });
    expect(response.status()).toBe(200);
    await assertNoPageOverflow(page, name);
  });
}

for (const [name, url] of [
  ['首頁', '/index.html'],
  ['圖片裁切', '/tools/crop.html'],
  ['浮水印', '/tools/watermark.html'],
  ['圖片拼接', '/tools/stitch.html'],
  ['PDF', '/tools/pdf.html'],
]) {
  test(`${name}：320px 窄螢幕無橫向溢出`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(url);
    await assertNoPageOverflow(page, name);
  });
}

test('圖片拼接：手機排序按鈕尺寸與操作正常', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/tools/stitch.html');
  await page.locator('#fileInput').setInputFiles([sampleImage, sampleImage]);
  const items = page.locator('#imageList > li');
  await expect(items).toHaveCount(2);
  const buttons = items.first().locator('.stitch-file-actions button');
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: '上移第 2 張圖片' }).click();
  await expect(items).toHaveCount(2);
  await assertNoPageOverflow(page, '已上傳的圖片拼接頁');
});

test('浮水印：九宮格手機觸控區域與切換正常', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/tools/watermark.html');
  const buttons = page.locator('.watermark-positions button');
  await expect(buttons).toHaveCount(9);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(48);
  }
  await buttons.first().click();
  await expect(buttons.first()).toHaveAttribute('aria-pressed', 'true');
});

test('圖片裁切：手機控制項有足夠觸控高度', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/tools/crop.html');
  for (const selector of ['#ratio', '#rotateLeft', '#rotateRight', '#reset', '#download']) {
    const box = await page.locator(selector).boundingBox();
    expect(box, selector).not.toBeNull();
    expect(box.height, selector).toBeGreaterThanOrEqual(44);
  }
});

test('PDF：手機頁面排序按鈕尺寸正常', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/tools/pdf.html');
  const content = await page.evaluate(async () => {
    const pdf = await PDFLib.PDFDocument.create();
    pdf.addPage([320, 240]);
    return Array.from(await pdf.save());
  });
  await page.locator('#fileInput').setInputFiles({
    name: 'mobile-test.pdf', mimeType: 'application/pdf', buffer: Buffer.from(content),
  });
  const buttons = page.locator('.pdf-page-controls button');
  await expect(buttons.first()).toBeVisible();
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await assertNoPageOverflow(page, '已匯入 PDF 的手機頁');
});
