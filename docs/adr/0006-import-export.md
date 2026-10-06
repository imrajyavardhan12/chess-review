# ADR 0006: Lichess as a source, batch reviews, and review files

Status: accepted (workstream 6)

## Decisions

- **Lichess games export, from the browser.** `GET https://lichess.org/api/games/user/{name}` with
  `Accept: application/x-ndjson` (a CORS-safelisted header, so no preflight) and `max`, `pgnInJson`,
  `clocks` and `opening`. Only `https://lichess.org` is added to `connect-src`. Variants, aborted games
  and games without a PGN are skipped; computer opponents are named by level.
  _Not verified here:_ the sandbox this was built in cannot reach lichess.org, so CORS was not
  checked from a real browser. Lichess's API is documented and reported to send
  `Access-Control-Allow-Origin: *`; the e2e test mocks that response. Check one real request (home
  page → Games from → Lichess) before relying on it.
- **Batches use the existing queue.** `startMany` awaits each start, so the queue order is the list
  order (concurrent starts have no defined order). Requests were already written before analysis and
  deleted after it; `resumePending` restarts them at start-up, so a batch survives a reload or a
  closed tab. `cancelAll` cancels every running and waiting review. Lists refresh when a review
  finishes.
- **Annotated PGN** uses standard NAGs ($3 !!, $1 !, $6 ?!, $2 ?, $4 ??; a Miss is $2 or $4 by its
  size), `[%eval]` (pawns, or `#N` for a forced mate; none once the game is over) and `[%clk]`, plus a
  short comment for errors and highlights. Any PGN reader can open it; chessreview does not read its
  own annotations back.
- **Review files** are JSON (`format: "chessreview-review"`, `version: 1`) with the id, the PGN and the
  review. Import checks the format and analysis version, re-reads the PGN and requires the positions
  and every move to match it, checks every field's type and the labels against the known set, and
  recomputes the id from the review's settings. A file from older analysis rules is refused with
  advice to review the game again.

## Alternatives considered

- **Importing annotated PGN back.** Would need a parser for our comments and still lacks the engine
  data a review shows; JSON carries everything.
- **A separate batch queue.** The review service already serialises reviews and persists requests;
  a second queue would duplicate both.

## Evidence

- Unit tests: Lichess mapping (results, clocks, variants, computer players, errors); batch order,
  `active`, change notifications, `cancelAll`, `resumePending`; PGN export (re-parsed by chess.js,
  NAGs, `[%eval]`, clocks, 80-column lines); JSON round trip and every rejection path.
- E2E: Lichess list (mocked, under the CSP) → "Review all 2 new games" → reload mid-batch → both
  finish; PGN and JSON downloads; the JSON opened in a fresh browser profile; a bad file refused with
  its reason.
