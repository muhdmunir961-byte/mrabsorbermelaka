import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { env } from '../env.js';

/**
 * Field-level encryption for personal data at rest.
 *
 * AES-256-GCM gives confidentiality plus tamper detection, and a random IV per
 * value means two employees with the same IC do not produce the same ciphertext.
 * Equality lookups cannot work on randomised ciphertext, so those go through a
 * deterministic HMAC "blind index" with a separate key.
 *
 * Stored format: v1:<iv b64>:<auth tag b64>:<ciphertext b64>
 */
const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;

const encryptionKey = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'base64');
const indexKey = Buffer.from(env.FIELD_INDEX_KEY, 'utf8');

export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptField(stored: string): string {
  const parts = stored.split(':');
  const [version, iv, tag, ciphertext] = parts;
  if (parts.length !== 4 || version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Unrecognised ciphertext format');
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Case and punctuation do not change identity, so they must not change the index. */
export function normaliseForIndex(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Deterministic lookup key. Never reversible, and useless without the index key. */
export function blindIndex(value: string): string {
  return createHmac('sha256', indexKey).update(normaliseForIndex(value)).digest('hex');
}

/** Money is stored as sen, so the encrypted payload is just the integer as text. */
export function encryptSen(sen: number): string {
  if (!Number.isInteger(sen)) throw new Error('Money must be an integer number of sen');
  return encryptField(String(sen));
}

export function decryptSen(stored: string): number {
  const value = Number(decryptField(stored));
  if (!Number.isInteger(value)) throw new Error('Decrypted money was not an integer');
  return value;
}
