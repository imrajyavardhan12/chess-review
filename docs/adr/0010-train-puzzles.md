# ADR 0010: Train: puzzles from your own mistakes, checked once and kept on the device

Status: accepted

## Context

A review says what went wrong; practice is what stops it recurring. Every mistake is already a position with
a known better move, so the app can make puzzles from the player's own games, with no puzzle database, no
account and no server. The risk is quality: many mistakes have no single clear answer, and a puzzle with
several fine moves teaches nothing.

## Decision

- **Own games only.** Puzzles come from the games of the player chosen on the page, never from a shared set.
  The position, the answer and the progress are stored in IndexedDB (schema version 2, a `puzzles` store),
  with their own copy of the position, so a puzzle outlives the review it came from.
- **Candidates are the clear mistakes.** In `puzzleCandidates`: a move labelled Mistake, Miss or Blunder that
  cost 20 or more points of win chance, from a position where the player still held between 20 and 90
  percent. Lost and won positions make poor puzzles.
- **A deeper search decides.** `verifyPuzzle` searches the position again at depth 18 or 3 million nodes
  and keeps it only if the best move is the same as in the review, is worth 35 percent or more, and beats
  the second best by 20 points or more. Positions that fail are stored too, marked as checked, so a position
  is searched once. Positions reached by different move orders are merged (`dedupeByPosition`).
- **Checking happens in the background.** The ready puzzles can be played while new ones are found; results
  are saved every four positions, and leaving the page cancels the search and keeps what is done.
- **A fixed schedule, in core.** `answer`, `queue` and `pickNext` in `train.ts` are pure: boxes of 0, 1, 3,
  7, 14 and 30 days, a right answer moves up a box, a wrong one goes back to the first and returns after 10
  minutes. Only the first answer to a puzzle counts, so trying again is practice, not a better score.
- **Answers by board or keyboard.** Dragging, clicking, or typing a move (`moveFromText` takes SAN or UCI),
  so the page works without a pointer.
- **A day's set and a focus.** Train counts the puzzles answered since local midnight against what is still
  to ask, up to a soft goal of 10. Insights links each tactic to `#/train?tactic=<kind>&u=<player>`, which
  narrows the puzzles to that tactic and to the side of it (`p=allowed` or `p=missed`) that the row was about. The day start is passed into `today()`, so core needs no clock or zone.

## Alternatives considered

- **A server or a shared puzzle set.** Would give more puzzles and cross-device progress, and break the rule
  that nothing leaves the device. Practice on your own mistakes is also the stronger case.
- **Trusting the review's best move.** The review runs at the chosen analysis depth, which is shallower;
  checking again at depth 18 removes puzzles whose "best" move was an artefact of a quick search.
- **A spaced-repetition algorithm with per-puzzle ease.** More adaptive, harder to explain and to test.
  The fixed boxes can be read straight off the schedule above.
- **Storing the tactic's perspective** (allowed or missed). Rejected at first, because puzzles already made
  would lack it, so the focus filtered by kind only. Added afterwards: each puzzle stores its side, and
  earlier ones get it from their game's review (see Consequences).

## Consequences

- Progress lives in one browser. Clearing site data, or using another browser, starts again; the storage
  note in the README says so.
- Yield depends on the games. On 40 chess.com games of one player, 23 clear puzzles came out; a player with
  few mistakes will have few puzzles, and the page says so rather than lowering the bar.
- Each puzzle stores the side of its tactic (allowed or missed). Puzzles made before that was kept get it from
  their game's review when the list is read; if the review is gone the side stays unset and is tried again,
  and if the review no longer shows that tactic it is recorded as unknown. Such puzzles are left out of a
  side-specific focus, but not of the unfocused list or of a focus on the tactic alone.
- A stricter check later can re-run older puzzles: each record keeps what it was checked with.

## Evidence

- Core tests for candidates, verification, deduplication, the schedule, the day's count and the focus.
- Storage tests, including the upgrade from schema version 1 to 2; service tests for saving, cancelling and
  answering.
- End-to-end tests for the empty state, typed answers and first-try counting, the focus and its empty state,
  a hostile `tactic` value, accessibility in both themes, and a phone without sideways scrolling.
