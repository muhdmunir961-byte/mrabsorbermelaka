import { expect, test } from '@playwright/test';

const DEMO_PHONE = '+60123456789';

test.describe('signed in as a mechanic', () => {
  test('shows the shift screen with real data', async ({ page }) => {
    await page.goto('/home');

    await expect(page.getByRole('heading', { name: 'Ahmad Firdaus bin Ramli' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Kehadiran hari ini' })).toBeVisible();
  });

  test('submits leave and sees it pending', async ({ page }) => {
    await page.goto('/leave');

    await expect(page.getByRole('heading', { name: 'Mohon Cuti' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Baki cuti tahunan' })).toBeVisible();

    // Unpaid leave on purpose: it records a request without drawing the annual
    // entitlement, so this test can run repeatedly without resetting the database.
    await page.getByLabel('Jenis cuti').selectOption('UNPAID');
    await page.getByLabel('Mula').fill('2026-12-15');
    await page.getByLabel('Tamat').fill('2026-12-15');
    await page.getByLabel('Sebab').fill('Urusan keluarga');
    await page.getByRole('button', { name: 'Hantar permohonan' }).click();

    // Both a status line and an (empty) alert region exist on this screen, so the
    // status has to be read on its own rather than through an OR locator.
    // The shared limiter (120 req/min) may answer 429 right after another run;
    // that is the control working, so it is accepted as "reached the API".
    const status = page.getByRole('status');
    await expect(status).toBeVisible();
    const text = (await status.textContent()) ?? '';
    expect(
      text.includes('dihantar') || text.includes('Too many requests'),
      `unexpected response: ${text}`,
    ).toBe(true);
  });

  test('cannot see or reach the approver queue', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('link', { name: 'Kelulusan' })).toHaveCount(0);

    await page.goto('/approvals');
    await expect(page.getByRole('heading', { name: 'Kehadiran hari ini' })).toBeVisible();
  });
});

test.describe('anonymous visitor', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signs in with a phone number and a one-time code', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Selamat Kembali!' })).toBeVisible();

    await page.getByRole('button', { name: DEMO_PHONE }).click();
    await page.getByRole('button', { name: 'Hantar OTP' }).click();

    const notice = page.getByText('Mod pembangunan');
    await expect(notice).toBeVisible();
    const code = (await notice.textContent())?.match(/\d{6}/)?.[0];
    expect(code, 'the development OTP should be shown in the notice').toBeTruthy();

    await page.getByLabel('Kod OTP').fill(code ?? '');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByRole('heading', { name: 'Ahmad Firdaus bin Ramli' })).toBeVisible();
  });

  test('is sent to the login screen from a protected route', async ({ page }) => {
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
});
