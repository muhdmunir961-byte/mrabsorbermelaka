import { expect, test } from '@playwright/test';

test('fixture page renders a single main heading', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Workspace fixture');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Workspace fixture');
  await expect(page.getByRole('link', { name: 'Source' })).toHaveAttribute(
    'href',
    'https://example.com',
  );
});

test('layout does not overflow the viewport', async ({ page }) => {
  await page.goto('/');

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );

  expect(overflows).toBe(false);
});
