# Reading a review

What the numbers and marks in a review mean, and what they do not. The label rules themselves are in the
[README](../README.md#how-moves-are-labelled); this page is about reading the result.

## Win chance, not pawns

The graph under the board is White's win chance after every move: 50% is an even game, the top is a
win for White and the bottom a win for Black. It comes from the engine's score through the logistic curve
Lichess publishes, so it is the same number on every device.

Labels follow the _drop_ in that line, not the loss of material. Giving up a pawn costs a lot of win chance in
an even game and almost none in a game that is already won or lost, so a move can be "Good" while it drops a pawn,
and a quiet move can be a "Mistake". When a label surprises you, look at the graph at that move first.

## Accuracy

Each move gets an accuracy from the win chance it gave up: the engine's best move scores 100, and a move that
gives up 10 points scores about 64. The game's accuracy for each side is a blend of two averages of those
move scores, a mean that weights the volatile stretches of the game more, and a harmonic mean, which one bad
move pulls down hard (the Lichess method).

- One blunder costs far more than steady small inaccuracies. That is intended: it is how games are lost.
- 100% is not the aim. Even strong players give up a little on most moves.
- It is not chess.com's "accuracy" or any other site's number. Compare your own games with each other, over
  time (Insights shows the trend), not against a figure from somewhere else.

The **rating estimate** is a rough fit from average centipawn loss, floored to 10. It moves with the engine,
the time control and the length of the game. Treat it as a mood, not a rating.

## Phases

A position is in the **opening** until move 10, and in the **endgame** once six or fewer queens, rooks,
bishops and knights remain, counting both sides. Everything between is the **middlegame**. Insights counts
errors per 100 moves in each phase, so a short phase is not penalised for being short.

## Why a move was bad

For mistakes, blunders, misses and the great or brilliant moves, the review names the tactic when the
engine's own lines confirm it: a fork, a pin, a hanging piece, a missed or allowed mate, and so on. The squares
involved are ringed on the board.

When the review says only what the move cost, that means no tactic could be confirmed from the lines, not
that there was none. The engine may have seen a positional reason, or the tactic may be deeper than the lines
go.

## How much to trust a single label

- **Depth matters.** A quick analysis can call a move a mistake that a deeper one would excuse, or the other
  way round. The full-strength engine (Settings, Engine) matches desktop Stockfish; the standard one is a smaller engine
  and finishes sooner. Train checks a mistake again at a greater depth before it becomes a puzzle, for this reason.
- **The engine judges the position, not what you could see.** A move can be the only good one and still be
  hard to find; the review says what it was, not how hard it was. The clock analysis shows where you were
  short of time.
- **"Miss" is about the opponent's mistake.** It marks a mistake or blunder made right after the opponent's own
  error (10 points or more), from a position that was at least even. It is the chance you were given and did
  not take.
- **Book moves count as perfect.** A move is Book when the position is on a known opening line and the move
  gave up no more than 5 points. It scores 100% accuracy even if the engine's choice was slightly better.

## Where to go next

- **Insights** shows the patterns across your games: where errors cluster, which tactics catch you out, and how
  you do by opening and time control.
- **Train** turns your clear mistakes into puzzles. See [ADR 0010](adr/0010-train-puzzles.md).
