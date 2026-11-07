# AGENTS.md

Instructions for any coding agent working in this repository. The detailed rules live in
`.clinerules/`; this file is the map, not a second copy.

## What this repository is

The **Mr. Absorber Melaka HR system**: a React + Vite web app (`apps/web`), a Fastify + Prisma API
(`apps/api`), and shared Zod contracts (`packages/shared`). The reference design lives in
`references-mrabsorberhr/`.

Do not swap the stack, and do not add a second component kit or ORM.

## Read these first

| Order | File                             | Covers                                                          |
| :---- | :------------------------------- | :-------------------------------------------------------------- |
| 1     | `.clinerules/00-global.md`       | inspect before modifying, preserving architecture, asking first |
| 2     | `.clinerules/01-anti-ai-slop.md` | which Anti-Slop skills to load and when                         |
| 3     | `.clinerules/02-frontend.md`     | TypeScript, components, accessibility, responsive, performance  |
| 4     | `.clinerules/03-design.md`       | visual direction, typography, spacing, colour, motion           |
| 5     | `.clinerules/04-backend.md`      | modular architecture, validation, API, database                 |
| 6     | `.clinerules/05-security.md`     | OWASP baseline, secrets, auth, authorisation                    |
| 7     | `.clinerules/06-testing.md`      | the four gates and what counts as done                          |

## Available skills

Installed under `.agents/skills/`, which Cline reads. Load on demand, not all at once.

- **Anti-Slop filter** — `antislop` (core), `antislop-ui`, `antislop-copywriting`,
  `antislop-human`, `antislop-layoutmobile`, `antislop-code`.
- **Design** — `frontend-design` (aesthetic direction for new UI), `web-design-guidelines` (Vercel
  Web Interface Guidelines audit, 100+ accessibility/performance/UX rules).

## Tools available

- **H/Ai Browser** (`hai-browser` MCP) — drives the browser inside the editor: open, screenshot,
  inspect DOM, read console, pick an element and jump to the source line. Use it instead of
  `curl` for anything visual, and instead of guessing what a page looks like.
- **Playwright** — automated browser tests (`npm run test:e2e`).

## The gates

```bash
npm run verify
```

Format, lint, typecheck, browser tests. See `.clinerules/06-testing.md`. Do not report a gate as
passing without running it.

<!-- antislop:start -->

## antislop

For UI, copy, people, mobile layout, or code comments work, read these installed skill files directly (use these paths even if a same-named global skill exists):

- Core filter, always on: `antislop`: `.agents/skills/antislop/SKILL.md`
- UI / visual: `antislop-ui`: `.agents/skills/antislop-ui/SKILL.md`
- Copy & text: `antislop-copywriting`: `.agents/skills/antislop-copywriting/SKILL.md`
- People: `antislop-human`: `.agents/skills/antislop-human/SKILL.md`
- Mobile / responsive: `antislop-layoutmobile`: `.agents/skills/antislop-layoutmobile/SKILL.md`
- Code comments: `antislop-code`: `.agents/skills/antislop-code/SKILL.md`
  Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
  Only an explicit choice of antislop during or after selects a session mode. A request to review, audit, or avoid file edits does not select a mode; read the global preference in that case. Another skill's mode does not select antislop's mode.
  If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
  To update antislop later: `npx antislop-ai --update`, or run `npx antislop-ai` and pick Overwrite them.

<!-- antislop:end -->
