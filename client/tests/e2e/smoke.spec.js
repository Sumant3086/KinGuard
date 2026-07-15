import { test, expect } from '@playwright/test';

test.describe('Login flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('login page renders brand and role cards', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'Sign In' })).toBeVisible();
    // Target the brand name span inside the left-panel header specifically
    await expect(page.locator('.lr-header span').first()).toContainText('KinMarché');
    await expect(page.locator('.lr-role-desc').nth(0)).toContainText('Admin');
    await expect(page.locator('.lr-role-desc').nth(1)).toContainText('Area Manager');
    await expect(page.locator('.lr-role-desc').nth(2)).toContainText('Store Manager');
  });

  test('shows error on wrong credentials', async ({ page }) => {
    await page.fill('#login-employee-id', 'WRONG_ID');
    await page.fill('#login-password', 'WrongPass1!');
    await page.click('button[type="submit"]');
    await expect(page.locator('.lr-error')).toBeVisible({ timeout: 10_000 });
    const errText = await page.locator('.lr-error').innerText();
    expect(errText.length).toBeGreaterThan(0);
  });

  test('employee id field is auto-focused', async ({ page }) => {
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe('login-employee-id');
  });

  test('password visibility toggle works', async ({ page }) => {
    await page.fill('#login-password', 'TestPass1!');
    const pwInput = page.locator('#login-password');
    expect(await pwInput.getAttribute('type')).toBe('password');
    await page.click('.lr-pw-eye');
    expect(await pwInput.getAttribute('type')).toBe('text');
    await page.click('.lr-pw-eye');
    expect(await pwInput.getAttribute('type')).toBe('password');
  });

  test('back to home link navigates to home', async ({ page }) => {
    await page.click('text=Back to Home');
    await expect(page).toHaveURL('/');
  });
});

test.describe('Home page', () => {
  test('renders and has sign-in link', async ({ page }) => {
    await page.goto('/');
    // Use the specific logo-name class to avoid matching footer copies
    await expect(page.locator('.home-logo-name')).toBeVisible();
    const signInLink = page.locator('a', { hasText: /sign.?in/i }).first();
    await expect(signInLink).toBeVisible();
  });
});

test.describe('404 page', () => {
  test('unknown routes show not-found state', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).toMatch(/not found|404|page not found/);
  });
});
