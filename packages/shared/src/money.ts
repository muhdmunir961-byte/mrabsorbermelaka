import { z } from 'zod';

/**
 * Money is an integer count of sen (1 RM = 100 sen). Floats are never used for
 * currency: 0.1 + 0.2 would otherwise corrupt a payslip.
 */
export const Sen = z.int().nonnegative();
export type Sen = z.infer<typeof Sen>;

export function formatRinggit(sen: number, withDecimals = true): string {
  const sign = sen < 0 ? '-' : '';
  const abs = Math.abs(sen);
  const ringgit = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = ringgit.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return withDecimals
    ? `${sign}RM ${grouped}.${cents.toString().padStart(2, '0')}`
    : `${sign}RM ${grouped}`;
}
