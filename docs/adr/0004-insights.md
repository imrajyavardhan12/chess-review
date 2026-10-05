# ADR 0004: Cross-game insights, computed on demand from stored reviews

Status: accepted (workstream 4)

## Context

Players review many games and want to know what keeps going wrong. The app stores every review in
IndexedDB and has no server, so statistics must come from the device.

## Decision

- **Pure statistics in core.** `gameFacts(review, player)` reduces one review to the player's side
  (result, accuracy, time class from `TimeControl` by base + 40 × increment, opening family, label
  counts per phase, and tactic tags of their mistakes, misses and blunders). `insights(facts)`
  aggregates: accuracy trend, errors per 100 moves by phase, tactic frequencies, openings and time
  controls with wins/draws/losses, score and accuracy.
- **Tactic tags reuse the explanations** (ADR 0001) rather than a second classifier, so "allowed a
  fork" here means exactly what it means in a review.
- **Computed when the page opens, not stored.** Tagging costs milliseconds per error, so the page
  works in 20 ms slices, shows progress, can be abandoned, and caches per game for the session. A
  stored summary would need a schema change and migration for little gain at today's sizes.
- **Whose insights.** The player defaults to the chess.com name the user last searched for, else the
  name in most reviews; a select lists everyone in the stored reviews.
- **Charts sparingly.** One chart (accuracy over time: one series in the ink colour, crosshair and
  tooltip, click to open the game, with a table view); everything else is a table, which reads better
  for small counts. On narrow screens the error columns show the label glyphs.

## Alternatives considered

- **A web worker for the tagging.** Keeps the page fully responsive with thousands of reviews; not
  needed at the sizes measured, and it can be added behind `factsFor` without changing the page.
- **Precomputed tags in `StoredReview`.** Faster on later visits, but ties stored data to the
  detectors' current version.

## Evidence

- Core tests: time classes, dates, the player's side, per-phase counts, tags of the player's errors
  only, chronological order, opening and time-control tallies, the empty case.
- Storage test for listing all reviews; e2e tests for the empty state and for two reviewed games of
  one player, including switching player.
- 40 reviewed games: about 2.5–3 s to compute in headless Chromium; 60 of 166 errors carried a tag.
