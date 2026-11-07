# 04 — Backend Engineering

**No backend framework is installed.** This repository is a tooling baseline. When the project needs
a server, choose the smallest thing that fits and confirm it before installing a framework.

Reference baseline: [nodebestpractices](https://github.com/goldbergyoni/nodebestpractices),
[OWASP CheatSheetSeries](https://github.com/OWASP/CheatSheetSeries),
[Prisma](https://github.com/prisma/prisma), [Zod](https://github.com/colinhacks/zod).

## Modular architecture

- Layered, one direction of dependency: `route/handler → service → repository`. A route never talks
  to the database, a repository never formats HTTP responses.
- Business logic lives in services and stays framework-free, so it can be unit tested without a
  server.
- Group by feature (`src/features/billing/`), not by technical type once a feature grows past a
  couple of files.
- Cross-cutting concerns (auth, logging, errors, validation) are middleware, not copy-paste.
- No circular imports. No module reaches into another module's internals.

## Input validation

- **Validate everything at the boundary with Zod**: body, query, path params, headers, env vars,
  and every third-party response. Validation is not optional and not client-side only.
- Derive types from schemas (`z.infer`) so the runtime check and the compile-time type cannot drift.
- Validate the environment once at startup and fail fast with a readable message.
- Reject unknown keys (`z.object({...}).strict()`); never forward an unvalidated payload.
- Never trust `Content-Type`, `Origin`, or a client-supplied id for authorisation.

## Secure API design

- Correct status codes and one consistent error envelope. Never leak stack traces or SQL to a client.
- Authenticate on every protected route; authorise the specific resource, not just the role.
- Rate-limit anything that costs money, sends mail, or can be brute-forced.
- Idempotency keys on non-idempotent retryable endpoints.
- Pagination with a hard maximum page size. No unbounded collection endpoints.
- Timeouts on every outbound call; never let a request hang forever.

## Data integrity

- The database enforces invariants: `NOT NULL`, `UNIQUE`, `FOREIGN KEY`, `CHECK`, transactions.
  Application checks are not a substitute.
- Migrations are versioned, reviewed, reversible, and never edited after being applied.
- Multi-step writes run in a transaction. Partial writes are a bug.
- Money is integer minor units or a decimal type, never a float. All timestamps are UTC.

## Errors and logging

- One error type hierarchy. Central handler maps errors to responses. Unknown errors become a 500
  with a correlation id, and the detail goes to the log only.
- Log structured JSON with a request id. Never log passwords, tokens, cookies, or full PII.
- Log the decision, not the noise. No `console.log` left in production paths.

Related: `05-security.md` (auth, secrets), `06-testing.md` (integration tests).
