import chess

from chessreview.analysis import (
    build_review,
    classify,
    estimate_rating,
    game_phase,
    is_recapture,
    load_game,
    move_accuracy,
    opening_book,
    see,
    win_percent,
)


def test_win_percent_is_symmetric_and_monotonic():
    assert win_percent(0) == 50
    assert abs(win_percent(300) + win_percent(-300) - 100) < 1e-9
    assert win_percent(100) < win_percent(200) < win_percent(1000)


def test_accuracy_is_100_for_no_loss_and_falls_with_loss():
    assert move_accuracy(60, 60) > 99.9
    assert move_accuracy(60, 30) < move_accuracy(60, 50) < move_accuracy(60, 59)


def test_classify_thresholds():
    assert classify(0, True) == "Best"
    assert classify(1.5, False) == "Excellent"
    assert classify(4, False) == "Good"
    assert classify(9, False) == "Inaccuracy"
    assert classify(15, False) == "Mistake"
    assert classify(25, False) == "Blunder"


def mv(uci):
    return chess.Move.from_uci(uci)


def test_see_piece_onto_pawn_guarded_square_loses_the_piece():
    # Black pawn d6 guards c5; the undefended bishop walking there is simply lost.
    assert see(chess.Board("4k3/8/3p4/8/8/8/5B2/4K3 w - - 0 1"), mv("f2c5")) == -3


def test_see_free_pawn_is_one():
    # Rook takes an undefended pawn.
    assert see(chess.Board("4k3/8/8/3p4/8/8/8/3RK3 w - - 0 1"), mv("d1d5")) == 1


def test_see_pawn_trade_is_even():
    # exd5 cxd5: a pawn for a pawn.
    assert see(chess.Board("4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1"), mv("e4d5")) == 0


def test_see_quiet_safe_move_is_zero():
    assert see(chess.Board(), mv("g1f3")) == 0


def test_opening_book_knows_common_lines_but_not_nonsense():
    book, named = opening_book()
    b = chess.Board()
    for san in ("e4", "e5", "Nf3", "Nc6", "Bb5"):
        b.push_san(san)
    assert b.epd() in book and b.epd() in named  # Ruy Lopez
    b = chess.Board()
    for san in ("a4", "h5", "a5", "h4"):
        b.push_san(san)
    assert b.epd() not in book


def test_game_phase():
    assert game_phase(chess.Board()) == "opening"
    assert game_phase(chess.Board("r3k2r/pppq1ppp/2n1pn2/3p4/3P4/2N1PN2/PPPQ1PPP/R3K2R w KQkq - 0 12")) == "middlegame"
    assert game_phase(chess.Board("4k3/pp3ppp/8/8/8/8/PP3PPP/R3K2R w - - 0 30")) == "endgame"


def test_rating_estimate_falls_as_acpl_rises_and_is_clamped():
    assert estimate_rating(10) > estimate_rating(40) > estimate_rating(120)
    assert 100 <= estimate_rating(0) <= 3000 and estimate_rating(10_000) == 100


def test_is_recapture():
    board = chess.Board()
    for san in ["e4", "d5"]:
        board.push_san(san)
    exd5 = board.parse_san("exd5")
    after = board.copy()
    after.push(exd5)
    assert is_recapture(board, exd5, after, after.parse_san("Qxd5"))
    assert not is_recapture(board, exd5, after, after.parse_san("Nf6"))  # not a capture
    quiet = board.parse_san("Nf3")
    after_quiet = board.copy()
    after_quiet.push(quiet)
    assert not is_recapture(board, quiet, after_quiet, after_quiet.parse_san("dxe4"))  # nothing was taken
    assert not is_recapture(board, None, board, exd5)  # the first move of the game


def test_great_is_not_given_for_taking_back():
    def label_of_last(pgn):
        game, positions, played = load_game(pgn)
        infos = [{"cp": 0, "mate": None, "best": mv, "second_cp": None} for mv in played]
        infos.append({"cp": 0, "mate": None, "best": None, "second_cp": None})
        # The last move is the only one that holds: the runner-up loses a piece.
        infos[-2]["second_cp"] = 300 if positions[-2].turn == chess.BLACK else -300
        return build_review(game, positions, played, infos).moves[-1].label

    # 3... Qxd5 takes back the pawn that just captured on d5: forced, but not great.
    assert label_of_last("1. e4 d5 2. exd5 Nf6 3. Nc3 Nxd5 4. Nxd5 Qxd5 *") == "Best"
    # The same engine verdict on a move that is not a recapture still earns Great.
    assert label_of_last("1. e4 d5 2. exd5 Nf6 3. Nc3 Nxd5 4. Nxd5 Qd6 *") == "Great"
