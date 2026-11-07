# Deploying the two halves

The web app and the API are separate deployables. Nothing in either one requires
the other to live on the same host.

## What is separate

|                  | `apps/web`                    | `apps/api`                   |
| :--------------- | :---------------------------- | :--------------------------- |
| Build            | `vite build` → static `dist/` | `tsc` / `tsx` → Node process |
| Needs a database | no                            | yes                          |
| Holds secrets    | no                            | yes                          |
| Scales by        | CDN                           | instance + connection pool   |

The only contract between them is `packages/shared`, which is compiled into both.

## Configuration

**API** (`apps/api/.env`):

| Variable               | Purpose                                                     |
| :--------------------- | :---------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string, `sslmode=require` for hosted  |
| `SESSION_SECRET`       | 32+ characters, not the development placeholder             |
| `FIELD_ENCRYPTION_KEY` | 32 bytes, base64                                            |
| `FIELD_INDEX_KEY`      | 32+ characters                                              |
| `CORS_ORIGIN`          | the web app origin(s), comma separated, https in production |
| `OTP_EXPOSE_DEV_CODE`  | must be `false` in production; startup refuses otherwise    |

**Web** (build time):

| Variable            | Purpose                                             |
| :------------------ | :-------------------------------------------------- |
| `VITE_API_BASE_URL` | `https://api.example.com`. Empty means same origin. |

`VITE_` values are baked into the bundle and are public. Never put a secret there.

## The cookie when the two are on different hosts

The session cookie is `HttpOnly` and, in production, `SameSite=None; Secure`.
That combination is mandatory for cross-site cookies and requires HTTPS on both
sides. Two consequences worth stating:

- **Serve both over HTTPS.** A `Secure` cookie is silently dropped over plain
  HTTP, which looks like "login does nothing".
- **Set `CORS_ORIGIN` to the exact web origin.** A wildcard is refused because
  credentials cannot be sent with `Access-Control-Allow-Origin: *`.

If the two are on one host behind a reverse proxy, leave `VITE_API_BASE_URL`
empty and keep `CORS_ORIGIN` on the same origin: the cookie stays `SameSite=Lax`.

## Order of operations

```bash
# 1. database
npm run db:migrate:deploy --workspace @mr/api
npm run db:seed --workspace @mr/api        # development only

# 2. api
npm run build --workspace @mr/api
node apps/api/dist/server.js               # or `npm run serve --workspace @mr/api`

# 3. web
VITE_API_BASE_URL=https://api.example.com npm run build --workspace @mr/web
# upload apps/web/dist to any static host

# 4. check
curl https://api.example.com/health        # process is up
curl https://api.example.com/health/ready  # database is reachable
```

`/health` and `/health/ready` are deliberately distinct: a process that answers
but cannot reach the database is not healthy, and a load balancer must not send
traffic to it.

## Face matching keeps a browser alive

The API runs its face comparison in headless Chromium (`src/face/matcher.ts`),
started lazily on first use. On a host without the shared libraries Chromium
needs, `/face/*` fails while the rest of the API works. If Chromium cannot be
installed there, face matching has to move to its own service rather than being
silently disabled.
