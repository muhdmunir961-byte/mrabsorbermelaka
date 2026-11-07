import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  blindIndex,
  decryptField,
  decryptSen,
  encryptField,
  encryptSen,
  normaliseForIndex,
} from './field.js';

describe('encryptField', () => {
  it('round-trips a value unchanged', () => {
    const plain = '920412-04-5541';
    assert.equal(decryptField(encryptField(plain)), plain);
  });

  it('produces a different ciphertext each time for the same input', () => {
    const a = encryptField('No. 24, Jalan Kenanga');
    const b = encryptField('No. 24, Jalan Kenanga');
    assert.notEqual(a, b);
    assert.equal(decryptField(a), decryptField(b));
  });

  it('rejects a tampered ciphertext instead of returning garbage', () => {
    const parts = encryptField('secret').split(':');
    const body = Buffer.from(parts[3] ?? '', 'base64');
    body[0] = (body[0] ?? 0) ^ 0xff;
    parts[3] = body.toString('base64');
    assert.throws(() => decryptField(parts.join(':')));
  });

  it('rejects an unknown format', () => {
    assert.throws(() => decryptField('plaintext-value'), /Unrecognised ciphertext/);
  });
});

describe('blindIndex', () => {
  it('is stable across formatting differences', () => {
    assert.equal(blindIndex('920412-04-5541'), blindIndex('920412 04 5541'));
  });

  it('differs for different values', () => {
    assert.notEqual(blindIndex('920412-04-5541'), blindIndex('920412-04-5542'));
  });

  it('does not contain the original value', () => {
    assert.equal(blindIndex('920412-04-5541').includes('920412'), false);
  });
});

describe('normaliseForIndex', () => {
  it('strips punctuation and casing', () => {
    assert.equal(normaliseForIndex(' 920412-04-5541 '), '920412045541');
  });
});

describe('money', () => {
  it('round-trips sen as an integer', () => {
    assert.equal(decryptSen(encryptSen(250000)), 250000);
  });

  it('refuses a non-integer amount', () => {
    assert.throws(() => encryptSen(2500.5), /integer/);
  });
});
