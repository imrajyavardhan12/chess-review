# Contributing

Thanks for helping. chessreview reviews chess games entirely in the browser: no backend, no
accounts, no tracking. Contributions should keep it that way.

## Set up

Node 22+ and pnpm 10 (`corepack enable` picks up the version pinned in `package.json`).

    pnpm install
    pnpm dev                     # http://localhost:5173
    pnpm --filter @chessreview/web exec playwright install --with-deps chromium   # once, for e2e

`pnpm install` fetches the Stockfish WASM build; `predev` and `prebuild` copy it into
`apps/web/public/engine`.

## Before you open a pull request

    pnpm check     # types, lint, formatting, unit and integration tests (real Stockfish in Node)
    pnpm e2e       # builds, then runs the browser tests against the production build and its CSP
    pnpm budget    # after a build: the download stays within its size budget

All three run in CI. Tests must be deterministic: never retry or loosen an assertion to make a test
pass, and never skip one. If something is slow or flaky, fix the cause.

For changes to the UI, check it at desktop width and at 390 px, in light and dark themes.

## Where things go

| Change                                    | Put it in                                                        |
| ----------------------------------------- | ---------------------------------------------------------------- |
| Anything about chess or the review itself | `packages/core`, as a pure function with tests (no DOM, I/O)     |
| Talking to Stockfish                      | `packages/engine`                                                |
| Storage, fetching games, queues           | `apps/web/src/services`                                          |
| Screens                                   | `apps/web/src`                                                   |
| A decision someone will later ask "why?"  | a short ADR in `docs/adr/` (see the [index](docs/adr/README.md)) |

`packages/core` stays pure: its tsconfig has `types: []`, so a stray DOM or Node API fails the
typecheck.

## Rules that keep reviews trustworthy

- **Reviews are reproducible.** One thread, a 16 MB hash, `ucinewgame` before each search,
  node-limited searches, `searchmoves` in sorted UCI order. The same game and settings give the
  same review on any device. Don't change these without changing `ANALYSIS_VERSION`.
- **The Python reference is the oracle.** `reference/python` defines the labels, accuracy and
  phases; `packages/core` must reproduce its golden fixtures exactly.
- **Changing a rule** (a label threshold, the accuracy formula, what `ANALYSIS_VERSION` covers):
  1. change `reference/python/src/chessreview/analysis.py` and its tests first;
  2. bump `ANALYSIS_VERSION` in `packages/core/src/rules.ts`;
  3. regenerate the fixtures with Stockfish 19 (`reference/python/README.md`) and make
     `packages/core` match; never edit a fixture by hand;
  4. explain the evidence for the change in the pull request.
- **Explanations are deterministic.** No LLM or remote API, ever: everything a review says must
  follow from the engine's output and be computed on the device.

## Things to avoid

- Telemetry, analytics, trackers, or any paid or third-party API.
- Loosening the Content-Security-Policy in `apps/web/public/_headers`. If a feature needs a new
  origin, add exactly that origin and an e2e test that exercises it.
- New dependencies without a reason. Say in the pull request, in one line, why each is worth it.
- Gradients, card grids, entrance animations, or a second border radius. The design is a cool paper
  palette with Bricolage Grotesque and Geist; spend boldness in one place per screen.

## Code style

Prettier and ESLint decide formatting and most style (`pnpm format`). Hooks follow the strict
`react-hooks` rules: don't call `setState` inside an effect; load data with `useAsync`. Comment the
why, not the what.

## Commits and pull requests

- Commit messages: one short line in the imperative ("Add a pin detector", not "Added pins").
- One focused change per pull request, using the template: Summary, Evidence, Decisions, Not done.
  Claims about speed, quality or size need numbers.

## Licence

By contributing you agree that your work is licensed under GPL-3.0-or-later, like the rest of the
project (Stockfish is GPL-3.0).
