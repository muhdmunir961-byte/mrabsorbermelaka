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

Environment variables:

| Variable                              | Value                                          |
| :------------------------------------ | :--------------------------------------------- |
| `NODE_ENV`                            | `production`                                   |
| `DATABASE_URL`                        | Neon string, keep `sslmode=require`            |
| `SESSION_SECRET`                      | generated above                                |
| `FIELD_ENCRYPTION_KEY`                | generated above                                |
| `FIELD_INDEX_KEY`                     | generated above                                |
| `CORS_ORIGIN`                         | the web app URL, e.g. `https://hr.example.com` |
| `OTP_EXPOSE_DEV_CODE`                 | `false` — the API refuses to start with `true` |
| `API_HOST`                            | `0.0.0.0`                                      |
| `UPLOAD_DIR`                          | `/data/uploads`                                |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | `/usr/bin/chromium` (baked into the image)     |

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
