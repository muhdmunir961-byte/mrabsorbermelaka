# 03 — Design Direction

`DESIGN.md` holds this project's visual direction. It is the only place direction is decided.
Read it before building UI; write into it before inventing a look.

For aesthetic direction when starting UI work, `frontend-design`
(`.agents/skills/frontend-design/SKILL.md`) covers making choices that do not read as templated
defaults. For auditing existing UI, `web-design-guidelines`
(`.agents/skills/web-design-guidelines/SKILL.md`).

## Original direction

- Every screen has a written intent in `DESIGN.md`: who it is for, what it must make obvious, and
  what it deliberately does not do.
- No borrowed template look. If the result could be any SaaS landing page, it has no direction.
- A direction is a set of decisions, not adjectives. "Warm, editorial, tighter leading, one accent
  reserved for actions" is a direction. "Modern and clean" is not.

## Typography

- Two families at most, and say why each exists. One is usually enough.
- A fixed modular scale (e.g. 1.2 or 1.25 ratio) recorded in `DESIGN.md`. No arbitrary `px` sizes.
- A real hierarchy: one `h1` per page, no skipped levels, body line length 45–75 characters.
- Line height rises as size falls: ~1.1 for display, ~1.5–1.6 for body.
- Tabular figures for any column of numbers. Real typographic marks where the typeface has them.

## Spacing

- One spacing scale, multiples of a single base unit. Every gap comes from the scale.
- Whitespace groups related things and separates unrelated things. If a gap needs a special
  exception, the layout is wrong.
- Consistent internal padding across peer components.

## Colour

- A deliberate, small palette: background, surface, text, muted text, one accent, one destructive.
  Record the values and their contrast ratios in `DESIGN.md`.
- Colour carries meaning, not decoration. The accent means "act here".
- Both themes, if both ship, are designed — not inverted. A theme that fails contrast is a bug.

## Motion

- Animation explains a change: where something came from, what it became, what just happened.
- Durations and easings are named tokens in `DESIGN.md`, not per-component guesses.
- Nothing animates on load for decoration. No parallax without a reason. No motion at all under
  `prefers-reduced-motion`.

## Review

Before calling UI finished, load `web-design-guidelines` and run it against the code, then run the
Anti-Slop Delivery Gate. Report both results.
