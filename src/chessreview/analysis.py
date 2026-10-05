"""Engine analysis, win%-based move classification and accuracy.

Win% and accuracy formulas are the published Lichess ones, so the numbers are
comparable to Lichess (and close to, but not identical to, chess.com's).
"""
import io
import math
import statistics
from dataclasses import dataclass, field

import chess
import chess.engine
import chess.pgn

MATE_CP = 10_000

# (max win% lost, label); anything above the last threshold is a blunder
THRESHOLDS = [(2, "Excellent"), (5, "Good"), (10, "Inaccuracy"), (20, "Mistake")]


def win_percent(cp: float) -> float:
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def move_accuracy(win_before: float, win_after: float) -> float:
    loss = max(0.0, win_before - win_after)
    acc = 103.1668 * math.exp(-0.04354 * loss) - 3.1669
    return max(0.0, min(100.0, acc))


def classify(loss: float, is_best: bool) -> str:
    if is_best:
        return "Best"
    for limit, label in THRESHOLDS:
        if loss <= limit:
            return label
    return "Blunder"


@dataclass
class MoveReview:
    ply: int
    color: chess.Color
    number: int
    san: str
    uci: str
    best_san: str
    best_uci: str
    eval_before: float  # white-POV centipawns
    eval_after: float
    win_before: float  # mover-POV win%
    win_after: float
    win_loss: float
    accuracy: float
    label: str


@dataclass
class GameReview:
    white: str
    black: str
    result: str
    headers: dict[str, str] = field(default_factory=dict)
    moves: list[MoveReview] = field(default_factory=list)
    win_series: list[float] = field(default_factory=list)  # white win% per position
    fens: list[str] = field(default_factory=list)  # position before move 1, then after each move
    evals: list[dict] = field(default_factory=list)  # {cp, mate} per position, white POV

    def accuracy(self, color: chess.Color) -> float:
        return game_accuracy(self.win_series, self.moves, color)

    def to_dict(self) -> dict:
        return {
            "white": self.white,
            "black": self.black,
            "result": self.result,
            "headers": self.headers,
            "opening": opening_name(self.headers),
            "fens": self.fens,
            "evals": self.evals,
            "win_series": [round(w, 2) for w in self.win_series],
            "moves": [
                {
                    "ply": m.ply,
                    "color": "w" if m.color == chess.WHITE else "b",
                    "number": m.number,
                    "san": m.san,
                    "uci": m.uci,
                    "best_san": m.best_san,
                    "best_uci": m.best_uci,
                    "win_before": round(m.win_before, 2),
                    "win_after": round(m.win_after, 2),
                    "loss": round(m.win_loss, 2),
                    "accuracy": round(m.accuracy, 2),
                    "label": m.label,
                }
                for m in self.moves
            ],
            "accuracy": {
                "white": round(self.accuracy(chess.WHITE), 1),
                "black": round(self.accuracy(chess.BLACK), 1),
            },
            "counts": {
                "white": self.counts(chess.WHITE),
                "black": self.counts(chess.BLACK),
            },
        }

    def counts(self, color: chess.Color) -> dict[str, int]:
        out: dict[str, int] = {}
        for m in self.moves:
            if m.color == color:
                out[m.label] = out.get(m.label, 0) + 1
        return out


def opening_name(headers: dict[str, str]) -> str:
    """Lichess PGNs carry an Opening header; chess.com only an ECOUrl slug."""
    if headers.get("Opening"):
        return headers["Opening"]
    slug = headers.get("ECOUrl", "").rstrip("/").rsplit("/", 1)[-1]
    words = []
    for w in slug.split("-"):
        if any(c.isdigit() for c in w):  # slug continues into the move list
            break
        words.append(w)
    while words and words[-1].lower() in ("with", "and"):  # slug runs on into "...-with-1.e4-g6"
        words.pop()
    return " ".join(words)


def game_accuracy(wins: list[float], moves: list[MoveReview], color: chess.Color) -> float:
    """Average of a volatility-weighted mean and a harmonic mean (Lichess method)."""
    mine = [m for m in moves if m.color == color]
    if not mine:
        return 0.0
    size = max(2, min(8, len(moves) // 10))
    weights, accs = [], []
    for m in mine:
        window = wins[max(0, m.ply - 1) : m.ply - 1 + size]
        sd = statistics.pstdev(window) if len(window) > 1 else 0.5
        weights.append(max(0.5, min(12.0, sd)))
        accs.append(m.accuracy)
    weighted = sum(w * a for w, a in zip(weights, accs)) / sum(weights)
    harmonic = len(accs) / sum(1 / max(a, 0.01) for a in accs)
    return (weighted + harmonic) / 2


def _eval(info: chess.engine.InfoDict) -> dict:
    score = info["score"].white()
    return {"cp": score.score(mate_score=MATE_CP), "mate": score.mate()}


def review_game(
    pgn: str,
    engine_path: str = "stockfish",
    depth: int = 16,
    nodes: int = 1_500_000,
    threads: int = 4,
    progress=None,
) -> GameReview:
    game = chess.pgn.read_game(io.StringIO(pgn))
    if game is None:
        raise ValueError("could not parse PGN")
    h = game.headers
    review = GameReview(h.get("White", "?"), h.get("Black", "?"), h.get("Result", "*"))
    review.headers = dict(h)

    board = game.board()
    positions = [board.copy()]
    played: list[chess.Move] = []
    for mv in game.mainline_moves():
        board.push(mv)
        positions.append(board.copy())
        played.append(mv)

    with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
        engine.configure({"Threads": threads, "Hash": 256})
        infos = []
        for i, pos in enumerate(positions):
            if pos.is_game_over():
                # engine can't search a finished game: score it directly
                winner = pos.outcome().winner
                cp = {chess.WHITE: MATE_CP, chess.BLACK: -MATE_CP}.get(winner, 0)
                infos.append({"cp": cp, "mate": 0 if winner is not None else None, "best": None})
            else:
                info = engine.analyse(pos, chess.engine.Limit(depth=depth, nodes=nodes))
                infos.append({**_eval(info), "best": info["pv"][0]})
            if progress:
                progress(i + 1, len(positions))

    review.win_series = [win_percent(i["cp"]) for i in infos]
    review.fens = [p.fen() for p in positions]
    review.evals = [{"cp": i["cp"], "mate": i["mate"]} for i in infos]

    for i, mv in enumerate(played):
        pos = positions[i]
        color = pos.turn
        w_before, w_after = review.win_series[i], review.win_series[i + 1]
        if color == chess.BLACK:
            w_before, w_after = 100 - w_before, 100 - w_after
        best = infos[i]["best"]
        is_best = best == mv
        loss = 0.0 if is_best else max(0.0, w_before - w_after)
        acc = 100.0 if is_best else move_accuracy(w_before, w_after)
        review.moves.append(
            MoveReview(
                ply=i + 1,
                color=color,
                number=pos.fullmove_number,
                san=pos.san(mv),
                uci=mv.uci(),
                best_san=pos.san(best) if best else "",
                best_uci=best.uci() if best else "",
                eval_before=infos[i]["cp"],
                eval_after=infos[i + 1]["cp"],
                win_before=w_before,
                win_after=w_after,
                win_loss=loss,
                accuracy=acc,
                label=classify(loss, is_best),
            )
        )
    return review
