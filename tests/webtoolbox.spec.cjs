const { test, expect } = require('@playwright/test');

const pages = [
  ['首頁', '/index.html', '#toolsGrid'],
  ['QR Code', '/tools/qr.html', '#qrText'],
  ['密碼', '/tools/password.html', '#generatePassword'],
  ['文字', '/tools/text.html', '#textInput'],
  ['JSON', '/tools/json.html', '#jsonInput'],
  ['尺寸', '/tools/resize.html', '#fileInput'],
  ['轉檔', '/tools/convert.html', '#fileInput'],
  ['壓縮', '/tools/compress.html', '#fileInput'],
  ['PDF', '/tools/pdf.html', '#fileInput'],
];

for (const [name, url, selector] of pages) {
  test(`${name}頁面正常載入，沒有腳本或 CSP/SRI 錯誤`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`JavaScript: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error' && /content security policy|integrity|digest|refused to load|refused to execute/i.test(message.text())) {
        errors.push(`Console: ${message.text()}`);
      }
    });
    const response = await page.goto(url, { waitUntil: 'load' });
    expect(response.status()).toBe(200);
    await expect(page.locator(selector)).toBeAttached();
    // Give deferred scripts and CDN loading failures time to surface.
    await page.waitForTimeout(700);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('首頁顯示八個工具，搜尋及導航正常', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#toolsGrid .tool-card')).toHaveCount(8);
  await page.locator('#searchInput').fill('JSON');
  await expect(page.locator('#toolsGrid .tool-card')).toHaveCount(1);
  await page.locator('#searchInput').fill('');
  await page.getByRole('button', { name: 'JSON 格式化，立即使用' }).click();
  await expect(page).toHaveURL(/\/tools\/json\.html$/);
});

test('密碼產生器可以產生隨機密碼', async ({ page }) => {
  await page.goto('/tools/password.html');
  await page.locator('#generatePassword').click();
  const password = await page.locator('#passwordResult').innerText();
  expect(password.trim().length).toBeGreaterThanOrEqual(8);
  expect(password).not.toContain('準備產生密碼');
});

test('文字處理器可以統計字元', async ({ page }) => {
  await page.goto('/tools/text.html');
  await page.locator('#textInput').fill('ABC 測試');
  await expect(page.locator('#totalChars')).toContainText('6');
});

test('JSON 格式化工具可以處理有效 JSON', async ({ page }) => {
  await page.goto('/tools/json.html');
  await page.locator('#jsonInput').fill('{"hello":1}');
  await page.locator('#formatBtn').click();
  await expect(page.locator('#jsonOutput')).toHaveValue(/"hello"\s*:\s*1/);
});
