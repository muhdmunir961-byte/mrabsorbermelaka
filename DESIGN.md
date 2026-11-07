# DESIGN.md

Visual direction for this project. Read before building UI. Update before inventing a look.

Anti-Slop is a filter: it removes slop and stops there. Direction comes from this file. Without an
entry here, UI work is a **draft without direction** and is labelled as such.

> Status: **no direction defined yet.** Fill in the sections below, or ask for a direction to be
> proposed, before any interface work starts.

## 1. Intent

- **What this is:** _one sentence._
- **Who it is for:** _audience, and what they already know._
- **The one thing a visitor must understand:** _one sentence._
- **What it deliberately is not:** _the adjacent thing this must not look like._

## 2. Typography

| Role       | Family | Size | Line height | Weight | Notes                     |
| :--------- | :----- | :--- | :---------- | :----- | :------------------------ |
| Display    | _tbd_  |      |             |        |                           |
| Heading    | _tbd_  |      |             |        |                           |
| Body       | _tbd_  |      |             |        | 45–75 characters per line |
| UI / label | _tbd_  |      |             |        |                           |
| Numeric    | _tbd_  |      |             |        | tabular figures           |

Scale ratio: _tbd (e.g. 1.25)_. Loaded from: _self-hosted or provider_.

## 3. Spacing

Base unit: _tbd (e.g. 4 px)_. Scale: _0, 1, 2, 3, 4, 6, 8, 12, 16, 24 × base_.

Every gap and padding comes from this scale. An exception means the layout is wrong.

## 4. Colour

| Token         | Light | Dark | Contrast on background | Use                      |
| :------------ | :---- | :--- | :--------------------- | :----------------------- |
| `background`  |       |      | —                      | page                     |
| `surface`     |       |      |                        | raised panels            |
| `text`        |       |      | _≥ 4.5:1_              | body copy                |
| `text-muted`  |       |      | _≥ 4.5:1_              | secondary copy           |
| `accent`      |       |      | _≥ 3:1_                | actions only             |
| `destructive` |       |      | _≥ 3:1_                | destructive actions only |
| `border`      |       |      | _≥ 3:1_                | edges and focus          |

Both themes are designed, not inverted. Contrast ratios are measured and recorded here.

## 5. Shape, elevation, motion

- Radius scale: _tbd (one scale, e.g. 4 / 8 / 12 px; `full` for pills only)_.
- Elevation: _tbd — how many levels, and what each one means._
- Durations: fast _tbd_ / base _tbd_ / slow _tbd_ ms. Easings: _tbd_.
- Motion explains a change. Nothing animates on load for decoration. Everything respects
  `prefers-reduced-motion`.

## 6. Layout

- Breakpoints: _tbd_. Max content width: _tbd_. Grid: _tbd_.
- Information architecture, not a card grid. State the page order here.

## 7. Components

For each shared primitive: what it is for, its states (default / hover / active / focus / disabled /
loading / error), and what it must never become.

## 8. Copy voice

- Register: _tbd_. Person: _tbd_. Sentence length: _tbd_.
- Words we use: _tbd_. Words we never use: _tbd_ (start with the slop list in `antislop-copywriting`).

## 9. Review checklist

Before shipping a screen: run `web-design-guidelines` over the code, then the Anti-Slop Delivery
Gate. Both results get reported, not summarised.
