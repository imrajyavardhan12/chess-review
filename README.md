# chessreview

Open-source, local-first chess game review: engine analysis, move labels and accuracy.
Uses Stockfish + python-chess. Accuracy uses the published Lichess win%/accuracy formulas.

## Setup
    brew install stockfish
    python3 -m venv .venv && .venv/bin/pip install -e .

## Usage
    chessreview chesscom <username>              # list latest games
    chessreview chesscom <username> --game 3     # review one
    chessreview chesscom <username> --month 2026/09
    chessreview analyze game.pgn                 # review a local PGN
    --depth N                                    # engine depth (default 16)

## Web UI
    cd web && npm install && npm run build && cd ..
    chessreview serve            # http://127.0.0.1:8000
For frontend work run `chessreview serve` plus `npm run dev` in `web/` (proxies /api to :8000).
Reviews are cached in `cache/`, so reopening a game is instant.
Keys: ← → step, Home/End jump, f flips the board, b shows the best move.

## How moves are labelled
Win chance comes from the engine eval (Lichess formula). A move is labelled by how much win chance it gave up:

| Label | Rule |
|---|---|
| Brilliant | within 2% of best, gives up 2+ pawns of material by exchange, and the game isn't already decided (win chance 45–90%) |
| Great | the best move, and the runner-up is 20%+ worse, in a contested position (25–75% win chance) |
| Book | the position is on a known opening line (Lichess chess-openings) |
| Best / Excellent / Good | engine's choice / gave up up to 2% / up to 5% |
| Inaccuracy / Mistake / Blunder | gave up up to 10% / 20% / more |
| Miss | a mistake or blunder right after the opponent made one (10%+), from a position that was at least even |

These are heuristics, not chess.com's proprietary rules, so labels will differ from theirs.
The rating shown in the Report tab is a rough estimate from average centipawn loss, not a calibrated rating.
Accuracy per phase uses Lichess's phase rule: opening to move 10, endgame at six or fewer minor and major pieces.

Opening data: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0.
Run the tests with `.venv/bin/pip install pytest && .venv/bin/pytest`.

## Roadmap
1. [x] CLI: import, classify, accuracy
2. [x] Web UI: board, eval graph, clickable key moments
3. [ ] Tactic explanations (fork, pin, hanging piece, missed mate)
4. [ ] Cross-game stats, clock/time-trouble analysis, opening book
5. [ ] Optional LLM commentary
