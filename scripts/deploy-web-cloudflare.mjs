#!/usr/bin/env node
/**
 * Deploys apps/web to Cloudflare Pages using the API token in .cloudflare-token.
 *
 * Non-interactive on purpose: `wrangler login` needs a browser callback that
 * cannot reach this container, so a token is the only flow that completes here.
 * The token and account id are never printed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PROJECT = process.env.CF_PAGES_PROJECT ?? 'mrabsorbermelaka';
const API_BASE = process.env.VITE_API_BASE_URL ?? 'https://api.mrabsorbermelaka.biz.id';

const readSecret = (file) => {
  if (!existsSync(file)) return '';
  return readFileSync(file, 'utf8').trim();
};

const token = readSecret('.cloudflare-token');
if (token === '') {
  console.error('FAIL: .cloudflare-token is empty.');
  console.error('Create a token at dash.cloudflare.com -> My Profile -> API Tokens');
  console.error('(template: "Edit Cloudflare Workers" / permissions: Cloudflare Pages:Edit,');
  console.error('Account:Read), then paste it into .cloudflare-token and rerun.');
  process.exit(2);
}

// 1. Verify the token before doing any work, so a bad token fails in one second
//    instead of after a build.
const verify = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
  headers: { Authorization: `Bearer ${token}` },
});
const verifyBody = await verify.json().catch(() => ({}));
if (!verify.ok || verifyBody?.result?.status !== 'active') {
  console.error(`FAIL: token rejected (HTTP ${verify.status}).`);
  console.error('Create a new token; make sure it is not expired and has Pages:Edit.');
  process.exit(2);
}
console.log('OK  token aktif');

// 2. Resolve the account id when .cloudflare-account is absent.
let accountId = readSecret('.cloudflare-account');
if (accountId === '') {
  const accounts = await fetch('https://api.cloudflare.com/client/v4/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await accounts.json().catch(() => ({}));
  const first = body?.result?.[0];
  if (!first?.id) {
    console.error('FAIL: could not list accounts for this token.');
    process.exit(2);
  }
  accountId = first.id;
  const names = body.result.map((a) => a.name).join(', ');
  console.log(`OK  akaun: ${names}`);
}

// 3. Build with the API origin baked in. Vite inlines this value, so a stale
//    build would point the frontend at the wrong API.
console.log(`OK  membina dengan VITE_API_BASE_URL=${API_BASE}`);
const build = spawnSync('npm', ['run', 'build:web'], {
  cwd: '/config/workspace',
  env: { ...process.env, VITE_API_BASE_URL: API_BASE },
  encoding: 'utf8',
  stdio: 'inherit',
});
if (build.status !== 0) {
  console.error('FAIL: build gagal');
  process.exit(1);
}

// 4. Publish. --commit-dirty avoids a git prompt in a workspace with local edits.
console.log(`OK  menerbitkan ke projek Pages "${PROJECT}"`);
const deploy = spawnSync(
  'npx',
  [
    '--yes',
    'wrangler@latest',
    'pages',
    'deploy',
    'dist',
    '--project-name',
    PROJECT,
    '--branch',
    'main',
    '--commit-dirty=true',
  ],
  {
    cwd: '/config/workspace/apps/web',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: accountId },
    encoding: 'utf8',
    stdio: 'inherit',
  },
);

if (deploy.status !== 0) {
  console.error('FAIL: wrangler pages deploy gagal');
  process.exit(1);
}
console.log('SELESAI: deployment diterbitkan.');
