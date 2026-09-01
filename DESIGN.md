---
version: alpha
name: Kraddle-Mintlify-design
description: Mintlify-inspired documentation design reference for Kraddle. Use a dense three-column developer-documentation layout, Inter for prose, Geist Mono for code, restrained mint-green accents, black pill actions, flat white surfaces, and precise hairline borders.

colors:
  primary: "#0a0a0a"
  on-primary: "#ffffff"
  brand-green: "#00d4a4"
  brand-green-deep: "#00b48a"
  brand-green-soft: "#7cebcb"
  canvas: "#ffffff"
  canvas-dark: "#0a0a0a"
  surface: "#f7f7f7"
  surface-code: "#1c1c1e"
  hairline: "#e5e5e5"
  ink: "#0a0a0a"
  steel: "#5a5a5c"
  muted: "#a8a8aa"

typography:
  prose:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.50
  navigation:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.50
  heading-1:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.10
    letterSpacing: -1px
  heading-2:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.20
    letterSpacing: -0.5px
  heading-3:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.25
  code:
    fontFamily: Geist Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.50

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  xxl: 32px
  section: 64px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
  button-accent:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
    border: "1px solid {colors.hairline}"
  code-block:
    backgroundColor: "{colors.surface-code}"
    textColor: "{colors.on-primary}"
    typography: "{typography.code}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  sidebar-item:
    backgroundColor: transparent
    textColor: "{colors.steel}"
    typography: "{typography.navigation}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs} {spacing.md}"
  sidebar-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
---

# Mintlify-Inspired Direction

## Layout

- Use a three-column documentation shell: approximately 240px sidebar, 720px prose column, and 200px table of contents.
- Collapse the right table of contents first, then turn the sidebar into a drawer below desktop widths.
- Keep documentation surfaces dense and flat. Use 32px between major subsections and 16px inside rows.
- Reserve deep shadows for a single featured product mockup, never ordinary documentation cards.

## Visual Language

- Use white as the primary canvas and `#f7f7f7` for quiet active or grouped surfaces.
- Use mint green sparingly for primary accents, focus, active indicators, and confirmations.
- Use black pill buttons as the dominant action on light surfaces.
- Use 12px card radii, 8px code-block radii, and fully rounded buttons.
- Use Inter for all prose and navigation; use Geist Mono only for code and technical identifiers.

## Documentation Components

- Left navigation with uppercase micro section labels and compact active rows.
- Main prose with clear title, description, readable 16px body text, and restrained width.
- Right-side on-page navigation with a mint active indicator.
- Dark code blocks with small language headers and copy controls.
- Hairline-bordered property rows for format fields, types, requirements, and descriptions.
- Warning, note, and evidence callouts should remain quiet and information-dense rather than decorative.

## Do

- Keep the format documentation technical, scannable, and precise.
- Use mint only when an element needs semantic emphasis.
- Show directory trees, byte layouts, and record examples in dark monospace blocks.
- Prefer focused diagrams and bounded relationship views over decorative illustrations.
- Keep all interactions available on mobile with at least 44px touch targets.

## Don't

- Do not use large mint surfaces or mint body text.
- Do not introduce additional decorative accent colors.
- Do not apply heavy shadows to ordinary cards.
- Do not use Geist Mono for prose or Inter for code.
- Do not turn technical documentation into a marketing landing page.
