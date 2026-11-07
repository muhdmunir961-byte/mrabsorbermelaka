import { expect, test as setup } from '@playwright/test';

export const STAFF_STATE = 'tests/.auth/staff.json';

const DEMO_PHONE = '+60123456789';

/**
 * Signs in once for the whole run and saves the session cookie.
 *
 * Doing this per test would hit the real OTP rate limit (5 requests per 5
 * minutes per IP), which is a control we want to keep, not weaken for tests.
 */
setup('authenticate as staff', async ({ request }) => {
  const requested = await request.post('/api/v1/auth/otp/request', {
    data: { phone: DEMO_PHONE },
  });
  expect(requested.ok()).toBeTruthy();

  const { devCode } = (await requested.json()) as { devCode?: string };
  expect(devCode, 'the development OTP must be returned outside production').toBeTruthy();

  const verified = await request.post('/api/v1/auth/otp/verify', {
    data: { phone: DEMO_PHONE, code: devCode },
  });
  expect(verified.ok()).toBeTruthy();

  await request.storageState({ path: STAFF_STATE });
});
