# ADR 0009: The Scorebook redesign

Status: accepted. It builds on [ADR 0008](0008-visual-design-system.md): the trace and the single yellow
accent stay; the look around them changes.

## Context

ADR 0008 gave the product an identity, but the surface was still a stack of white cards on a blue-grey
ground, in a display face used nowhere else. It read as a generic dashboard, and the dense screens (a review,
the game list, Insights) spent their space on boxes instead of on the numbers and the board.

The new look was designed on a canvas first (three directions for the home screen, then every main screen in
the chosen one), and built from that design.

## Decision

1. **One identity, two themes.** The light theme is a scorebook: pale paper, black ink, hairline rules where
   cards used to be, numbers in a monospace face. The dark theme is a near-black green with the same
   structure and the same yellow. Both are defined once in `tokens.css` with `light-dark()`.
2. **Rules, not boxes.** Sections are separated by a 1 px rule (a strong one above a section, a light one
   between rows) and whitespace. Cards survive only where something is a separate object: the settings panel,
   an error, the batch progress bar. Corners are 4 px, board and panels 6 px.
3. **Numbers are monospace.** Accuracy, clocks, evaluations, move lists, counts and dates use JetBrains Mono;
   everything else uses Schibsted Grotesk. Headlines are heavy (weight 800) with tight tracking.
4. **The trace is bigger and carries the flags.** On the home page and under a review it is a full-width dark
   strip. Its axis labels sit on their own dark chip, so they stay legible over the light fill.
5. **Games get filters.** All, Reviewed, Not reviewed, Wins and Losses, with counts, and one yellow action:
   "Review all N new games". Yellow is still the only accent, now also the primary action of a screen
   (`.cta`).
6. **A new board colour, Sage, is the default.** Slate, Green and Brown stay. Anyone who chose one keeps it.
7. **Train shows where the mistake happened.** A puzzle carries a small trace of its game with the moment
   marked, drawn from the stored review when that game is still on the device.
8. **Fonts.** The text face comes from its package. The monospace face is declared by hand with its Latin
   subset only, because the package's own stylesheet declares six scripts and cost about 2.7 KB of gzipped CSS
   for characters the app never draws in monospace.

## Alternatives

- **A (light) with a separate dark design.** Rejected: two identities to maintain.
- **A bold colour-block "poster" look.** Distinctive, but loud on dense screens; kept on the design canvas
  only.
- **A dark-first look.** The trace reads best on dark, but a light theme would then be an afterthought.

## Consequences

✓ Denser screens: the board, the explanation and the numbers get the room the boxes used.

✓ Accessibility checks (axe, both themes) pass; the dark chip behind the axis labels came out of them.

✗ The stylesheet grew from 7.8 to 8.2 KB gzipped, so the budget in `scripts/check-bundle.mjs` moves from
8 KB to 9 KB.

✗ Text is 16 px where it was 15 px, so some rows are a little taller.
