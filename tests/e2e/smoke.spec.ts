import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/DOAPP/i);
    await expect(page.locator('header')).toBeVisible();
  });

  test('login page loads and has form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('register page loads', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test('login card animates in', async ({ page }) => {
    await page.goto('/login');
    const card = page.locator('.animate-scaleIn').first();
    await expect(card).toBeVisible();
  });

  test('navigation links work', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/login"]');
    await expect(page).toHaveURL(/login/);
  });
});
