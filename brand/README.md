# Kraddle brand v1.0

Open `kraddle-brand-board.html` in a browser for the full board: mark, color, type, motifs and examples in use. It loads fonts from Google Fonts, so it needs a connection.

## Mark

The designer's original mark: two identical halves, each turned half a turn onto the other, with square ends. Stroke width 83.196 on a 621 × 621 frame.

- Ink on paper, or paper on ink. The logo itself is never orange or green.
- Clear space: at least half the mark's width on every side.
- Smallest size: 16px tall on screens. Below that, use the mark without the name.
- Never round the ends, stretch, outline, or add shadows or gradients.
- The name is always lowercase: `kraddle`.

Lockup: the name in Azeret Mono 800, tracking -0.06em. Mark height is 0.82 × the name's font size; the gap is 0.32 × the font size.

`logo/` holds the mark, app icons and lockups in ink and paper. The lockup SVGs use live text, so they need Azeret Mono installed. Convert the text to outlines before sending them to print or to anyone without the font.

## Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| orange | `#FF5A1F` | `#FF6A33` | Main color: buttons, highlights, Kraddle stepping in |
| ink | `#121212` | `#EDEDE9` | Mark, headlines |
| paper | `#EEEEEA` | `#111110` | Ground |
| surface | `#F8F8F6` | `#1A1A18` | Panels, inputs |
| graphite | `#6B6B66` | `#9A9A94` | Secondary text |
| green | `#3C9A5F` | `#5DBB7F` | Small accent, only for "this held" |

Use `orange-text` (`#C4420E` light) for orange text on paper. Text on an orange button is ink. A typical page is about 64% paper, 16% ink, 6% orange and 1% green.

## Type

- Header: Young Serif (one weight)
- Body: Afacad
- Mono and the name: Azeret Mono
- Readouts: Doto (dot matrix), for counters and status only

## Motifs

All drawn from the mark: Turn (loader), Turn step by step, Dots, Dot mark, Brackets, Twins, Nest, Readout. Keep them light and in the background. Text leads.

## Files

- `tokens.css`: CSS variables (`--k-*`) with light and dark themes and the font import.
- `tokens.json`: the same values for other tools.
