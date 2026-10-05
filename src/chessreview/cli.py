import argparse
import datetime as dt
import sys

import chess

from . import chesscom
from .analysis import GameReview, review_game

ORDER = ["Best", "Excellent", "Good", "Inaccuracy", "Mistake", "Blunder"]


def _progress(done: int, total: int) -> None:
    if not sys.stderr.isatty():
        return
    sys.stderr.write(f"\r  analysing {done}/{total}")
    sys.stderr.flush()
    if done == total:
        sys.stderr.write("\n")


def _fmt_eval(cp: float) -> str:
    return f"{cp / 100:+.2f}" if abs(cp) < 9000 else ("+M" if cp > 0 else "-M")


def print_report(r: GameReview) -> None:
    print(f"\n{r.white} vs {r.black}  ({r.result})")
    print("-" * 56)
    print(f"{'':12}{'White':>10}{'Black':>10}")
    print(f"{'Accuracy':12}{r.accuracy(chess.WHITE):>9.1f}%{r.accuracy(chess.BLACK):>9.1f}%")
    cw, cb = r.counts(chess.WHITE), r.counts(chess.BLACK)
    for label in ORDER:
        print(f"{label:12}{cw.get(label, 0):>10}{cb.get(label, 0):>10}")

    key = [m for m in r.moves if m.label in ("Mistake", "Blunder")]
    if key:
        print("\nKey moments")
        for m in key:
            dots = "." if m.color == chess.WHITE else "..."
            print(
                f"  {m.number}{dots} {m.san:<8} {m.label:<10} "
                f"{_fmt_eval(m.eval_before)} -> {_fmt_eval(m.eval_after)}   best: {m.best_san}"
            )


def main() -> None:
    p = argparse.ArgumentParser(prog="chessreview", description="Local chess game review")
    sub = p.add_subparsers(dest="cmd", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--depth", type=int, default=16, help="engine depth (default 16)")
    common.add_argument("--engine", default="stockfish", help="path to UCI engine")

    a = sub.add_parser("analyze", parents=[common], help="review a local PGN file")
    a.add_argument("pgn_file")

    c = sub.add_parser("chesscom", parents=[common], help="review a game from chess.com")
    c.add_argument("username")
    c.add_argument("--month", help="YYYY/MM (default: latest month)")
    c.add_argument("--game", type=int, help="game number from the list (1 = most recent)")

    sub.add_parser("serve", help="start the web UI")

    args = p.parse_args()

    if args.cmd == "serve":
        import uvicorn

        uvicorn.run("chessreview.server:app", host="127.0.0.1", port=8000)
        return

    if args.cmd == "analyze":
        pgn = open(args.pgn_file).read()
    else:
        games = chesscom.fetch_month(args.username, args.month)
        if not games:
            sys.exit("no games found")
        if args.game is None:
            for i, g in enumerate(games[:20], 1):
                when = dt.datetime.fromtimestamp(g.end_time).strftime("%Y-%m-%d")
                print(f"{i:>3}. {when}  {g.time_class:<7} {g.white} vs {g.black}  {g.result}")
            print("\nPick one with --game N")
            return
        pgn = games[args.game - 1].pgn

    print_report(review_game(pgn, args.engine, args.depth, progress=_progress))


if __name__ == "__main__":
    main()
