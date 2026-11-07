# 06 — Testing and Verification

Four gates. All four run before work is called done. Report the real output, never a summary you
did not observe.

| Gate | Command | Must |
|:--|:--|:--|
| Format | `npm run format:check` | pass |
| Lint | `npm run lint` | zero errors |
| Types | `npm run typecheck` | zero errors |
| Unit | `npm run test:unit` | pass |
| Browser | `npm run test:e2e` | pass |

`npm run verify` runs all five. Use it.

## Browser tests sign in once

The OTP endpoint is rate limited to 5 requests per 5 minutes per IP — a control we keep rather than
weaken for tests. So `tests/e2e/auth.setup.ts` authenticates **once per run** and saves the session
to `tests/.auth/staff.json` (git-ignored). Tests that must start signed out override it with
`test.use({ storageState: { cookies: [], origins: [] } })`.

Do not add a UI sign-in to every test; it will trip the rate limit and fail in ways that look like
application bugs.

## What each gate covers

- **Format** — Prettier. Do not argue with the formatter; fix the source.
- **Lint** — ESLint flat config with type-aware TypeScript rules. `any`, floating promises, and
  unused values are errors. Fix the cause; do not add `eslint-disable` without a comment saying why.
- **Types** — `tsc --noEmit` under `strict`. Weakening `tsconfig.json` is not a fix.
- **Browser** — Playwright, Chromium plus a mobile profile, against the fixture server.

### Environment note (lean container images)

This image ships no GLib/NSS/X11 libraries, so Chromium cannot start unless extra
shared objects are on the loader path. They were fetched **rootlessly** into
`~/.local/sysroot` (no system packages, no `apt` as root). `npm run test:e2e` wraps
Playwright in `scripts/with-browser-libs.sh`, which prepends that sysroot when it
exists and is a no-op everywhere else. Do not "fix" a missing-library error by
editing `tsconfig` or skipping the gate; run the wrapper, or install the OS packages
properly with root.

The same image ships **no font files at all**, which makes Chromium lay out every
text node at zero height: the page looks blank while the DOM is correct. Liberation
fonts were extracted into `~/.local/share/fonts`. If text disappears again, check
fonts before suspecting CSS.

The suite drives the real stack: Playwright starts the API and the Vite dev server
and needs PostgreSQL reachable through `DATABASE_URL` (see `apps/api/.env`).

## Writing tests

- Test behaviour through the public surface, not internals. Assert on what a user or caller sees.
- One reason to fail per test. A test name states the behaviour, not the function name.
- Deterministic: no `sleep`, no real network, no dependency on wall-clock or ordering. Control time
  and randomness.
- Every test cleans up after itself; tests must pass in any order and in parallel.
- A bug fix arrives with a test that fails before the fix and passes after.
- Test the boundaries: empty, one, many, too many, wrong type, unauthorised, malformed input.

## Unit and integration

- **Unit** for pure logic, services, validators, formatters — fast, no I/O.
- **Integration** where a route, a database transaction, or an auth check is the thing that can
  break. This is where backend bugs actually live; do not skip it with "covered by a unit test".
- Run integration tests against a disposable database, never a shared or production one.

## Browser tests

- Playwright drives a real browser: real clicks, real focus, real keyboard.
- Cover the critical path end to end, plus the states people actually hit: empty, loading, error,
  permission denied.
- Prefer role and label locators (`getByRole`, `getByLabel`) over CSS selectors — they fail when
  accessibility breaks, which is the point.
- Capture a trace on first retry; a flaky test is a bug in the test.

## Before you say "done"

1. Run `npm run verify`.
2. Paste the result, including any warning you chose to ignore and why.
3. For UI work, run the Anti-Slop Delivery Gate and the `web-design-guidelines` review, and paste
   both.
4. If a gate could not run, name it and explain — do not imply it passed.
