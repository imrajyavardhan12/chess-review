"""Generate golden fixtures for the TypeScript port.

Each fixture holds a PGN, the raw engine records for every position, and the review this Python
reference builds from them. The TypeScript tests feed the same records through the TS
classifier and require an identical review. Engine output is recorded once so the comparison
isolates the classification logic from the engine.

    .venv/bin/python scripts/make_fixtures.py [name ...]
"""
import json
import sys
from dataclasses import asdict
from pathlib import Path

import chess

from chessreview import chesscom
from chessreview.analysis import Settings, build_review, evaluate_positions, load_game

OUT = Path(__file__).resolve().parents[3] / "packages" / "core" / "test" / "fixtures"
# Small node budget keeps regeneration to a minute or so per game. The TS tests do not depend on it.
SETTINGS = Settings(depth=16, nodes=200_000, threads=1, hash_mb=16)

KASPAROV_TOPALOV = """[Event "Hoogovens"]
[White "Kasparov, Garry"]
[Black "Topalov, Veselin"]
[Result "1-0"]

1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.Be3 Bg7 5.Qd2 c6 6.f3 b5 7.Nge2 Nbd7 8.Bh6 Bxh6 9.Qxh6 Bb7 10.a3 e5 11.O-O-O Qe7 12.Kb1 a6 13.Nc1 O-O-O 14.Nb3 exd4 15.Rxd4 c5 16.Rd1 Nb6 17.g3 Kb8 18.Na5 Ba8 19.Bh3 d5 20.Qf4+ Ka7 21.Rhe1 d4 22.Nd5 Nbxd5 23.exd5 Qd6 24.Rxd4 cxd4 25.Re7+ Kb6 26.Qxd4+ Kxa5 27.b4+ Ka4 28.Qc3 Qxd5 29.Ra7 Bb7 30.Rxb7 Qc4 31.Qxf6 Kxa3 32.Qxa6+ Kxb4 33.c3+ Kxc3 34.Qa1+ Kd2 35.Qb2+ Kd1 36.Bf1 Rd2 37.Rd7 Rxd7 38.Bxc4 bxc4 39.Qxh8 Rd3 40.Qa8 c3 41.Qa4+ Ke1 42.f4 f5 43.Kc1 Rd2 44.Qa7 1-0
"""

OPERA = """[Event "Paris"]
[White "Morphy, Paul"]
[Black "Duke of Brunswick and Count Isouard"]
[Result "1-0"]

1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0
"""

# Small hand-checked games for the rules a port tends to get wrong.
EN_PASSANT_CASTLING = """[Event "Synthetic"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 Nf6 2. e5 d5 3. exd6 exd6 4. Nf3 Nc6 5. Bc4 Be7 6. O-O O-O 7. d4 Bg4 8. h3 Bh5 9. Re1 *
"""

# From a FEN: underpromotion with capture.
UNDERPROMOTION = """[Event "Synthetic"]
[White "White"]
[Black "Black"]
[SetUp "1"]
[FEN "1r5k/P7/8/8/8/8/8/K7 w - - 0 1"]
[Result "*"]

1. axb8=N Kg7 2. Nc6 *
"""

# From a FEN: the last move stalemates, so the final position is game over with no engine score.
STALEMATE = """[Event "Synthetic"]
[White "White"]
[Black "Black"]
[SetUp "1"]
[FEN "7k/8/6K1/8/8/8/8/5Q2 w - - 0 1"]
[Result "1/2-1/2"]

1. Qf7 1/2-1/2
"""


def from_chesscom(user: str, pick) -> str:
    return pick(chesscom.fetch_month(user)).pgn


def fixtures():
    games = chesscom.fetch_month("hikaru")
    long_game = next(g for g in games if g.pgn.count(" ") > 400)
    taken = {games[0].pgn, long_game.pgn}
    extra = {}
    for name, pick in {
        "chesscom-bullet": lambda g: g.time_class == "bullet",
        "chesscom-promotion": lambda g: "=Q" in g.pgn,
        "chesscom-draw": lambda g: g.result == "1/2-1/2",
    }.items():
        g = next((g for g in games if pick(g) and g.pgn not in taken), None)
        if g:
            taken.add(g.pgn)
            extra[name] = g.pgn
    return {
        "kasparov-topalov-1999": KASPAROV_TOPALOV,
        "opera-game-1858": OPERA,
        "synthetic-en-passant-castling": EN_PASSANT_CASTLING,
        "synthetic-underpromotion": UNDERPROMOTION,
        "synthetic-stalemate": STALEMATE,
        "chesscom-blitz-mate": games[0].pgn,
        "chesscom-long-endgame": long_game.pgn,
        **extra,
    }


def main(only: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, pgn in fixtures().items():
        if only and name not in only:
            continue
        game, positions, played = load_game(pgn)
        infos = evaluate_positions(positions, played, "stockfish", SETTINGS)
        review = build_review(game, positions, played, infos)
        raw = [
            {"cp": i["cp"], "mate": i["mate"], "best": i["best"].uci() if i["best"] else None,
             "second_cp": i.get("second_cp")}
            for i in infos
        ]
        (OUT / f"{name}.json").write_text(
            json.dumps({"name": name, "pgn": pgn, "settings": asdict(SETTINGS), "infos": raw,
                        "expected": review.to_dict()}, indent=1)
        )
        counts = review.to_dict()["counts"]
        print(f"{name}: {len(played)} plies  W{counts['white']}  B{counts['black']}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
