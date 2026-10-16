const { test, expect } = require('@playwright/test');

test('共用通知容器不應在通用 div 使用 aria-label', async ({ page }) => {
  await page.goto('/index.html');
  const container = page.locator('#wt-toast-container');
  await expect(container).toHaveCount(1);
  await expect(container).not.toHaveAttribute('aria-label');
  await expect(container).not.toHaveAttribute('role');
});

test('共用通知保留正確的狀態／警示角色與可操作的關閉按鈕', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => {
    WebToolboxNotify.success('操作成功測試');
    WebToolboxNotify.error('操作失敗測試');
  });
  const notifications = page.locator('#wt-toast-container');
  await expect(notifications.locator('[role="status"]')).toContainText('操作成功測試');
  await expect(notifications.locator('[role="alert"]')).toContainText('操作失敗測試');
  await notifications.locator('[role="status"]').getByRole('button', { name: '關閉通知' }).click();
  await expect(notifications.locator('[role="status"]')).toHaveCount(0);
  await expect(notifications.locator('[role="alert"]')).toHaveCount(1);
});
