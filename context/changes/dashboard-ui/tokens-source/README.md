# Token source: S-11 `dashboard-ui`

The preset's raw values stay where the previous change stored them: `context/archive/2026-09-25-ui-styles-audit/tokens-source/preset-b7Br7G9Kq.global.css` (shadcn preset `b7Br7G9Kq`, `radix-maia`, base `mist`). This file records only what this change changed or added in `src/styles/global.css`, and why.

Palette values come from `node_modules/tailwindcss/theme.css` (Tailwind 4.3.3). Contrast is measured against the card `oklch(1 0 0)` unless stated, with `node scripts/token-contrast.mjs` (method below).

## Light theme (`:root`)

| Token                  | Old value                           | New value                                | Source                                                                  |
| ---------------------- | ----------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `--ring`               | mist-400 `oklch(0.723 0.014 214.4)` | mist-600 `oklch(0.45 0.017 213.2)`       | Tailwind palette, mist-600                                              |
| `--destructive`        | red-600 `oklch(0.577 0.245 27.325)` | red-800 `oklch(0.444 0.177 26.899)`      | Tailwind palette, red-800                                               |
| `--muted-foreground`   | mist-500 `oklch(0.56 0.021 213.5)`  | `oklch(0.53 0.021 213.5)`                | derived: mist-500 with the lightness lowered from 0.56 to 0.53          |
| `--success` (new)      | —                                   | emerald-700 `oklch(0.508 0.118 165.612)` | the preset's `--primary` (Tailwind emerald-700)                         |
| `--success-foreground` | —                                   | emerald-50 `oklch(0.979 0.021 166.113)`  | the preset's `--primary-foreground` (Tailwind emerald-50)               |
| `--warning` (new)      | —                                   | amber-800 `oklch(0.473 0.137 46.201)`    | Tailwind palette, amber-800                                             |
| `--warning-foreground` | —                                   | amber-50 `oklch(0.987 0.022 95.277)`     | Tailwind palette, amber-50                                              |
| base `outline-ring/50` | the ring colour at 50 %             | `outline-ring` (solid)                   | this change; deviates from the preset (see "Deviation from the preset") |

`@theme inline` publishes the four new tokens as `--color-success`, `--color-success-foreground`, `--color-warning` and `--color-warning-foreground`, so `text-success`, `bg-warning/10` and the like work.

### Why these values

- **`--ring` mist-600.** The old mist-400 gave the focus ring's 1 px line 2.44:1 on a card and its 50 % halo 1.51:1, both below the 3:1 a focus indicator needs (WCAG 1.4.11). mist-600 stays in the preset's grey family and gives 7.39:1 on a card, 6.64:1 on `--muted` and 3.19:1 against its own 50 % halo.
- **`--destructive` red-800, not red-700.** Destructive buttons put the text on a 10 % tint of the same colour (`bg-destructive/10 text-destructive`) and hover to a 20 % tint. red-700 passes at rest (5.33:1) but its hover tint drops to 4.38:1. red-800 gives 6.94:1 on the 10 % tint (was 3.99:1), 5.68:1 on the 20 % tint and 8.37:1 on a card.
- **`--muted-foreground` at L 0.53.** Muted text sits on `bg-muted` in the footer and the page background, where mist-500 gave 4.15:1. Lowering only the lightness keeps the hue and chroma of the preset; L 0.54 gives 4.51:1, with no margin, so 0.53 (4.70:1 on `--muted`, 5.23:1 on a card).
- **`--success` from the preset's primary.** The done state of a task needs its own role, and S-13's check-off grid reuses it. The preset's emerald pair is already the brand's green and passes: 5.37:1 on a card, 4.66:1 on its 10 % tint, and the foreground 5.09:1 on it.
- **`--warning` amber-800.** Partial-failure notices are text on a card (`text-warning`, the description at 90 %): 7.13:1 on a card, 5.75:1 at 90 %, 6.09:1 on its 10 % tint; the foreground 6.88:1 on it.

## Dark theme (`.dark`)

Dark mode is out of scope (deferred D3: nothing turns `.dark` on). `.dark` only receives the four new tokens, so the block stays complete; its existing values are unchanged. These pairs are recorded, not gated (the script reads `:root` only).

| Token                  | Value                                    | Source           | Contrast                                           |
| ---------------------- | ---------------------------------------- | ---------------- | -------------------------------------------------- |
| `--success`            | emerald-400 `oklch(0.765 0.177 163.223)` | Tailwind palette | 8.98:1 on the dark card `oklch(0.218 0.008 223.9)` |
| `--success-foreground` | emerald-950 `oklch(0.262 0.051 172.552)` | Tailwind palette | 7.83:1 on dark `--success`                         |
| `--warning`            | amber-400 `oklch(0.828 0.189 84.429)`    | Tailwind palette | 10.11:1 on the dark card                           |
| `--warning-foreground` | amber-950 `oklch(0.279 0.077 45.635)`    | Tailwind palette | 8.73:1 on dark `--warning`                         |

## Deviation from the preset

The preset's base layer sets `outline-ring/50` on every element, so native focus outlines (links, a `<summary>`) were the ring colour at 50 %. This change makes the outline solid (`outline-ring`): with the darker ring it gives native outlines 7.39:1 on a card. Component focus styles (`focus-visible:border-ring focus-visible:ring-ring/50` in `ui/button.tsx` and `ui/input.tsx`) are unchanged; their solid 1 px border carries the 3:1, the halo is decoration.

Deferred D6: the primary button's hover (`hover:bg-primary/80`, `ui/button.tsx`) gives 3.51:1. It applies on every page and is not one of the pairs this change set out to fix, so the script reports it as information only.

## Method and the script's output

`scripts/token-contrast.mjs` (zero dependencies, run in the CI `ci` job after lint) reads the `:root` OKLCH values from `src/styles/global.css`, converts them OKLCH → OKLab → linear sRGB with Ottosson's matrices (clipped to the sRGB gamut), composites a colour with alpha over its background in gamma-encoded sRGB (as browsers blend), and computes the WCAG ratio from the relative luminance. It exits 1 when a gating pair is below its threshold. Output after this change (2026-10-12):

```
PASS  ring on card: 7.39:1 (threshold 3:1)
PASS  ring on muted: 6.64:1 (threshold 3:1)
PASS  ring on its own 50 % halo: 3.19:1 (threshold 3:1)
PASS  destructive on card: 8.37:1 (threshold 4.5:1)
PASS  destructive on its 10 % tint: 6.94:1 (threshold 4.5:1)
PASS  destructive on its 20 % tint (hover): 5.68:1 (threshold 4.5:1)
PASS  muted-foreground on muted: 4.70:1 (threshold 4.5:1)
PASS  muted-foreground on card: 5.23:1 (threshold 4.5:1)
PASS  success on card: 5.37:1 (threshold 4.5:1)
PASS  success on its 10 % tint: 4.66:1 (threshold 4.5:1)
PASS  success-foreground on success: 5.09:1 (threshold 4.5:1)
PASS  warning on card: 7.13:1 (threshold 4.5:1)
PASS  warning at 90 % on card: 5.75:1 (threshold 4.5:1)
PASS  warning-foreground on warning: 6.88:1 (threshold 4.5:1)
PASS  primary-foreground on primary: 5.09:1 (threshold 4.5:1)
PASS  secondary-foreground on secondary: 16.11:1 (threshold 4.5:1)
PASS  foreground on card: 19.71:1 (threshold 4.5:1)
INFO  primary-foreground on the 80 % hover tint (D6): 3.51:1 (threshold 4.5:1, not gating)

All gating pairs pass
```

The same script against the old `:root` values reports `ring on card` 2.44:1, `destructive on its 10 % tint` 3.99:1 and `muted-foreground on muted` 4.15:1, the failures the research measured.
