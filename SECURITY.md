# Security

chessreview has no backend: games, reviews and settings stay in the browser that made them. The
deployed site can only make the requests its Content-Security-Policy allows
(`apps/web/public/_headers`): its own files, and the public game APIs it imports from.

If you find a vulnerability (for example a way around the Content-Security-Policy, or a way for a
crafted PGN or review file to run script), please report it privately through GitHub's
"Report a vulnerability" button on the repository's Security tab rather than in a public issue. If that button is not available, open an issue asking for a private
contact, without details.
