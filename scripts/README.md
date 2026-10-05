# Scripts

| Script               | What                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `copy-engine.mjs`    | Copies the Stockfish WASM build into `apps/web/public/engine` (runs before `dev`/`build`). |
| `build-openings.mjs` | Builds `packages/core/src/data/openings.json` from `data/openings.tsv` (`pnpm data`).      |
| `serve-dist.mjs`     | Serves `apps/web/dist` with the production headers, for e2e tests and local checks.        |
| `review-games.ts`    | Reviews a PGN file with the shipped engine in Node and writes the reviews as JSON lines.   |
| `explain-corpus.ts`  | Runs the tactic explanations over those reviews and reports coverage; `--print` to audit.  |
| `tactics-eval.ts`    | Measures the tactic detectors against the theme tags of the Lichess puzzle database.       |

The `.ts` scripts run the workspace's TypeScript sources directly with Node's type stripping
(`--experimental-transform-types`, plus `ts-hooks.mjs` to resolve extensionless imports), so they
need no build step and no extra dependency. They are type-checked by `pnpm typecheck`.

## Measuring the explanations

    pnpm review-games data/corpus/lichess-40.pgn /tmp/reviews.ndjson --preset standard
    pnpm explain-corpus /tmp/reviews.ndjson            # coverage by label and by kind
    pnpm explain-corpus /tmp/reviews.ndjson --print    # every explanation with its board

Reviewing the 40-game corpus takes about seven minutes on four cores. Results are deterministic, so
the same corpus, preset and engine always give the same explanations.

For the detectors on their own, download the [Lichess puzzle database](https://database.lichess.org/#puzzles)
(CC0), convert the CSV rows to JSON lines with the fields `PuzzleId`, `FEN`, `Moves` and `Themes`, and run

    pnpm tactics-eval puzzles.ndjson [limit] [--examples fork]

`--examples <kind>` prints puzzles where the detector fired but Lichess did not tag that theme, for
checking by hand.
