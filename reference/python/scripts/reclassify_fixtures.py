"""Rebuild the expected reviews in the golden fixtures from their recorded engine output.

For a change to the classification rules only (labels, accuracy, phases), the engine's records are
unchanged, so there is no need to search again: this re-runs `build_review` on each fixture's
recorded `infos` and rewrites `expected`. It needs no engine and no network, and running it on
unchanged rules reproduces every fixture byte for byte (use --check to verify that).

A change to what the engine is asked (settings, the second search) needs make_fixtures.py instead.

    .venv/bin/python scripts/reclassify_fixtures.py [--check]
"""
import json
import sys
from pathlib import Path

import chess

from chessreview.analysis import build_review, load_game

FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "core" / "test" / "fixtures"


def main(check: bool) -> int:
    changed = []
    for path in sorted(FIXTURES.glob("*.json")):
        data = json.loads(path.read_text())
        if "infos" not in data:
            continue  # not a game fixture (book-python.json, math-python.json)
        game, positions, played = load_game(data["pgn"])
        infos = [
            {**i, "best": chess.Move.from_uci(i["best"]) if i["best"] else None} for i in data["infos"]
        ]
        expected = build_review(game, positions, played, infos).to_dict()
        same = expected == data["expected"]
        print(f"{path.name}: {'same' if same else 'changed'}")
        if not same:
            changed.append(path.name)
            if not check:
                data["expected"] = expected
                path.write_text(json.dumps(data, indent=1))
    print(f"{len(changed)} fixture(s) {'differ' if check else 'rewritten'}: {', '.join(changed) or 'none'}")
    return 1 if check and changed else 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv[1:]))
