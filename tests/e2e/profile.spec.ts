import { expect, test } from '@playwright/test';

test.describe('employee profile', () => {
  test('a staff member cannot browse the employee directory', async ({ page }) => {
    await page.goto('/employees');

    // Redirected home rather than shown the directory.
    await expect(page.getByRole('heading', { name: 'Kehadiran hari ini' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pekerja', exact: true })).toHaveCount(0);
  });

  test('a staff member cannot read a colleague profile through the API', async ({ page }) => {
    const other = '044e6685-328f-42e3-984b-23f36ca1ee2b';
    const response = await page.request.get(`/api/v1/employees/${other}`);
    expect(response.status()).toBe(403);
  });
});
