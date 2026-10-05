"""Fetch games from the public chess.com API (no login needed)."""
from dataclasses import dataclass

import requests

API = "https://api.chess.com/pub/player"
# chess.com rejects requests without a descriptive User-Agent
HEADERS = {"User-Agent": "chessreview/0.1 (open-source local game review)"}


@dataclass
class RemoteGame:
    url: str
    pgn: str
    white: str
    black: str
    result: str
    time_class: str
    time_control: str
    white_rating: int | None
    black_rating: int | None
    end_time: int


def _get(url: str) -> dict:
    r = requests.get(url, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def list_archives(user: str) -> list[str]:
    return _get(f"{API}/{user.lower()}/games/archives")["archives"]


def _result(g: dict) -> str:
    w, b = g["white"]["result"], g["black"]["result"]
    if w == "win":
        return "1-0"
    if b == "win":
        return "0-1"
    return "1/2-1/2"


def fetch_month(user: str, month: str | None = None) -> list[RemoteGame]:
    """month is 'YYYY/MM'; defaults to the most recent month with games."""
    if month:
        url = f"{API}/{user.lower()}/games/{month}"
    else:
        archives = list_archives(user)
        if not archives:
            return []
        url = archives[-1]
    games = []
    for g in _get(url)["games"]:
        if "pgn" not in g or g.get("rules") != "chess":
            continue
        games.append(
            RemoteGame(
                url=g["url"],
                pgn=g["pgn"],
                white=g["white"]["username"],
                black=g["black"]["username"],
                result=_result(g),
                time_class=g["time_class"],
                time_control=g.get("time_control", ""),
                white_rating=g["white"].get("rating"),
                black_rating=g["black"].get("rating"),
                end_time=g["end_time"],
            )
        )
    return sorted(games, key=lambda g: g.end_time, reverse=True)
