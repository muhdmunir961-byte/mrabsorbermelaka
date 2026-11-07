import { expect, test } from '@playwright/test';

const DEMO_PHONE = '+60123456789';

test('a mechanic signs in with an OTP and sees their shift', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Selamat Kembali!' })).toBeVisible();

  // The demo phone link fills the field, so the test never hard-codes the value twice.
  await page.getByRole('button', { name: DEMO_PHONE }).click();
  await page.getByRole('button', { name: 'Hantar OTP' }).click();

  const notice = page.getByText('Mod pembangunan');
  await expect(notice).toBeVisible();
  const code = (await notice.textContent())?.match(/\d{6}/)?.[0];
  expect(code, 'the development OTP should be shown in the notice').toBeTruthy();

  await page.getByLabel('Kod OTP').fill(code ?? '');
  await page.getByRole('button', { name: 'Masuk' }).click();

  await expect(page.getByRole('heading', { name: 'Ahmad Firdaus bin Ramli' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kehadiran hari ini' })).toBeVisible();
});

test('an anonymous visitor is sent to the login screen', async ({ page }) => {
  await page.goto('/operations');

  await expect(page.getByRole('heading', { name: 'Selamat Kembali!' })).toBeVisible();
  await expect(page.getByLabel('Nombor Telefon')).toBeVisible();
});

test('the login screen does not overflow a narrow viewport', async ({ page }) => {
  await page.goto('/');

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );

  expect(overflows).toBe(false);
});
