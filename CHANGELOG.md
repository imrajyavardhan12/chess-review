# Changelog

Notable changes, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/);
versions are the root `package.json` version. A change to the review rules also bumps
`ANALYSIS_VERSION`, which re-analyses stored games; such entries say so.

## Unreleased

Proposed in open pull requests; each entry moves here when it is merged.

### Changed

- A redesigned interface ([ADR 0008](docs/adr/0008-visual-design-system.md)): a home page led by a real
  win-chance trace, a shared header, one settings panel (theme, analysis depth, engine, board colours) in place
  of three selects, a game list grouped by day with result pills and accuracy bars, a review panel where the
  explanation comes first and the move you are on is highlighted in yellow, clocks on the player tags, an
  insights dashboard with headline figures and stacked error bars, and a dark theme defined once with
  `light-dark()`.
- The move list scrolls itself instead of scrolling the whole page.
- `pnpm screenshots` regenerates the README pictures from the real app.

### Fixed

- A name clash between `Insights.tsx` and `insights.ts` that broke the build on macOS and Windows; CI now
  fails on any two files that differ only by case.
- Pressing Load games again now fetches the latest games (it used to do nothing for the same user, and the
  browser could serve a minute-old list).

### Added

- Tactic explanations: each mistake, miss, great and brilliant move says why, from the engine's own
  line (forks, pins, skewers, discovered attacks, hanging and trapped pieces, overloaded defenders,
  back-rank mates). Reviews store the engine's principal variation, so `ANALYSIS_VERSION` 3 → 4
  re-analyses stored games.
- Step through the engine's best line, and explore any position with a live engine.
- An optional full-strength Stockfish 19 engine, downloaded on request (99 MB, verified by size and
  SHA-256) where a deployment hosts it.
- Insights across every game reviewed on the device: accuracy over time, by colour, opening and
  time control, and the tactics most often missed.
- Clock analysis: time spent per move, time trouble, and the mistakes made in it.
- Lichess import, reviewing a whole month at once, and exporting reviews as annotated PGN or JSON
  (and importing the JSON back).
- Offline use after the first visit, an accessible board and graph for screen readers, full keyboard
  operation, fewer engine workers on low-memory devices, and an estimate of the time left.
- Contributor docs, issue and pull request templates, a bundle-size budget in CI.
- A label audit over 240 real games (`pnpm label-audit`, `docs/label-audit.md`).

### Changed

- A recapture is no longer labelled Great (it is Best): half of all Great moves were simply taking
  back a piece. `ANALYSIS_VERSION` 4 → 5 re-analyses stored games. See `docs/label-audit.md`.
- npm → pnpm workspaces.
- CI runs on `ubuntu-24.04` with current major versions of its actions.

## 0.2.0 - 2026-10-05

### Added

- The whole review runs in the browser: Stockfish 19 (lite, WASM) in a pool of Web Workers, the
  analysis ported from Python to TypeScript and checked against Python-generated golden fixtures.
- Brilliant, Great, Book and Miss labels; a report tab with accuracy by phase and a rating estimate.
- Dark mode, board themes, a one-screen review layout, a richer game list.
- Reviews stored in IndexedDB and resumed after a reload.
- A strict Content-Security-Policy, end-to-end tests under it, CI, and the GPL-3.0-or-later licence.

## 0.1.0

- A command-line and local web review of chess.com games, analysed by a native Stockfish (Python).
