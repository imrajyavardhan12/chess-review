# ADR 0008: Visual design system

Status: accepted

## Context

The first interface was built for function: native selects and radios, one border radius, three settings
selects repeated at the top of every page, tables for most data, and a review panel that gave the explanation
of a move the same weight as everything around it. It worked, but it looked like a developer tool, and nothing
about it said what the product is for.

## Decision

1. **The win-chance trace is the identity.** It is the one object only this product has, so it carries the
   brand: the home page leads with a real game's trace (`SampleTrace`, generated from a golden fixture by
   `scripts/make-sample.mjs`, so it is real output), the logo mark is a tiny trace, and the full-width trace
   stays on every review. A single accent, signal yellow, means "where you are": the board's last move, the
   graph cursor, the selected move in the score sheet, the "you" tag. It is used nowhere else.
2. **Tokens are defined once.** `styles/tokens.css` holds every colour as `light-dark(light, dark)` and lets
   `color-scheme` pick the side, so the system setting and the manual theme share one definition instead of
   two copies that drift. Space is a 4 px scale; radii are 6 px for controls and 14 px for surfaces. Type is
   Bricolage Grotesque for display and numbers and Geist for text, both already bundled, with tabular numerals
   wherever figures line up.
3. **One shell, one settings panel.** Every page uses `AppHeader` (brand, Games and Insights, settings). The
   three native selects became a popover of real radio groups (theme, analysis depth with a plain explanation of
   each, engine, and board colours shown as swatches). It closes on Escape and an outside press and returns
   focus to its button.
4. **The board is sized by the window, the panel takes the rest.** The board column is as tall as the window
   allows while keeping the board and its controls on one screen; the panel takes the remaining width. The
   trace sits below, a scroll away, because a bigger board matters more than keeping the trace in the first
   screen.
5. **The explanation leads.** In the commentary the move and its glyph come first, then the sentence, then the
   numbers, the best line and the action. Clocks sit on the player tags, the side to move inverted. The move
   list gets the height this frees.
6. **Stylesheets are split by concern** (`tokens`, `base`, `shell`, `home`, `review`, `insights`, `charts`,
   `dialog`) and `styles.css` only imports them. The stylesheet grew from 4.7 to 7.5 KB gzipped against an
   8 KB budget; `pnpm budget` still checks it.

## Consequences

- The accessibility tests (axe, WCAG A/AA, both themes) cover the new panel too, and still pass: contrast is a
  property of the tokens, so it is fixed in one place.
- Tests select by role and accessible name, never by position or class, with a few hooks kept on purpose
  (`.review`, `.gamerow`, `.comment`, `.acc-num`). Moving a control does not break them; renaming one does.
- `light-dark()` needs a current browser (Chrome 123, Safari 17.5, Firefox 120, all from 2024). Older ones
  would show unstyled colours; that is accepted for a tool that already needs WebAssembly workers.
- Screenshots in the README come from `pnpm screenshots`, so they cannot go stale without someone noticing.
