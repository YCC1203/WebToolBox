const { test, expect } = require('@playwright/test');
const path = require('node:path');

const fixture = path.join(__dirname, 'fixtures', 'sample.png');

test('圖片壓縮完成後顯示成功訊息及耗時，且沒有 JavaScript 錯誤', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/tools/compress.html');
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#compressBtn')).toBeEnabled();
  await page.locator('#compressBtn').click();

  await expect(page.locator('#status')).toContainText('完成：成功 1 張，失敗 0 張。', {
    timeout: 20000,
  });
  await expect(page.locator('#status')).toContainText(/耗時 \d+\.\d+ 秒/);
  await expect(page.locator('#downloadAll')).toBeEnabled();
  expect(errors).toEqual([]);
});
