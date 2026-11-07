import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 64;
const SALT_LEN = 16;

/**
 * PIN storage: scrypt from Node's standard library. No dependency, and a slow
 * KDF means a leaked hash is not a lookup table away from the PIN.
 * Format: scrypt$<saltHex>$<keyHex>
 */
export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(pin, salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
