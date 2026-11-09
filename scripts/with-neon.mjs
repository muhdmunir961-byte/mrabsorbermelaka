import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs a command against the Neon database whose URL lives in .env.local.
 * The URL is passed through the environment and never printed.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const readVar = (file, name) => {
  const match = readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!match) throw new Error(`${name} not found in ${file}`);
  return match[1].replace(/^"|"$/g, '');
};

const url = readVar(resolve(repoRoot, '.env.local'), process.env.NEON_URL_KEY ?? 'DATABASE_URL');

const result = spawnSync(process.argv[2], process.argv.slice(3), {
  cwd: process.env.NEON_CWD ?? repoRoot,
  env: { ...process.env, DATABASE_URL: url },
  encoding: 'utf8',
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
