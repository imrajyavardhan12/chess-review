# Game corpus

`lichess-40.pgn`: 40 rated games (bullet to classical, 1000 to 2600) from the
[Lichess open database](https://database.lichess.org/), which is released under CC0. They were taken
deterministically (every 97th eligible game) from the games behind the first 50,000 puzzles of the
Lichess puzzle database, so they contain real mistakes. Player names are replaced by "White" and
"Black"; the `Site` header links each game.

Used by `scripts/review-games.ts` to measure the review rules and the tactic explanations on real
games. It is not shipped with the app.
