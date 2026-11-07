# 01 — Anti-AI-Slop Filter

The rulebook itself lives in the installed skill. **Do not restate it here.** This file only says
when to load it and what this project adds on top.

## Where the rules are

| Skill | Path | Load when |
|:--|:--|:--|
| `antislop` (core, always on) | `.agents/skills/antislop/SKILL.md` | always |
| `antislop-ui` | `.agents/skills/antislop-ui/SKILL.md` | building or changing any interface |
| `antislop-layoutmobile` | `.agents/skills/antislop-layoutmobile/SKILL.md` | layouts that reflow across screen sizes |
| `antislop-human` | `.agents/skills/antislop-human/SKILL.md` | contrast, keyboard, focus, states, affordances |
| `antislop-copywriting` | `.agents/skills/antislop-copywriting/SKILL.md` | headlines, CTAs, any prose |
| `antislop-code` | `.agents/skills/antislop-code/SKILL.md` | writing or removing code comments |

Read these files directly, at these paths, even if a same-named global skill exists.

## Project application of the filter

The patterns below are named here only so a reviewer can check them off. The rule text, the
reasoning, and the test for each are in the skill; follow the skill, not this list.

- **Layout and cards** — no generic hero-plus-three-cards page, no card grid standing in for a
  real information architecture (R-05, R-14).
- **Color** — no gradient as decoration, no glow, no glassmorphism without a functional reason
  (R-01, R-10, R-13). Contrast is checked, not assumed (R-25).
- **Spacing and shape** — one spacing rhythm and one radius scale across the page (R-11);
  inconsistent spacing is a defect, not a style (C-1, C-3).
- **Copy** — no "Unlock the power of", no invented metrics, no testimonials that do not exist
  (R-02, R-16, R-17, R-18, R-36).
- **Functionality** — no dead buttons, no fake terminal output, no fake loading states. If the
  data is not there, say so (C-2, R-38).
- **Motion** — animation needs a job; every animation respects `prefers-reduced-motion`
  (R-19).

## Direction is required, not optional

`DESIGN.md` is the source of visual direction in this repo. Before building UI, read it. If it has
no direction for the screen you are building, write the direction into it first (or ask), then
build. Per R-37, work produced without direction is labelled **draft without direction** — it is
not presented as finished. If `DESIGN.md` asks for something the filter rejects, do not obey
quietly and do not overrule it: name the element, name the rule, ask.

## Delivery Gate

Mode is set to `during` (`~/.config/antislop/settings.json`). Before you hand back any UI, copy,
layout, or comment work, run the skill's **Delivery Gate** and paste its PASS/FAIL report, all four
blocks. A deliverable with an unreported gate is not done.

## What this file does not do

It does not add house style. Anti-Slop is a filter; it never picks the palette, the typeface, or
the layout. Those choices come from `DESIGN.md`.
