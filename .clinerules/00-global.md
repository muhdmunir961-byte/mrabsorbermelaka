# 00 — Global Working Agreement

Scope: every task, every file, every agent in this repository.

## Before you change anything

1. **Read before you write.** Open the file, and the files that import it, before editing. Never modify code you have not read.
2. **Map the blast radius.** Grep for every caller of a function, type, route, or component you plan to change. Report the call sites you found.
3. **State the plan first.** For any change touching more than one file, say what you will change and why, then do it.
4. **When the repo contradicts the request, say so** instead of guessing which one is right.

## Preserve what exists

- Keep the existing architecture, folder layout, naming, and dependency choices. Do not restructure for taste.
- Do not reformat, rename, or "tidy" files unrelated to the task. A diff should contain only the change asked for.
- Do not migrate frameworks, swap libraries, or upgrade a major version unless explicitly asked.
- Deleting a file, dropping a table, resetting a branch, or rewriting history requires explicit approval first.

## Dependencies

- Add a dependency only when the standard library or an existing dependency cannot do the job.
- Prefer the package already in `package.json` over a new one that does the same thing.
- Before adding a package: check it is maintained, has a real repo, and is not a typosquat of a popular name.
- Never add a package that phones home with source code or environment values.

## Ask first

Stop and ask when a request would:

- delete or overwrite data, files, or user configuration;
- change system-level settings or install system packages;
- deploy, publish, or make anything publicly reachable;
- run a destructive database command (`DROP`, `TRUNCATE`, unbounded `DELETE`/`UPDATE`);
- commit or push anything containing credentials.

## Definition of done

No task is finished until all of these pass locally:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:e2e
```

If a gate cannot run in this environment, say which one and why. Never report a gate as passing without running it.

## Honesty

- Never claim a command ran, a test passed, or a feature works without evidence from this session.
- If something is unverified, label it unverified.
- If you could not finish, say exactly where you stopped.

Related rules: `01-anti-ai-slop.md` (output quality), `05-security.md` (secrets), `06-testing.md` (gates).
