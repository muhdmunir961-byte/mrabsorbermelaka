# DESIGN.md

Visual direction for this project. Read before building UI. Update before inventing a look.

Anti-Slop is a filter: it removes slop and stops there. Direction comes from this file. Without an
entry here, UI work is a **draft without direction** and is labelled as such.

> Status: **direction defined (v1)**, traced from `references-mrabsorberhr/` and measured rather than
> eyeballed. Change it here first, then build.

## 1. Intent

- **What this is:** the shift-level paperwork for a two-branch absorber workshop, done on a phone in
  the bay and on a desktop in the office.
- **Who it is for:** mechanics on a phone with dirty hands, a foreman on a branch desktop, and an
  admin/HR manager running payroll. English reading is comfortable; the interface speaks Malay.
- **The one thing a visitor must understand:** whether today's work is recorded and what it earned.
- **What it deliberately is not:** a SaaS dashboard. No hero, no marketing voice, no illustrative
  empty states, and nothing that exists to look impressive.

### Direction in one line

**Workshop paperwork:** a tool that stays out of the way. Numbers lead, the red is reserved for the
single primary action and for anything late or destructive, and every block is separated by a 1px
border rather than by shadow or gradient.

## 2. Typography

The reference export contains no usable font information: the PDF embeds only pdf-lib fallbacks
(`Helvetica`, `LiberationSans-Bold`), so the original family cannot be recovered from the file. Until
a family is chosen and licensed, the interface uses the system UI stack, which also avoids a blocking
webfont request.

| Role       | Family                                  | Size | Line height | Weight | Notes                     |
| :--------- | :-------------------------------------- | :--- | :---------- | :----- | :------------------------ |
| Display    | system UI stack                         | 36px | 1.1         | 900    | login headline only       |
| Heading    | system UI stack                         | 24px | 1.25        | 700    | one `h1` per screen       |
| Body       | system UI stack                         | 14px | 1.5         | 400    | 45–75 characters per line |
| UI / label | system UI stack                         | 12px | 1.4         | 600    | uppercase, tracked        |
| Numeric    | system UI stack, `font-variant-numeric` | —    | —           | 700    | tabular figures, always   |

Scale ratio: 1.25 (14 / 18 / 24 / 36). Loaded from: the operating system, no webfont.

## 3. Spacing

Base unit: 4px. Scale: 4, 8, 12, 16, 20, 24, 32, 40.

Every gap and padding comes from this scale. Panel padding is 20px, control padding is 10–12px, and
the gap between unrelated sections is 24px. An exception means the layout is wrong.

## 4. Colour

Every value below is measured from the reference export; every ratio is computed, not estimated. The
palette is deliberately the same family the reference uses, so the product still reads as Mr.
Absorber, with the failing edges corrected.

| Token           | Hex       | On             | Ratio   | Use                          |
| :-------------- | :-------- | :------------- | :------ | :--------------------------- |
| `canvas`        | `#f9fafb` | —              | —       | page background              |
| `surface`       | `#ffffff` | —              | —       | panels, cards, inputs        |
| `ink`           | `#111827` | `canvas`       | 16.98:1 | body copy, headings          |
| `ink-muted`     | `#6b7280` | `canvas`       | 4.63:1  | secondary copy, labels       |
| `border`        | `#e5e7eb` | `surface`      | 1.24:1  | decorative separators only   |
| `border-strong` | `#6b7280` | `surface`      | 4.83:1  | form control edges           |
| `accent`        | `#dc2626` | `surface`      | 4.83:1  | primary action, focus ring   |
| `accent-strong` | `#b91c1c` | `accent-soft`  | 5.91:1  | accent text on tinted chips  |
| `accent-ink`    | `#ffffff` | `accent`       | 4.83:1  | text on a filled button      |
| `success`       | `#10a54a` | `surface`      | 3.23:1  | figures 24px and larger only |
| `warning`       | `#b45309` | `warning-soft` | 4.84:1  | caution notices              |

Notes taken from the measurement, not from taste:

- `border` at 1.24:1 cannot carry a control boundary (WCAG 1.4.11 wants 3:1), so inputs and buttons
  use `border-strong`. Panels keep the lighter border because nothing depends on it.
- `success` at 3.23:1 is used **only** for the 24px commission figure. Small text in green would
  fail; the label above it is `ink-muted`.
- Only a light theme ships. A dark theme is not designed yet, and shipping an inverted one would be
  a bug.

## 5. Shape, elevation, motion

- Radius: 8px for controls, 12px for panels, `full` for status pills only. No other radii.
- Elevation: **one level, and it is a 1px border.** No box shadows. A shadow would have to earn its
  place and nothing here does.
- Duration: 120ms, `ease-out`, on colour and border only. Nothing animates on load. No layout
  properties are animated. `prefers-reduced-motion` reduces every duration to ~0.

## 6. Layout

- Breakpoints: 640 / 768 / 1024 / 1280. Max content width 1152px.
- Login is two columns from 1024px up (brand panel + form), one column below.
- Page order, and the only five screens that exist: **Login → Home (staff) → Cuti (staff) →
  Kelulusan (admin, owner) → Operations (foreman, admin, owner)**. Anything else is not built yet,
  and the navigation says so by not listing it.

## 7. Components

| Primitive        | Job                                          | States                                | Must never become                                       |
| :--------------- | :------------------------------------------- | :------------------------------------ | :------------------------------------------------------ |
| `Panel`          | one bordered surface grouping one idea       | static                                | a card grid standing in for an information architecture |
| `Button` primary | the single red action on a screen            | default, hover, focus, disabled, busy | two primaries side by side                              |
| `Button` quiet   | anything secondary                           | same, neutral border                  | a link pretending to be a button                        |
| `Field`          | label + input + hint + error                 | default, focus, invalid, disabled     | a placeholder used as a label                           |
| `Chip`           | a status, always with a word in it           | static                                | colour-only status                                      |
| `KpiTile`        | one number and its unit                      | static                                | a decorative stat with an invented figure               |
| `JobRow`         | one job with plate, service, money, progress | static, in-progress                   | a fake progress bar with no data behind it              |

Every control is at least 44px tall. State is always carried by text as well as colour.

## 8. Copy voice

- Malay, second person **anda**, active voice, one idea per sentence.
- Money is always `RM 1,234.50` with tabular figures. Dates are `24 Okt 2024`. Times are 24-hour.
- Words we never use: _unlock, seamless, revolutionary, next-gen, AI-powered, effortless, game-changing_,
  and any metric nobody measured. If a number is not from the database, it does not appear.

## 9. Review checklist

Before shipping a screen: run `web-design-guidelines` over the code, then the Anti-Slop Delivery
Gate. Both results get reported, not summarised. Any new colour enters §4 with a computed ratio
before it enters the stylesheet.
