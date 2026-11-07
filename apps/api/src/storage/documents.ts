import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { env } from '../env.js';

/**
 * Storage abstraction. The local driver keeps uploads inside one directory; a
 * production deployment swaps in object storage without touching callers.
 */
export interface DocumentStorage {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const root = resolve(env.UPLOAD_DIR);

/** Reject any key that could escape the upload root. */
function safePath(key: string): string {
  const target = join(root, key);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error('Storage key escapes the upload root');
  }
  return target;
}

export const localStorage: DocumentStorage = {
  async put(key, body) {
    const target = safePath(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  },
  get(key) {
    return readFile(safePath(key));
  },
  async remove(key) {
    await rm(safePath(key), { force: true });
  },
};

/**
 * Storage keys are generated here and never taken from the client, so a
 * hostile filename cannot choose its own path or collide with another record.
 */
export function newStorageKey(employeeId: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return join(employeeId, day, randomUUID());
}

export const storage: DocumentStorage = localStorage;
