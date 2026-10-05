# ADR 0002: Free analysis on the review board, kept apart from the review

Status: accepted (workstream 2)

## Context

Reviews store the engine's line for every position (ADR 0001). Users want to step through those
lines and try their own moves with an engine's opinion, without losing or altering the review.

## Decision

- **One board, two modes.** Moving a piece (drag, or click then click) on the review board starts an
  exploration from the position shown; clicking a move of the best line, or "Step through it" under
  an explanation, starts one seeded with that line. While exploring, the step buttons and arrow keys
  walk the exploration; Esc, "Back to the game", or navigating the game ends it.
- **Page state only.** An `Exploration` (root position, moves, cursor) lives in React state. It is
  never stored and nothing in a `Review` changes, so the review stays reproducible and its id stable.
- **Same engine pool, cancellable, limited.** `LiveAnalysis` runs one search per position through
  `EngineHost` with the user's preset (depth and node limits, so every search ends by itself). The
  hook aborts the search for a position the user has left, which sends `stop` to the engine.
  Results are cached per position and preset (256 entries), so stepping back is instant.
- **Promotion to a queen** unless the move names another piece; there is no promotion picker yet.

## Alternatives considered

- **A separate analysis page.** More room, but it duplicates the board, settings and keyboard
  handling, and loses the review's context (labels, explanations) next to the board.
- **Infinite search with streamed updates.** Feels livelier, but the UCI client resolves one result
  per search and an unbounded search would hold a worker from the review queue. Limited searches
  reuse the existing, tested path.
- **A second engine pool for analysis.** Simpler to reason about, but doubles memory. Reviews and
  analysis rarely run at the same moment.

## Consequences

- No new dependency, no new network access, no change to stored data.
- While a review is running, live analysis waits for a free worker.
