import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countLeaveDays, hasEnoughBalance, rangesOverlap, remainingLeaveDays } from './rules.js';

describe('countLeaveDays', () => {
  it('counts a single day as one', () => {
    assert.equal(countLeaveDays('2026-11-07', '2026-11-07'), 1);
  });

  it('counts both ends of a multi-day range', () => {
    assert.equal(countLeaveDays('2026-11-07', '2026-11-09'), 3);
  });

  it('spans a month boundary', () => {
    assert.equal(countLeaveDays('2026-10-31', '2026-11-02'), 3);
  });

  it('returns zero when the end precedes the start', () => {
    assert.equal(countLeaveDays('2026-11-09', '2026-11-07'), 0);
  });

  it('returns zero for unparseable input', () => {
    assert.equal(countLeaveDays('nonsense', '2026-11-07'), 0);
  });
});

describe('remainingLeaveDays', () => {
  it('subtracts used and pending days', () => {
    assert.equal(remainingLeaveDays({ entitlementDays: 21, usedDays: 9, pendingDays: 2 }), 10);
  });

  it('can go negative when more was booked than granted', () => {
    assert.equal(remainingLeaveDays({ entitlementDays: 5, usedDays: 5, pendingDays: 3 }), -3);
  });
});

describe('hasEnoughBalance', () => {
  const balance = { entitlementDays: 21, usedDays: 9, pendingDays: 0 };

  it('allows an annual request that fits', () => {
    assert.equal(hasEnoughBalance(balance, 12, 'ANNUAL'), true);
  });

  it('rejects an annual request that does not fit', () => {
    assert.equal(hasEnoughBalance(balance, 13, 'ANNUAL'), false);
  });

  it('never blocks a type that does not draw the entitlement', () => {
    assert.equal(hasEnoughBalance(balance, 40, 'UNPAID'), true);
  });
});

describe('rangesOverlap', () => {
  it('detects a shared day', () => {
    assert.equal(rangesOverlap('2026-11-01', '2026-11-03', '2026-11-03', '2026-11-05'), true);
  });

  it('treats back-to-back ranges as separate', () => {
    assert.equal(rangesOverlap('2026-11-01', '2026-11-03', '2026-11-04', '2026-11-05'), false);
  });

  it('detects full containment', () => {
    assert.equal(rangesOverlap('2026-11-01', '2026-11-30', '2026-11-10', '2026-11-12'), true);
  });
});
