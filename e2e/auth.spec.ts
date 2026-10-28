import { test, expect, type Page } from '@playwright/test';

const TEST_PASSWORD = 'Test1234';

async function registerUser(page: Page, email: string) {
  await page.getByTestId('tab-register').click();
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-username').fill('测试用户');
  await page.getByTestId('input-password').fill(TEST_PASSWORD);
  await page.getByTestId('input-confirm').fill(TEST_PASSWORD);
  await page.getByTestId('agree-terms').click();
  await page.getByTestId('submit-register').click();
  await page.waitForURL('**/connections', { timeout: 10000 });
}

async function loginUser(page: Page, email: string, password: string) {
  await page.getByTestId('tab-login').click();
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('submit-login').click();
}

test.describe('用户认证流程', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in');
  });

  test('用户注册成功', async ({ page }) => {
    await registerUser(page, `reg_${Date.now()}@example.com`);
    await expect(page.getByText('连接列表')).toBeVisible();
  });

  test('用户登录成功', async ({ page }) => {
    const email = `login_${Date.now()}@example.com`;
    await registerUser(page, email);

    // 退出后重新登录，保证用例自包含
    await page.goto('/');
    await page.getByText('退出登录').click();
    await page.getByRole('button', { name: '退出' }).click();
    await page.waitForURL('**/sign-in');

    await loginUser(page, email, TEST_PASSWORD);
    await page.waitForURL('**/connections', { timeout: 10000 });
    await expect(page.getByText('连接列表')).toBeVisible();
  });

  test('用户登出成功', async ({ page }) => {
    await registerUser(page, `logout_${Date.now()}@example.com`);

    await page.getByText('退出登录').click();
    await page.getByRole('button', { name: '退出' }).click();

    await page.waitForURL('**/sign-in', { timeout: 10000 });
    await expect(page.getByTestId('tab-login')).toBeVisible();
  });

  test('注册时密码强度校验', async ({ page }) => {
    await page.getByTestId('tab-register').click();
    await page.getByTestId('input-email').fill(`weak_${Date.now()}@example.com`);
    await page.getByTestId('input-password').fill('123456');
    await page.getByTestId('input-confirm').fill('123456');
    await page.getByTestId('agree-terms').click();
    await page.getByTestId('submit-register').click();

    await expect(page.getByTestId('auth-error')).toContainText('密码');
  });

  test('登录失败提示', async ({ page }) => {
    await loginUser(page, `nobody_${Date.now()}@example.com`, 'WrongPassword123');

    await expect(page.getByTestId('auth-error')).toBeVisible({ timeout: 10000 });
  });
});
