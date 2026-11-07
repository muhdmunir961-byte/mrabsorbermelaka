/**
 * Pure leave arithmetic. No database, no framework, so it can be unit tested
 * directly and reused by both the API and any future client.
 */

export interface BalanceLike {
  entitlementDays: number;
  usedDays: number;
  pendingDays: number;
}

export { countLeaveDays } from '@mr/shared';

/** Days still available: entitlement minus what is used and what is awaiting a decision. */
export function remainingLeaveDays(balance: BalanceLike): number {
  return balance.entitlementDays - balance.usedDays - balance.pendingDays;
}

/**
 * Annual leave is the only type that draws down the yearly entitlement.
 * Unpaid, emergency, maternity and medical leave are recorded but not balanced
 * against it, which is why the reference screen shows a single annual figure.
 */
export function consumesEntitlement(type: string): boolean {
  return type === 'ANNUAL';
}

export function hasEnoughBalance(
  balance: BalanceLike,
  requestedDays: number,
  type: string,
): boolean {
  if (!consumesEntitlement(type)) return true;
  return remainingLeaveDays(balance) >= requestedDays;
}

/** Two inclusive date ranges overlap when neither ends before the other starts. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

export function toDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}
