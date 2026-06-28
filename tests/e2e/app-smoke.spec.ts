import { test, expect } from '@playwright/test';

/**
 * Safe, read-only smoke coverage across the app.
 * For each public route we assert the SPA mounted (#root not empty) and that no
 * uncaught JS error fired — this catches white-screens like the module-scope
 * useContext crash. No data is mutated and no credentials are used.
 */

// SPA (React-router) public routes only. NOTE: /legal/* is served by the backend
// as a static document (not the SPA), so it's intentionally excluded here.
const publicRoutes = [
  '/',
  '/login',
  '/register',
  '/blog',
  '/help',
  '/contact',
];

for (const route of publicRoutes) {
  test(`public route loads without JS errors: ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(route, { waitUntil: 'networkidle' });

    // SPA mounted (no white-screen)
    await expect(page.locator('#root')).not.toBeEmpty();
    // No uncaught JS exceptions
    expect(errors, `Uncaught JS error(s) on ${route}:\n${errors.join('\n')}`).toEqual([]);
  });
}

test.describe('Protected routes redirect to login when unauthenticated', () => {
  for (const route of ['/pro/finanzas', '/pro/usage', '/balance', '/settings']) {
    test(`redirects ${route} -> /login`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test.describe('Spanish localization (no raw i18n keys / English leakage on key pages)', () => {
  test('help center renders Spanish, not raw keys', async ({ page }) => {
    await page.goto('/help', { waitUntil: 'networkidle' });
    const body = await page.locator('#root').innerText();
    // No untranslated i18n keys leaking to the UI (e.g. "help.title")
    expect(body).not.toMatch(/\b(help|contact|common|jobs)\.[a-zA-Z]+\b/);
  });

  test('contact page renders Spanish title', async ({ page }) => {
    await page.goto('/contact', { waitUntil: 'networkidle' });
    await expect(page.locator('#root')).toContainText(/Contactanos|Contacto/i);
  });
});
