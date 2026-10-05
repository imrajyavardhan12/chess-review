# Label audit

How the move labels behave on real games, measured, with what was done about each finding. Rerun it
after any rule change:

    pnpm review-games data/corpus/lichess-40.pgn reviews.ndjson --preset standard
    pnpm review-games data/corpus/lichess-audit-200.pgn reviews.ndjson --preset standard
    pnpm label-audit reviews.ndjson [--examples Great|Brilliant|Miss|SlowMate]

Reviews are deterministic, so the same corpus, preset and engine always give the same numbers.

## Corpus and settings

240 rated Lichess games (CC0; `data/corpus/`), 19,650 moves, players rated 1506 to 3101, mostly
blitz and rapid. They are the games behind Lichess puzzles, so they contain more tactical errors than
an average game. Reviewed with the shipped engine (Stockfish 19 lite, WASM) at the Standard preset
(1.5M nodes, depth 16), `ANALYSIS_VERSION` 4. Below 1400 there is no data, which is a gap in the
corpus, not in the rules.

## Findings

### 1. Labels track strength and results (sanity check: passes)

| Rating    | Player-games | Mean accuracy | Blunders per 100 moves | Misses per 100 moves |
| --------- | -----------: | ------------: | ---------------------: | -------------------: |
| 1400–1799 |          171 |          64.6 |                    4.5 |                  3.1 |
| 1800–2199 |          235 |          70.3 |                    3.5 |                  2.7 |
| 2200+     |           74 |          79.4 |                    2.6 |                  1.5 |

Accuracy correlates with rating (r = 0.32 over 480 player-games; single games are noisy). The winner
was the more accurate player in 89.7% of the 224 decisive games, with a mean accuracy of 74.9
against 64.1.

### 2. Half of all Great moves are recaptures (rule change proposed)

Great means the engine's choice, the runner-up at least 20 points of win chance worse, in a position
between 25% and 75%. Of the 732 Great moves:

| Kind of move                               | Count | Share |
| ------------------------------------------ | ----: | ----: |
| a recapture on the square just captured on |   353 | 48.2% |
| a way out of check                         |    84 | 11.5% |
| anything else                              |   295 | 40.3% |

Taking back a piece is forced, but it is not a find: 178 of the 240 games had at least one "Great"
recapture, so the label was mostly praising the obvious (bxc6, gxf3, Qxe8 after a capture on that
square). **Proposed rule change** (its own pull request): a recapture is no longer Great (it stays Best). Great falls from 3.7% to
1.9% of moves. The change follows the rule-change procedure in its own pull request: Python first,
`ANALYSIS_VERSION` 4 → 5, fixtures regenerated from their recorded engine output, TypeScript to match.

Check escapes were left alone: finding the only safe square for the king is often a real decision.

### 3. Half of all Misses are worse than a miss (issue filed, no change)

A Miss is a Mistake- or Blunder-sized loss right after the opponent made one (10+ points), from an
even or better position. Of the 518 Misses:

- 314 (61%) lost more than 20 points, the Blunder threshold;
- 281 (54%) gave back more than the opponent had given;
- 196 (38%) left the player worse than even, and 112 (22%) below 30%.

So about 30% of blunder-sized errors (314 of 1,045) are shown as Miss, which sounds milder. Whether
"you missed the punishment" or "you blundered" is the more useful message when both are true is a
product decision, so this is filed as an issue with options rather than changed.

### 4. Brilliant is rare and mostly sound (no change)

55 Brilliant moves, 0.3% of all moves (about one game in four). 85% were the engine's own choice;
the rest were within 2 points of it. By hand, most are real sacrifices: exchange sacrifices, a rook
given for a promoting pawn, Bxh7+ attacks. A few are in dead-level positions (50% before and after),
where giving up material holds a draw rather than wins; they meet the rule as written.

### 5. Won positions are not penalised for a slower win (passes)

No move that kept a won position (99%+ before, 97%+ after) was labelled Inaccuracy or worse. The
win-chance model already flattens differences between winning lines, so choosing a slower mate is
not punished.
