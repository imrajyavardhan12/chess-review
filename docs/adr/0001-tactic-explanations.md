# ADR 0001: Tactic explanations from the engine's own lines, computed when read

Status: accepted (workstream 1)

## Context

A mistake used to say only what it cost ("it cost 12% of win chance; best was Rb4"). Players want
to know _why_. The explanation must be private and deterministic (no LLM, no server) and must never
claim a tactic that is not there.

## Decision

1. **Store the principal variation.** `EngineRecord.pv` and `Review.lines` keep up to 12 plies of
   the engine's line for every position. That is the only change to the stored review, so
   `ANALYSIS_VERSION` goes from 3 to 4. The lines come from the same deterministic search as the
   score, so reviews stay reproducible.
2. **Explain at read time.** `explainReviewMove(review, i)` is a pure function in
   `packages/core/src/tactics`. Nothing about explanations is stored, so detectors can be improved
   without invalidating a single review.
3. **Only what the engine's line shows.** Each detector (hanging piece, fork, pin, skewer, discovered
   attack, trapped piece, overloaded defender) needs the pattern to appear in the line _and_ a later
   capture in that line that wins material by static exchange. Mates come from the engine's mate
   score; a back-rank mate is checked on the final position. The material the motif wins must
   account for the difference between the best line and the played one. A plain "loses material"
   claim quotes only captures in the first six plies. Otherwise the commentary keeps its old wording.
4. **Perspective.** A mistake is explained by what it _allowed_ (the reply line), or what it
   _missed_ (the best line); a Miss leads with what it missed. Great and Brilliant moves are explained
   by what they _do_; a forced recapture is called a recapture, not a win.
5. **A geometric exchange evaluator for the detectors.** `see` (legal-move search) made some
   explanations take half a second. The detectors use `staticExchange` (x-rays, no pins), which
   agrees with `see` on 5,312 of 5,322 captures in the corpus; the disagreements are pins, where it
   errs towards "this capture loses" and so suppresses claims rather than inventing them.

## Alternatives considered

- **Store explanations in the `Review`.** Cheaper to read, but every detector fix would need an
  `ANALYSIS_VERSION` bump and a re-analysis of every stored game. Rejected; explaining one move costs
  a median of 13 ms.
- **Port Lichess's puzzle tagger.** It is AGPL and designed to tag puzzle solutions, which are
  forced lines, not arbitrary engine lines from a game. We use its tags only as a yardstick.
- **Run extra engine searches (threat search, multi-PV) during review.** More signal, but every review
  would take longer for every user. The existing two lines per move proved enough.
- **Extend the Python reference.** The rules for existing fields are unchanged and the explanations
  are new behaviour with their own tests, so the oracle was left alone; parity still covers every
  field Python produces.

## Evidence

**Against Lichess's theme tags** (`pnpm tactics-eval`, the first 50,000 puzzles of the CC0 Lichess
puzzle database; each puzzle's first move is the mistake and the rest the punishing line):

| Detector            | Fired | Agrees with Lichess tag | Recall of the tag |
| ------------------- | ----: | ----------------------: | ----------------: |
| fork                |  6122 |                   85.2% |             66.9% |
| skewer              |  1153 |                   85.6% |             86.3% |
| discovered attack   |  1924 |                   86.0% |             50.2% |
| trapped piece       |   806 |                   90.1% |             87.4% |
| pin                 |   644 |                   70.0% |             13.7% |
| hanging piece       |  7222 |                   31.0% |             99.8% |
| overloaded defender |   635 |                   40.9% |             10.4% |
| back-rank mate      |  3449 |                   44.9% |             98.4% |

Agreement understates precision: Lichess tags a puzzle with only some of its motifs (it tags
`hangingPiece` only when the free capture is the whole puzzle, and most back-rank mates only as
`mate`). So disagreements were checked by hand: 20 drawn blind from puzzles 40,000 onwards (five each
of hanging piece, pin, overloaded defender and back-rank mate) were all true statements. About 60
more were inspected while tuning; the false ones among them (pins that were plain captures, "trapped"
pieces that were really pinned, discovered attacks on pawns) are what the rules above now exclude.

**On real games** (`pnpm review-games` then `pnpm explain-corpus`, the 40-game corpus in
`data/corpus`, Standard preset, the shipped lite engine): explanations were given for 52% of
blunders, 46% of misses, 19% of mistakes, 44% of great moves and 25% of brilliant moves. Every one
of them was read against its board and line; the false or misleading wordings found on the way (a
recapture called "wins the bishop", material quoted from a 10-ply-deep line, a loose pawn named
when a rook was the real loss) were fixed, and none remain.

## Consequences

- `ANALYSIS_VERSION` is 4: reviews made before this change are pruned and re-analysed on demand.
- Explanations can change between releases without touching stored data.
- A few more motifs (deflection without capture, interference, zugzwang) are not detected; those
  moves keep the plain "cost N%" wording.
