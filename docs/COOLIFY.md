# Deploying to Coolify

Two applications, two images, one database. Coolify builds each app from its own
Dockerfile in this repository.

## Before you start

| Need                            | Why                                                           |
| :------------------------------ | :------------------------------------------------------------ |
| A server with Coolify installed | Coolify is self-hosted                                        |
| A Git remote Coolify can read   | it builds from the repo, `muhdmunir961-byte/mrabsorbermelaka` |
| Neon connection string          | `postgresql://…?sslmode=require`                              |
| Three generated secrets         | see the API table below                                       |

Generate the secrets locally and paste them into Coolify, never into Git:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # FIELD_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # FIELD_INDEX_KEY
```

**Keep `FIELD_ENCRYPTION_KEY` somewhere you will not lose it.** Without it the
encrypted IC numbers, addresses and salaries in the database cannot be read back.
There is no recovery path, by design.

## Application 1 — API

| Setting             | Value                  |
| :------------------ | :--------------------- |
| Build pack          | Dockerfile             |
| Base directory      | `/`                    |
| Dockerfile location | `/apps/api/Dockerfile` |
| Port                | `4000`                 |
| Persistent volume   | `/data`                |

## Compose environment variables

Set these in Coolify when the resource uses `docker-compose.yml`:

| Variable               | Status   | Source             | Service |
| :--------------------- | :------- | :----------------- | :------ |
| `DATABASE_URL`         | Required | Used by Compose    | `api`   |
| `SESSION_SECRET`       | Required | Used by Compose    | `api`   |
| `FIELD_ENCRYPTION_KEY` | Required | Used by Compose    | `api`   |
| `FIELD_INDEX_KEY`      | Required | Used by Compose    | `api`   |
| `CORS_ORIGIN`          | Optional | Used by Compose    | `api`   |
| `NODE_ENV`             | —        | Defined in Compose | `api`   |
| `API_HOST`             | —        | Defined in Compose | `api`   |
| `API_PORT`             | —        | Defined in Compose | `api`   |
| `UPLOAD_DIR`           | —        | Defined in Compose | `api`   |
| `API_UPSTREAM`         | —        | Defined in Compose | `web`   |

`OTP_EXPOSE_DEV_CODE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` are already
configured by the API image. Do not expose the OTP in production.

### Telegram sign-in approval

Sign-in through the bot is approved by a human, not automatically:

| Variable                    | Purpose                                                               |
| :-------------------------- | :-------------------------------------------------------------------- |
| `TELEGRAM_APPROVAL_CHAT_ID` | Group chat that receives the "new sign-in request" card with buttons  |
| `TELEGRAM_APPROVER_IDS`     | Comma-separated Telegram **user** ids allowed to press Luluskan/Tolak |

`TELEGRAM_APPROVER_IDS` is not optional when approval happens in a group. The
group is joined by invitation link, so anyone who joined could otherwise approve
their own sign-in by entering a colleague's phone number. The allow list is the
only thing that makes a group decision legitimate.

Approval is also accepted from an `ADMIN_HR`/`OWNER` employee whose Telegram is
linked, so HR can approve from their own chat without being listed.

To find a Telegram user id, have the person press a button in the group once and
read the id in the webhook log line for that callback.

### Preview deployments

Use the same variables for preview deployments. Change `CORS_ORIGIN` to the
preview web URL if the preview web app uses a different origin.

| Variable               | Status   | Source             | Service |
| :--------------------- | :------- | :----------------- | :------ |
| `DATABASE_URL`         | Required | Used by Compose    | `api`   |
| `SESSION_SECRET`       | Required | Used by Compose    | `api`   |
| `FIELD_ENCRYPTION_KEY` | Required | Used by Compose    | `api`   |
| `FIELD_INDEX_KEY`      | Required | Used by Compose    | `api`   |
| `CORS_ORIGIN`          | Optional | Used by Compose    | `api`   |
| `NODE_ENV`             | —        | Defined in Compose | `api`   |
| `API_HOST`             | —        | Defined in Compose | `api`   |
| `API_PORT`             | —        | Defined in Compose | `api`   |
| `UPLOAD_DIR`           | —        | Defined in Compose | `api`   |
| `API_UPSTREAM`         | —        | Defined in Compose | `web`   |

The image installs Chromium from apt because the face matcher needs it. That is
roughly 400 MB of image for a feature that is not used on every request.

Run migrations once, before the first deploy finishes, as a Coolify pre-deploy
command or from a one-off terminal:

```bash
npx prisma migrate deploy --schema prisma/schema.prisma
```

Do **not** run `migrate dev` or `seed` in production: the seed creates demo staff
with a known PIN.

## Application 2 — Web

| Setting             | Value                  |
| :------------------ | :--------------------- |
| Build pack          | Dockerfile             |
| Base directory      | `/`                    |
| Dockerfile location | `/apps/web/Dockerfile` |
| Port                | `80`                   |

Environment variables:

| Variable            | Value                                                       |
| :------------------ | :---------------------------------------------------------- |
| `API_UPSTREAM`      | the API's internal Coolify URL, e.g. `http://api-xxxx:4000` |
| `VITE_API_BASE_URL` | leave **empty**                                             |

`VITE_API_BASE_URL` stays empty on purpose. nginx proxies `/api` to the API, so
the browser only ever talks to one origin. That keeps the session cookie
`SameSite=Lax` and removes CORS from the picture entirely. Set it only if you
deliberately put the API on its own hostname, and then both sides must be HTTPS
and `CORS_ORIGIN` must list the web origin exactly.

`VITE_API_BASE_URL` is a **build** argument, not a runtime one: changing it needs
a rebuild, because Vite inlines it into the bundle.

## Why `prisma generate` fails in a monorepo (and the fix)

Prisma's client generator refuses to run when `@prisma/client` is hoisted away from
the `prisma` package. The check lives in `prisma/build/cli.js` (function `P8t`): it
resolves both packages and rejects the pair when the client sits outside the
`prisma` directory tree. The error it prints is misleading — it suggests installing
`@prisma/client`, which is already installed.

The symptom is a working dev environment (the client was generated earlier) and a
failing Docker build, because only a clean install exposes the layout.

The fix used here: keep **both** `prisma` and `@prisma/client` at the workspace
root. In `package.json`:

- `prisma` is a root `devDependency`, pinned exactly to the same version as
  `@prisma/client`.
- `@prisma/client` stays a dependency of `@mr/api`, and npm hoists it to the root.

With that layout, `npx prisma generate --schema apps/api/prisma/schema.prisma` run
from the repository root succeeds. This was verified against a clean
`npm ci` in an empty directory, not just against an existing `node_modules`.

Do not pin `prisma` without a version: `npm install prisma` currently resolves to
8.0.0-rc, whose config loader rejects the `env()` helper used by
`apps/api/prisma.config.ts`.

## Order of operations

1. Create the API application, set its variables, deploy. It will fail the health
   check until the database has tables — that is expected on the first run.
2. Run `prisma migrate deploy` against Neon.
3. Redeploy the API; `/health/ready` should answer `{"status":"ready"}`.
4. Create the web application, set `API_UPSTREAM`, deploy.
5. Open the web URL and sign in.

## What to check after the first deploy

```bash
curl https://api.example.com/health        # {"status":"ok"}
curl https://api.example.com/health/ready  # {"status":"ready","database":"reachable"}
curl -I https://hr.example.com             # CSP, nosniff, no-referrer present
```

Then in the browser: sign in, clock in, upload an MC, open the profile. Those
four paths touch auth, the database, file storage and PII decryption.

## Limits you should know before going live

- **No SMS provider is connected.** In production `OTP_EXPOSE_DEV_CODE=false`
  means the code is generated but never delivered, so nobody can sign in. Wire a
  provider in `apps/api/src/features/auth/service.ts` first.
- **Uploads live on a volume**, not object storage. A second API replica would
  not see files written by the first.
- **Backups are not configured.** Enabling Coolify's scheduled database backup is
  not optional for payroll data.
