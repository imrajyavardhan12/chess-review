# Game corpus

`lichess-40.pgn`: 40 rated games (bullet to classical, rated 1546 to 3101) from the
[Lichess open database](https://database.lichess.org/), which is released under CC0. They were taken
deterministically (every 97th eligible game) from the games behind the first 50,000 puzzles of the
Lichess puzzle database, so they contain real mistakes. Player names are replaced by "White" and
"Black"; the `Site` header links each game.

Used by `scripts/review-games.ts` to measure the review rules and the tactic explanations on real
games. It is not shipped with the app.

`lichess-audit-200.pgn`: 200 more rated games (rated 1506 to 2776; 2 bullet, 67 blitz, 127 rapid, 4
classical) from the same source, taken the same deterministic way (every 250th eligible game, starting
at the 14th, skipping the 40 above), with at least 15 moves each. Used with `lichess-40.pgn` by the
label audit (`docs/label-audit.md`).
