# ADR 0005: Time analysis from the PGN's clock comments

Status: accepted (workstream 5)

## Context

chess.com and Lichess PGNs carry `[%clk h:mm:ss]` after every move, and `MoveReview.clockMs` already
stores it. Players want to see where their time went and whether time pressure caused their errors.

## Decision

- **Pure functions in core** (`clock.ts`): `parseTimeControl`, `moveTimes`, `timeReport`, and
  formatting. Think time is the previous clock minus this one plus the increment; each side's first
  move is timed from the base time when the time control is known, otherwise left unknown.
- **Time trouble** is having less than `min(base / 10, 2 min)` before a move: 6 s in a 1-minute game,
  18 s in 3 minutes, a minute in 10 minutes, two minutes in anything 20 minutes or longer. It is a
  convention, not a rule from either site; the threshold is shown next to the numbers.
- **Errors in time trouble** are mistakes, misses and blunders, counted against the moves made in
  trouble, next to the same rate for the other moves, so the comparison is honest for players who
  are rarely short of time.
- **Computed when shown, not stored**: no schema change, so it works for every review already on a
  device.
- **The graph** shows both clocks over the game (White solid, Black dashed, each named at its end),
  the time-trouble band, and errors in their label colours; the table beside it has every number.
- **Without clocks** the Report says so and the commentary omits the time line; with clocks but no
  usable time control (daily, missing), think times show but time trouble does not.

## Alternatives considered

- **Time trouble as a fixed number of seconds.** Wrong at both ends: 30 s is half a bullet game and
  nothing in classical.
- **Storing think times in the review.** Duplicates data the review already has.

## Evidence

- Core tests with a hand-computed timed game (increments, first moves, the trouble threshold, error
  counts) and a real chess.com fixture; formatting; games without clocks.
- E2E: think time and "in time trouble" in the commentary, the Time section's graph and numbers, and
  the no-clock message.
