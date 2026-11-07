# 05 — Security

Follow the [OWASP Cheat Sheet Series](https://github.com/OWASP/CheatSheetSeries). Where a rule below
and a cheat sheet disagree, the cheat sheet wins.

## Secrets

- Secrets live in environment variables, loaded from `.env.local` (git-ignored). `.env.example`
  documents names with empty values only.
- **Never** put a real key in code, a comment, a test fixture, a screenshot, a commit message, or a
  chat transcript. Never paste one into an issue.
- Never prefix a server-only secret with a client-exposed prefix (`NEXT_PUBLIC_`, `VITE_`,
  `PUBLIC_`).
- If a secret is ever exposed, treat it as compromised: rotate it first, then clean history. Do not
  assume a revert is enough.
- Do not read, print, or echo a `.env*` file's contents while debugging. Print key names.

## Authentication

- Use a maintained library. Do not hand-roll password hashing, session tokens, or OAuth.
- Passwords: Argon2id (or bcrypt with a work factor you can justify). Never MD5/SHA-1/plain SHA-256.
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`, `__Host-` prefix where possible.
- Rotate the session id on login and on privilege change. Absolute and idle expiry.
- Rate-limit and lock out credential endpoints. Uniform error text and timing for
  "no such user" vs "wrong password".
- MFA for administrative accounts. No security question fallbacks.

## Authorisation

- Check permission on **every** request, on the server, against the resource id from the database.
  Never from a client-supplied role, tenant id, or hidden field.
- Scope by tenant/owner in the query itself, not after fetching.
- Deny by default. New routes are protected unless explicitly public.
- Do not rely on hidden UI or unlisted URLs for protection.

## Input, output, and transport

- All input is validated (see `04-backend.md`). All output is encoded for its context.
- Parameterised queries only. No string-built SQL. No raw `eval`/`new Function` on input.
- Escape user HTML, or sanitise with a maintained library, before rendering it.
- Server-side fetch of user-supplied URLs must block private ranges and metadata endpoints (SSRF).
- HTTPS everywhere. Security headers: HSTS, `X-Content-Type-Options`, `Referrer-Policy`, a real
  Content-Security-Policy. No wildcard CORS with credentials.
- CSRF token (or strict origin check) on state-changing requests.

## Dependencies and data

- `npm audit` before shipping; resolve high and critical findings or document why not.
- No dependency from an unmaintained or unverifiable source. Check the registry name precisely —
  typosquats are common.
- Never run an unvetted postinstall script as root.
- Least privilege for database users. No destructive migration or `DELETE` without a `WHERE` and a
  backup.
- Encrypt PII at rest where the platform allows. Collect less of it.
- Do not commit `.env`, keys, dumps, or real user data. Check `git status` before every commit.

## Reporting

If you find a vulnerability while working, stop and report it. Do not silently patch it inside an
unrelated change, and do not demonstrate the exploit against real data.
