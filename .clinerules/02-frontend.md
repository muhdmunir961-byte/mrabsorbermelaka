# 02 — Frontend Engineering

**Framework status: none chosen yet.** This repository is a tooling baseline. Do not scaffold a
framework, router, or component kit until the project actually needs one, and when it does, confirm
the choice before installing. The rules below apply to whatever is built.

## TypeScript

- `strict` is on. Do not weaken `tsconfig.json` to make an error go away.
- No `any`. No `@ts-ignore`. If a type is genuinely unknown, use `unknown` and narrow it.
- No non-null assertions (`!`) to silence the compiler; handle the empty case.
- Model states with discriminated unions instead of parallel booleans
  (`{ status: 'idle' | 'loading' | 'error' | 'ok' }`).
- Parse unknown data at the boundary (API response, `localStorage`, URL) into a typed value. Do not
  cast it.
- Type-only imports use `import type`.

## Components

- One component, one job. If a component needs a boolean prop that changes its whole shape, split it.
- Prefer composition (children, slots) over prop drilling and over prop explosions.
- Shared primitives live in one place; do not fork a button into five near-copies.
- Styling is a single system (Tailwind utilities or CSS modules — not both per feature).
- No inline magic numbers for spacing; use the scale in `DESIGN.md`.

## Accessibility

Non-negotiable, and it is checked, not assumed:

- Semantic elements first: `button` for actions, `a` for navigation. Never a `div` with `onClick`.
- Every interactive element is reachable and operable by keyboard, with a visible focus ring.
- Every input has a real label. Every image has `alt` (empty `alt` when decorative).
- Contrast meets WCAG 2.2 AA (4.5:1 body, 3:1 large text and UI edges).
- Modals and menus trap focus, close on `Escape`, and restore focus to the trigger.
- Announce async results and errors to assistive tech (`role="status"`, `aria-live`).
- State is conveyed by more than colour.

Load `antislop-human` for the full set.

## Responsive

- Mobile-first. Design at 320 px, then widen. No horizontal scroll at any width.
- Touch targets at least 44×44 px.
- Test at 320, 768, 1280, and 1920 px. Use container queries where a component's own width is the
  real constraint.
- Never disable zoom. Never set `user-scalable=no`.

## Performance

- Ship the smallest thing that works. Measure before optimising and report the number.
- Any list that can grow past ~100 rows is virtualised or paginated.
- Images declare `width`/`height`, load lazily below the fold, and use modern formats.
- No render-blocking third-party script. No font loading that blocks text paint.
- Do not animate layout properties (`width`, `height`, `top`, `left`); animate `transform`/`opacity`.
- Respect `prefers-reduced-motion`.

Related: `03-design.md` (visual direction), `01-anti-ai-slop.md` (R-03, R-40).
