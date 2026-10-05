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

## Roadmap
1. [x] CLI: import, classify, accuracy
2. [x] Web UI: board, eval graph, clickable key moments
3. [ ] Tactic explanations (fork, pin, hanging piece, missed mate)
4. [ ] Cross-game stats, clock/time-trouble analysis, opening book
5. [ ] Optional LLM commentary
