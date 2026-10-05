"""Engine analysis, win%-based move classification and accuracy.

Win% and accuracy formulas are the published Lichess ones, so the numbers are
comparable to Lichess (and close to, but not identical to, chess.com's).

Move labels, in the order shown to the user:
  Brilliant   near-best move that sacrifices material, in a position that is not already decided
  Great       the best move when the runner-up is 20%+ worse, in a contested position (an "only move"),
              unless it simply takes back a piece the opponent just captured
  Book        a known opening position (Lichess chess-openings, CC0)
  Best / Excellent / Good / Inaccuracy / Mistake / Blunder
              by win-chance lost: 0 (engine's choice), <=2, <=5, <=10, <=20, more
  Miss        a mistake-sized loss right after the opponent made one: the chance was given, not taken
"""
import io
import math
import re
import statistics
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import chess
import chess.engine
import chess.pgn

MATE_CP = 10_000
CP_CLAMP = 1_000  # centipawn losses are clamped so one mate score can't dominate the average

LABELS = [
    "Brilliant", "Great", "Book", "Best", "Excellent", "Good",
    "Inaccuracy", "Mistake", "Miss", "Blunder",
]

# (max win% lost, label); anything above the last threshold is a blunder
THRESHOLDS = [(2, "Excellent"), (5, "Good"), (10, "Inaccuracy"), (20, "Mistake")]

PIECE_VALUE = {
    chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 100,
}

GREAT_GAP = 20  # win% the runner-up must be behind for the best move to count as "Great"
GREAT_RANGE = (25, 75)  # ...and only in a contested position: forced lines in decided games are not "great"
BRILLIANT_SEE = -2  # net material (pawns) given up on the destination square
PHASES = ["opening", "middlegame", "endgame"]


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


def estimate_rating(acpl: float) -> int:
    """Rough performance rating from average centipawn loss: 3100 * e^(-0.01 * ACPL).

    A coarse public fit, not a calibrated rating: engine depth, time control and
    game length all move it. Shown as an estimate only.
    """
    return int(max(100, min(3000, 3100 * math.exp(-0.01 * acpl))) // 10 * 10)


# ---------- opening book ----------

# shared with the TypeScript build: <repo>/data/openings.tsv
DATA = Path(__file__).resolve().parents[4] / "data" / "openings.tsv"


@lru_cache(maxsize=1)
def opening_book() -> tuple[frozenset[str], dict[str, tuple[str, str]]]:
    """(every position on a known opening line, final position -> (ECO, name))."""
    positions: set[str] = set()
    named: dict[str, tuple[str, str]] = {}
    if not DATA.exists():
        return frozenset(), {}
    for line in DATA.read_text().splitlines()[1:]:
        eco, name, pgn = line.split("\t")
        board = chess.Board()
        for tok in pgn.split():
            if re.fullmatch(r"\d+\.", tok):
                continue
            board.push_san(tok)
            positions.add(board.epd())
        named[board.epd()] = (eco, name)
    return frozenset(positions), named


# ---------- board heuristics ----------


def see(board: chess.Board, move: chess.Move) -> int:
    """Static exchange evaluation: net material (in pawns) the mover keeps if both
    sides keep capturing on the destination square with their cheapest piece."""
    to = move.to_square
    b = board.copy(stack=False)
    captured = b.piece_at(to)
    gain = [PIECE_VALUE[captured.piece_type] if captured else (1 if b.is_en_passant(move) else 0)]
    attacker = PIECE_VALUE[b.piece_type_at(move.from_square)]
    b.push(move)
    while len(gain) < 14:
        caps = [m for m in b.legal_moves if m.to_square == to and b.is_capture(m)]
        if not caps:
            break
        nxt = min(caps, key=lambda m: PIECE_VALUE[b.piece_type_at(m.from_square)])
        gain.append(attacker - gain[-1])
        attacker = PIECE_VALUE[b.piece_type_at(nxt.from_square)]
        b.push(nxt)
    for d in range(len(gain) - 1, 0, -1):
        gain[d - 1] = -max(-gain[d - 1], gain[d])
    return gain[0]


def is_recapture(before_prev: chess.Board, prev: chess.Move | None, board: chess.Board, move: chess.Move) -> bool:
    """True when `move` captures on the square where the opponent's last move just captured.
    Taking back is almost always the only sensible move, so it is not "great" however forced it is."""
    return (
        prev is not None
        and before_prev.is_capture(prev)
        and board.is_capture(move)
        and move.to_square == prev.to_square
    )


def game_phase(board: chess.Board) -> str:
    """Opening until move 10, endgame at six or fewer minor/major pieces (Lichess's rule)."""
    pieces = sum(
        len(board.pieces(t, c))
        for t in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
        for c in (chess.WHITE, chess.BLACK)
    )
    if pieces <= 6:
        return "endgame"
    return "opening" if board.fullmove_number <= 10 else "middlegame"


# ---------- results ----------


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
    cp_loss: float
    accuracy: float
    label: str
    phase: str
    gap: float | None = None  # win% the best move beat the runner-up by (only for moves that matched the engine)


@dataclass
class GameReview:
    white: str
    black: str
    result: str
    headers: dict[str, str] = field(default_factory=dict)
    opening: tuple[str, str] | None = None  # (ECO, name) of the deepest book line reached
    moves: list[MoveReview] = field(default_factory=list)
    win_series: list[float] = field(default_factory=list)  # white win% per position
    fens: list[str] = field(default_factory=list)  # position before move 1, then after each move
    evals: list[dict] = field(default_factory=list)  # {cp, mate} per position, white POV

    def accuracy(self, color: chess.Color) -> float:
        return game_accuracy(self.win_series, self.moves, color)

    def counts(self, color: chess.Color) -> dict[str, int]:
        out: dict[str, int] = {}
        for m in self.moves:
            if m.color == color:
                out[m.label] = out.get(m.label, 0) + 1
        return out

    def acpl(self, color: chess.Color) -> float:
        mine = [m.cp_loss for m in self.moves if m.color == color]
        return sum(mine) / len(mine) if mine else 0.0

    def phase_accuracy(self, color: chess.Color) -> dict[str, float | None]:
        out: dict[str, float | None] = {}
        for ph in PHASES:
            accs = [m.accuracy for m in self.moves if m.color == color and m.phase == ph]
            out[ph] = round(sum(accs) / len(accs), 1) if accs else None
        return out

    def to_dict(self) -> dict:
        sides = {"white": chess.WHITE, "black": chess.BLACK}
        opening = (
            {"eco": self.opening[0], "name": self.opening[1]}
            if self.opening
            else {"eco": self.headers.get("ECO", ""), "name": opening_name(self.headers)}
        )
        return {
            "white": self.white,
            "black": self.black,
            "result": self.result,
            "headers": self.headers,
            "opening": opening["name"],
            "eco": opening["eco"],
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
                    "cp_loss": round(m.cp_loss),
                    "accuracy": round(m.accuracy, 2),
                    "label": m.label,
                    "phase": m.phase,
                    "gap": None if m.gap is None else round(m.gap, 1),
                }
                for m in self.moves
            ],
            "accuracy": {k: round(self.accuracy(c), 1) for k, c in sides.items()},
            "counts": {k: self.counts(c) for k, c in sides.items()},
            "phases": {k: self.phase_accuracy(c) for k, c in sides.items()},
            "acpl": {k: round(self.acpl(c)) for k, c in sides.items()},
            "rating_estimate": {k: estimate_rating(self.acpl(c)) for k, c in sides.items()},
        }


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


def _mover(cp: float, color: chess.Color) -> float:
    return cp if color == chess.WHITE else -cp


@dataclass
class Settings:
    """Engine profile. One thread plus a fresh game per position makes results reproducible:
    the same position and node limit always give the same evaluation, on any machine."""

    depth: int = 16
    nodes: int = 1_500_000
    threads: int = 1
    hash_mb: int = 16


def load_game(pgn: str) -> tuple[chess.pgn.Game, list[chess.Board], list[chess.Move]]:
    game = chess.pgn.read_game(io.StringIO(pgn))
    if game is None:
        raise ValueError("could not parse PGN")
    if game.errors:  # python-chess otherwise stops silently at the first illegal move
        raise ValueError(f"invalid PGN: {game.errors[0]}")
    board = game.board()
    positions = [board.copy()]
    played: list[chess.Move] = []
    for mv in game.mainline_moves():
        board.push(mv)
        positions.append(board.copy())
        played.append(mv)
    return game, positions, played


def evaluate_positions(
    positions: list[chess.Board],
    played: list[chess.Move],
    engine_path: str = "stockfish",
    settings: Settings = Settings(),
    progress=None,
) -> list[dict]:
    """The only function that touches the engine. Returns one record per position:
    {cp, mate, best, second_cp}; second_cp is the best alternative to the played move and is
    only searched when the played move matched the engine's choice."""
    limit = chess.engine.Limit(depth=settings.depth, nodes=settings.nodes)
    total = len(positions) + len(played)  # one pass to evaluate, one to find "only moves"
    done = 0

    def tick() -> None:
        nonlocal done
        done += 1
        if progress:
            progress(done, total)

    with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
        engine.configure({"Threads": settings.threads, "Hash": settings.hash_mb})
        infos: list[dict] = []
        for i, pos in enumerate(positions):
            if pos.is_game_over():
                # engine can't search a finished game: score it directly
                winner = pos.outcome().winner
                cp = {chess.WHITE: MATE_CP, chess.BLACK: -MATE_CP}.get(winner, 0)
                infos.append({"cp": cp, "mate": 0 if winner is not None else None, "best": None})
            else:
                info = engine.analyse(pos, limit, game=("pos", i))
                infos.append({**_eval(info), "best": info["pv"][0]})
            tick()

        # Second pass: for moves that matched the engine's choice, search again with that
        # move excluded. A big drop to the runner-up means the move was the only one.
        for i, mv in enumerate(played):
            pos, info = positions[i], infos[i]
            info["second_cp"] = None
            win_best = win_percent(_mover(info["cp"], pos.turn))
            # only contested positions can hold a "Great" move, so only they are worth a second search
            if info["best"] == mv and pos.legal_moves.count() > 1 and GREAT_RANGE[0] <= win_best <= GREAT_RANGE[1]:
                # Stockfish builds its root move list in the order given, so the order changes the search.
                # Sorted UCI is the canonical order, independent of any library's move generator.
                others = sorted((m for m in pos.legal_moves if m != mv), key=lambda m: m.uci())
                second = engine.analyse(pos, limit, root_moves=others, game=("alt", i))
                info["second_cp"] = _eval(second)["cp"]
            tick()
    return infos


def build_review(
    game: chess.pgn.Game,
    positions: list[chess.Board],
    played: list[chess.Move],
    infos: list[dict],
) -> GameReview:
    """Pure: positions + engine records in, a classified review out."""
    h = game.headers
    review = GameReview(h.get("White", "?"), h.get("Black", "?"), h.get("Result", "*"))
    review.headers = dict(h)
    book, named = opening_book()

    review.win_series = [win_percent(i["cp"]) for i in infos]
    review.fens = [p.fen() for p in positions]
    review.evals = [{"cp": i["cp"], "mate": i["mate"]} for i in infos]

    phase_floor = 0
    for i, mv in enumerate(played):
        pos, after = positions[i], positions[i + 1]
        color = pos.turn
        w_before, w_after = review.win_series[i], review.win_series[i + 1]
        if color == chess.BLACK:
            w_before, w_after = 100 - w_before, 100 - w_after
        best = infos[i]["best"]
        is_best = best == mv
        loss = 0.0 if is_best else max(0.0, w_before - w_after)
        cp_before = max(-CP_CLAMP, min(CP_CLAMP, _mover(infos[i]["cp"], color)))
        cp_after = max(-CP_CLAMP, min(CP_CLAMP, _mover(infos[i + 1]["cp"], color)))
        cp_loss = 0.0 if is_best else max(0.0, cp_before - cp_after)
        acc = 100.0 if is_best else move_accuracy(w_before, w_after)

        label = classify(loss, is_best)
        prev_loss = review.moves[-1].win_loss if review.moves else 0.0
        second = infos[i]["second_cp"]
        gap = (w_before - win_percent(_mover(second, color))) if second is not None else None

        if after.epd() in book and loss <= 5:
            label, acc = "Book", 100.0
        elif loss <= 2 and see(pos, mv) <= BRILLIANT_SEE and w_before < 90 and w_after >= 45 and not mv.promotion:
            label = "Brilliant"
        elif (
            is_best
            and gap is not None
            and gap >= GREAT_GAP
            and GREAT_RANGE[0] <= w_before <= GREAT_RANGE[1]
            and not (i > 0 and is_recapture(positions[i - 1], played[i - 1], pos, mv))
        ):
            label = "Great"
        elif label in ("Mistake", "Blunder") and prev_loss >= 10 and w_before >= 50:
            label = "Miss"

        phase_floor = max(phase_floor, PHASES.index(game_phase(pos)))
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
                cp_loss=cp_loss,
                accuracy=acc,
                label=label,
                phase=PHASES[phase_floor],
                gap=gap,
            )
        )

    for pos in positions:
        if pos.epd() in named:
            review.opening = named[pos.epd()]
    return review


def review_game(
    pgn: str,
    engine_path: str = "stockfish",
    settings: Settings = Settings(),
    progress=None,
) -> GameReview:
    game, positions, played = load_game(pgn)
    infos = evaluate_positions(positions, played, engine_path, settings, progress)
    return build_review(game, positions, played, infos)
