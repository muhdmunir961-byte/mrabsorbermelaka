# 06 — Testing and Verification

Four gates. All four run before work is called done. Report the real output, never a summary you
did not observe.

| Gate | Command | Must |
|:--|:--|:--|
| Format | `npm run format:check` | pass |
| Lint | `npm run lint` | zero errors |
| Types | `npm run typecheck` | zero errors |
| Browser | `npm run test:e2e` | pass |

`npm run verify` runs all four. Use it.

## What each gate covers

- **Format** — Prettier. Do not argue with the formatter; fix the source.
- **Lint** — ESLint flat config with type-aware TypeScript rules. `any`, floating promises, and
  unused values are errors. Fix the cause; do not add `eslint-disable` without a comment saying why.
- **Types** — `tsc --noEmit` under `strict`. Weakening `tsconfig.json` is not a fix.
- **Browser** — Playwright, Chromium plus a mobile profile, against the fixture server.

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
