const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs/promises');

const fixture = path.join(__dirname, 'fixtures', 'sample.png');
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

async function downloaded(page, click) {
  const promise = page.waitForEvent('download', { timeout: 20000 });
  await click();
  const download = await promise;
  const file = await download.path();
  const bytes = await fs.readFile(file);
  expect(bytes.length).toBeGreaterThan(80);
  return { name: download.suggestedFilename(), bytes };
}
function isZip(bytes) { expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50,0x4b,0x03,0x04])); }
function isPdf(bytes) { expect(bytes.subarray(0, 5).toString()).toBe('%PDF-'); }

// A single illustrative QR code: actual PNG file download, not just button enabled.
test('QR Code 產生及 PNG 下載', async ({ page }) => {
  await page.goto('/tools/qr.html');
  await page.locator('#qrText').fill('https://example.com');
  await page.locator('#generateBtn').click();
  await expect(page.locator('#downloadBtn')).toBeEnabled();
  const { name, bytes } = await downloaded(page, () => page.locator('#downloadBtn').click());
  expect(name).toMatch(/\.png$/i);
  expect(bytes.subarray(0, 8)).toEqual(pngSignature);
});

for (const item of [
  { title: '圖片尺寸調整', url: '/tools/resize.html', start: '#processBtn', zip: 'WebToolbox-Resized-Images.zip', format: null },
  { title: '圖片格式轉換', url: '/tools/convert.html', start: '#convertBtn', zip: 'WebToolbox-Converted-Images.zip', format: 'image/webp' },
  { title: '圖片壓縮', url: '/tools/compress.html', start: '#compressBtn', zip: 'WebToolbox-Compressed-Images.zip', format: null },
]) {
  test(`${item.title}：實際處理圖片並下載 ZIP`, async ({ page }) => {
    await page.goto(item.url);
    await page.locator('#fileInput').setInputFiles(fixture);
    await expect(page.locator(item.start)).toBeEnabled();
    if (item.format) await page.locator('#outputFormat').selectOption(item.format);
    if (item.title === '圖片尺寸調整') {
      await page.locator('#targetWidth').fill('160');
    }
    await page.locator(item.start).click();
    await expect(page.locator('#downloadAll')).toBeEnabled({ timeout: 20000 });
    const { name, bytes } = await downloaded(page, () => page.locator('#downloadAll').click());
    expect(name).toBe(item.zip);
    isZip(bytes);
    // Confirm ZIP contains at least one file through its central-directory signature.
    expect(bytes.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02]))).toBe(true);
  });
}

// Create deterministic valid PDFs via pdf-lib already loaded by the tool itself.
async function samplePdf(page, label, pageCount = 1) {
  const data = await page.evaluate(async ({ label, pageCount }) => {
    const doc = await PDFLib.PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
      const pg = doc.addPage([320, 240]);
      pg.drawText(`${label}-${i + 1}`, { x: 20, y: 180, size: 20 });
    }
    return Array.from(await doc.save());
  }, { label, pageCount });
  return { name: `${label}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(data) };
}

async function pdfPageCount(page, bytes) {
  return page.evaluate(async data => {
    const doc = await PDFLib.PDFDocument.load(new Uint8Array(data));
    return doc.getPageCount();
  }, Array.from(bytes));
}

test('PDF：合併兩份 PDF，確認輸出兩頁', async ({ page }) => {
  await page.goto('/tools/pdf.html');
  const a = await samplePdf(page, 'A');
  const b = await samplePdf(page, 'B');
  await page.locator('#fileInput').setInputFiles([a, b]);
  await expect(page.locator('#exportAll')).toBeEnabled({ timeout: 12000 });
  const { bytes, name } = await downloaded(page, () => page.locator('#exportAll').click());
  expect(name).toMatch(/\.pdf$/);
  isPdf(bytes);
  expect(await pdfPageCount(page, bytes)).toBe(2);
});

test('PDF：擷取指定頁面，確認只有一頁', async ({ page }) => {
  await page.goto('/tools/pdf.html');
  await page.locator('#fileInput').setInputFiles(await samplePdf(page, 'Range', 3));
  await expect(page.locator('#exportRange')).toBeEnabled({ timeout: 12000 });
  await page.locator('#pageRange').fill('2');
  const { bytes } = await downloaded(page, () => page.locator('#exportRange').click());
  isPdf(bytes);
  expect(await pdfPageCount(page, bytes)).toBe(1);
});

test('PDF：分割 PDF 並下載 ZIP', async ({ page }) => {
  await page.goto('/tools/pdf.html');
  await page.locator('#fileInput').setInputFiles(await samplePdf(page, 'Split', 2));
  await expect(page.locator('#splitAll')).toBeEnabled({ timeout: 12000 });
  const { name, bytes } = await downloaded(page, () => page.locator('#splitAll').click());
  expect(name).toBe('WebToolbox-Split-Pages.zip');
  isZip(bytes);
  expect(bytes.includes(Buffer.from('page-001.pdf'))).toBe(true);
  expect(bytes.includes(Buffer.from('page-002.pdf'))).toBe(true);
});
