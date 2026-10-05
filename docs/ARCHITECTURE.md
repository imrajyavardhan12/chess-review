# Architecture

chessreview analyses chess games in the browser: it runs Stockfish in Web Workers on the visitor's
own CPU, turns the evaluations into move labels and accuracy, and keeps the results in IndexedDB.
There is no backend. The whole product is a static site.

## Layout

```
packages/core     Pure review logic. No DOM, no Node, no engine process.
packages/engine   UCI client, transports (Web Worker, Node process) and the parallel engine pool.
apps/web          The React app, its services layer, and the end-to-end tests.
reference/python  The original implementation, kept as the oracle for core (see its README).
data/             Opening data (Lichess chess-openings, CC0) shared by both implementations.
```

Dependencies point one way: `web -> engine -> core`. `core` is type-checked without Node types
(`packages/core/tsconfig.json`), so an accidental Node or DOM dependency fails the build.

```
PGN ──parseGame──► ParsedGame ──evaluatePositions(Engine)──► EngineRecord[] ──buildReview(book)──► Review
                                        │                                                           │
                              EnginePool ─► UciEngine ─► Worker(Stockfish WASM)             IndexedDB + UI
```

## Decisions

### 1. The engine runs on the client

Hosting Stockfish for every visitor would make cost scale with usage and invite abuse. In the browser
the cost is zero, scales with users, and games never leave the device. The price is device variance
(a phone is slower than a laptop) and a rewrite from Python, both accepted.

### 2. A pool of single-threaded engines, not one multi-threaded engine

The positions of a game are independent, so analysing them on N single-threaded workers scales close
to linearly. Multi-threaded WASM needs `SharedArrayBuffer`, which needs cross-origin isolation headers
that some static hosts cannot set. The pool needs nothing special and works anywhere
(`packages/engine/src/pool.ts`). Workers start lazily and are torn down after 30 s idle
(`EngineHost`), because each holds tens of megabytes.

### 3. Reviews are reproducible

The same game and settings give the same review on any machine. This holds because the engine runs
with one thread and a 16 MB hash, receives `ucinewgame` before every search (so no result depends on
what ran before), and is limited by node count rather than time. The "second search" that finds the
runner-up lists its `searchmoves` in sorted UCI order, because Stockfish builds its root move list in
the order given and a library's move-generation order must not leak into results. Measured: the WASM
build reproduces native Stockfish evaluations exactly on the test games.

### 4. Classification is a pure function of recorded engine output

`buildReview(game, records, book, settings)` has no engine, clock or I/O. The engine's output for a game
is a list of `EngineRecord`s (score, mate, best move, runner-up score). That makes the rules testable
without an engine and lets Python and TypeScript be compared on identical input.

### 5. Python is the oracle

`packages/core/test/parity.test.ts` feeds recorded native-Stockfish output for ten games (real games,
Kasparov–Topalov, the Opera Game, and hand-made promotion, en passant, castling and stalemate cases)
through the TypeScript classifier and requires the Python result: identical labels, notation, positions,
counts, phases and openings, and numbers within Python's rounding.
`packages/engine/test/integration.test.ts` goes one step further and checks the real WASM engine against
the same recorded evaluations.

### 6. A review's identity

`reviewKey(pgn, settings)` hashes the PGN, depth, node limit, hash size, engine build and
`ANALYSIS_VERSION`. Same inputs, same id, on any device. When the rules or the `Review` shape change,
bump `ANALYSIS_VERSION`: old ids stop matching and stale stored reviews are pruned at startup.

### 7. Persistence and resilience

Reviews and in-flight requests live in IndexedDB (`services/storage.ts`), with an in-memory fallback
where it is unavailable. A request is written before analysis starts and removed when it finishes, so a
reload mid-analysis resumes instead of losing work. Analyses queue and run one at a time; cancelling
rejects queued searches and tells the engine to `stop`. Engine failures are reported in terms a user
can act on, and a crashed worker is replaced and its task retried once.

### 8. The lite engine, and the path to the full one

The app ships Stockfish 19 _lite_ (1.8 MB). The full net is 99 MB, which exceeds Cloudflare Pages'
25 MiB file limit and is a heavy first download. Measured against a 6M-node native reference over 30
positions:

| Engine and budget          | Best-move agreement | Mean win-chance error | Positions off by > 5% |
| -------------------------- | ------------------- | --------------------- | --------------------- |
| Native full, 1.5M nodes    | 26/30               | 1.3%                  | n/a                   |
| WASM lite, 1.5M (Standard) | 26/30               | 2.0%                  | 4                     |
| WASM lite, 3M              | 25/30               | 1.7%                  | 2                     |
| WASM lite, 6M (Deep)       | 27/30               | 1.5%                  | 2                     |

Lite has a floor of roughly 1.5% error that more search barely lowers, so label boundaries (2%, 5%,
10%) are fuzzy by about that much. The real quality lever is the full net, whose WASM build is
bit-identical to native Stockfish. Offering it means hosting the file outside Pages (for example R2) and
loading it on demand; `ENGINE_ID` is part of every review's id, so adding it is a configuration change.

### 9. Labels are heuristics, not chess.com's rules

The rules are documented in `packages/core/src/rules.ts` and the README. `GREAT_*` and `BRILLIANT_*` were
tuned against real games (Kasparov–Topalov for brilliancies); they are judgement calls and will be
revisited as more games are reviewed.

### 10. Tactic explanations are computed when a review is read

A mistake says _why_ ("Allows a fork: Nc7+ attacks the king and the rook on a8"), not just what it
cost. The review stores the engine's principal variation for every position (`Review.lines`, up to
`PV_PLIES` = 12 plies); `explainReviewMove` in `packages/core/src/tactics` reads the position, the
move and the two lines either side of it and returns a typed `Explanation` with its sentence, the
line that shows it and the squares to highlight.

- **At read time, not stored.** The detectors are pure functions of data the review already holds,
  so they can improve without bumping `ANALYSIS_VERSION` or re-analysing anything, and only the move
  on screen is explained (a median of 13 ms, 47 ms at worst, on the corpus in Node). Storing the
  lines is the only change to the `Review` (version 4).
- **Their own exchange evaluator.** The detectors judge captures with a geometric static exchange
  (`staticExchange`, with x-rays, without pins) rather than `see`, which searches legal moves and
  cost up to half a second per explanation. They agree on 99.8% of the corpus's captures; `see`
  still decides the Brilliant rule, unchanged.
- **Confirmed by the engine, or not said.** A motif (hanging piece, fork, pin, skewer, discovered
  attack, trapped piece, overloaded defender, mate, back-rank mate) is named only if the engine's own
  line plays it and then wins material with it, and the material matches the difference between the
  best line and the played one. A plain "loses material" claim quotes only the captures in the first
  six plies. When nothing qualifies, the commentary keeps its plain wording.
- **Measured.** On the Lichess puzzle database the detectors agree with Lichess's theme tags at the
  rates in `docs/adr/0001-tactic-explanations.md`, and a hand audit of every explanation given in the
  40-game corpus (`data/corpus`) found no false statement. `scripts/README.md` has the commands.
- **Python parity is unchanged.** The reference implementation does not record lines; the parity
  tests compare every field it produces.

## Changing the rules

1. Change `reference/python/src/chessreview/analysis.py` and its tests.
2. Bump `ANALYSIS_VERSION` in `packages/core/src/rules.ts`.
3. Regenerate fixtures (`reference/python/README.md`) and make `packages/core` match. When only the
   classification changed (not what the engine is asked), `scripts/reclassify_fixtures.py` rebuilds
   the expected reviews from the recorded engine output, with no engine or network.
4. `pnpm check` and `pnpm e2e`.

Adding a label means: the `LABELS` list and `GLYPH` in core, the rule in `buildReview`, a colour in
`apps/web/src/labels.ts` and `styles.css`, and a test for each.

## Security

No backend and no accounts. The deployed site sets a strict Content-Security-Policy
(`apps/web/public/_headers`): scripts and workers from the same origin only, `wasm-unsafe-eval` for the
engine, and `connect-src` limited to `api.chess.com`. The end-to-end tests run under that policy and fail on
any violation. The engine is GPL-3.0 software, so the project is GPL-3.0-or-later and ships the licence and
source pointers with the engine files.

## Known limits and next steps

- Time-trouble analysis: `MoveReview.clockMs` already carries the clock from the PGN.
- The full-strength engine as an optional download.
- Share links for a review (today a review lives on the device that made it).
- Offline use (a service worker for the app shell and engine).
