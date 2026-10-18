# chessreview

Chess game review that runs entirely in the browser: Stockfish WASM in Web Workers, no backend, no accounts.
How to contribute (where code goes, the rule-change procedure, what to avoid): @CONTRIBUTING.md
Read `docs/ARCHITECTURE.md` before changing the engine pool, the review pipeline or storage. Its decisions were
measured; don't undo them without new measurements.

## Checks

| Command                                                        | What it covers                                                                                    | When                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm check`                                                   | case clashes, types, lint, format, unit and integration tests with real Stockfish in Node (~30 s) | after every change                                                               |
| `pnpm e2e`                                                     | production build, then Playwright against that build and its CSP                                  | anything in `apps/web`, the engine worker, `apps/web/public/_headers` or routing |
| `pnpm budget`                                                  | download-size budget (run after `pnpm build`)                                                     | new dependency, asset, font or lazy chunk                                        |
| `pnpm tactics-eval`, `pnpm label-audit`, `pnpm explain-corpus` | precision of detectors, labels and explanations on a corpus                                       | changing a detector, label or explanation; put the numbers in the PR             |

## Proving a change works

- Quote the command and its summary line (`Tests 358 passed`), not "tests pass".
- Bug fix: write the test that fails because of the bug first, then fix it.
- Review rules: `packages/core` must reproduce the Python golden fixtures in `packages/core/test/fixtures/` exactly.
  Regenerate fixtures with Stockfish 19 through the procedure in CONTRIBUTING.md; never edit one by hand.
- UI: build, serve and look at it in Playwright at desktop width and 390 px, light and dark. When README-visible
  screens change, `pnpm build && pnpm screenshots` regenerates `docs/screenshots/` from real engine reviews.
- A flaky test is a bug. Find the cause; never retry, loosen an assertion or skip.

## Gotchas

- `packages/core` has `types: []`: a DOM or Node API there fails the typecheck. That's intended.
- `react-hooks` rules are strict: derive state, load data with `useAsync`, never `setState` in an effect.
- Some sandboxes stall the first localhost request; Playwright runs with `--no-proxy-server` for that reason.
- `main` takes pull requests only. Use the PR template (Summary, Evidence, Decisions, Not done).
