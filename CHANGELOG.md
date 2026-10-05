# Changelog

Notable changes, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/);
versions are the root `package.json` version. A change to the review rules also bumps
`ANALYSIS_VERSION`, which re-analyses stored games; such entries say so.

## Unreleased

Proposed in open pull requests; each entry moves here when it is merged.

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

### Changed

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
