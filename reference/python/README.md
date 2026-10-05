# Python reference implementation

This is the original Python analysis code, kept as the **oracle** for the TypeScript port in
`packages/core`. It is not shipped. Its jobs:

1. Define the behaviour: `src/chessreview/analysis.py` is the readable specification of the rules.
2. Generate golden fixtures (`scripts/make_fixtures.py`): for a set of real and hand-made games it
   records the raw engine output and the review Python builds from it into
   `packages/core/test/fixtures/`. The TypeScript tests must reproduce those reviews exactly.

## Setup

    python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
    .venv/bin/pytest

## Regenerating fixtures

Needed whenever the rules change (and `ANALYSIS_VERSION` in `packages/core/src/rules.ts` is bumped).
Requires a native Stockfish on `PATH` (`brew install stockfish`) and takes about ten minutes, because it
searches every position of ten games single-threaded and deterministically.

    .venv/bin/python scripts/make_fixtures.py [fixture-name ...]

Then run `npm test` from the repository root. Change the Python first, regenerate, and make the
TypeScript match; never edit a fixture by hand.
