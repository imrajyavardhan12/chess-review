# chessreview

Chess game review that runs entirely in the browser (Stockfish WASM in Web Workers, no backend). pnpm workspace:
`packages/core` (pure review logic), `packages/engine` (Stockfish), `apps/web` (UI), `reference/python` (the oracle).

## Commands

- `pnpm check`: case clashes, types, lint, format, unit and integration tests with real Stockfish (~30 s)
- `pnpm e2e`: production build, then Playwright against that build and its CSP
- `pnpm build && pnpm budget`: download-size budget
- `pnpm tactics-eval`, `pnpm label-audit`, `pnpm explain-corpus`: precision of detectors, labels and explanations
- `pnpm build && pnpm screenshots`: regenerate `docs/screenshots/` from real engine reviews

## Verify before you say done

- Every change: run `pnpm check` and quote its summary line (`Tests 358 passed`).
- Changed `apps/web`, the engine worker, `apps/web/public/_headers` or routing: also run `pnpm e2e`.
- UI: open it in Playwright at desktop width and 390 px, in light and dark, and look at the screenshots.
- Bug fix: first write the test that fails because of the bug.
- Detector, label or explanation change: run the matching corpus script and report its numbers.
- Never retry, skip or loosen a test to get green. A flaky test is a bug: find its cause.

## Rules

- `packages/core` stays pure: its tsconfig has `types: []`, so no DOM or Node APIs.
- `packages/core` must reproduce the Python golden fixtures (`packages/core/test/fixtures/`) exactly. To change a
  review rule (label thresholds, accuracy, `ANALYSIS_VERSION`), follow "Changing a rule" in CONTRIBUTING.md.
  Never edit a fixture by hand.
- No LLM calls, telemetry or third-party APIs. Widen the CSP only for one named origin, with an e2e test for it.
- `react-hooks` lint is strict: derive state, load data with `useAsync`, never `setState` in an effect.
- UI design rules (palette, type, one radius, no gradients or card grids): "Things to avoid" in CONTRIBUTING.md.
- `main` takes PRs only. Use the template: Summary, Evidence, Decisions, Not done.
