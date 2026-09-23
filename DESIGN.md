# Nimbus design tokens

Extracted from `src/index.css`. These are the values to reuse for any new surface so the
product stays visually consistent.

## Direction

A warm neutral palette with exactly one accent (copper). No gradients on UI chrome, no
glass cards, no emoji. Conversation turns are a transcript: quiet uppercase role labels,
assistant prose at a readable measure, user turns as compact right-aligned cards. The
layout is a single column capped at 860px with one scroll region (the transcript), so the
composer never moves and the page itself never scrolls.

## Color

| Token | Dark (default) | Light |
| --- | --- | --- |
| `--bg` | `#14120f` | `#f6f2ec` |
| `--surface` | `#1c1a16` | `#fffdfa` |
| `--surface-2` | `#242019` | `#f4efe6` |
| `--border` | `#363027` | `#ded4c4` |
| `--border-strong` | `#4a4235` | `#c9bda8` |
| `--text` | `#f3ede4` | `#221d16` |
| `--text-muted` | `#a89e90` | `#6c6353` |
| `--text-faint` | `#7d7466` | `#8b8375` |
| `--accent` | `#e0853c` | `#b0541a` |
| `--danger` | `#f08a7c` | `#b3261e` |
| `--success` | `#8ec07c` | `#3f6b2f` |

`--accent-soft` is `--accent` at 14% alpha; use it for user turns, never for large areas.

## Type

- UI: `system-ui, -apple-system, "Segoe UI", Roboto, ...`
- Mono (role labels, model chip, code, counters): `ui-monospace, SFMono-Regular, SF Mono, Menlo, ...`
- Base 16px / 1.6. Assistant prose `0.9875rem` at `--measure: 68ch`. Role labels 11px,
  uppercase, `letter-spacing: 0.09em`. Empty-state title `clamp(1.5rem, 4.2vw, 2rem)` at
  `-0.025em`.

## Space, radius, motion

- Scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 px (`--space-1` … `--space-7`).
- Radius: 6 (chips, inline code), 10 (controls, cards), 16 (composer, user turn).
- Easing `--ease: cubic-bezier(0.22, 0.61, 0.36, 1)`; transitions 140ms, entrance 220ms.
- Focus is always visible: `--focus: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent)`.
- `prefers-reduced-motion: reduce` disables animation and transition durations.

## Rules

1. One accent per screen, used for labels, the streaming caret, and primary actions only.
2. Touch targets are at least 40px tall; 44px on mobile.
3. Nothing below 11px, and mono is never used for prose.
4. New interactive elements need a visible focus state and an accessible name.
5. Responsive breakpoints: 720px (single-column prompt grid, compact header) and 1024px
   (extra transcript padding). Verified at 375, 768, 1024 and 1440px.
