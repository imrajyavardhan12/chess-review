# Roadmap

Where chessreview is heading, roughly in order. Nothing here needs a server, an account, tracking or
a paid API; anything that would is out of scope.

## Next

- **Firefox and WebKit in CI.** The app uses only APIs both support, but the e2e suite only runs in
  Chromium today.
- **Label quality.** Measure the labels against a larger corpus (`pnpm review-games` and the audit
  script) and tune them through the rule-change procedure, with evidence. One open question: forced
  recaptures that are the only good move are often labelled Great.
- **Explanations for more motifs:** deflection, decoy, interference, zwischenzug, and endgame
  technique (opposition, the square of the pawn).

## Later

- **Share a review without a server.** Encode a review in the URL fragment (compressed), so a link
  carries the whole review and nothing is uploaded.
- **Opening repertoire view.** Where your games leave known theory, and how you score from there.
- **Puzzles from your own mistakes.** Every missed tactic is a position with a known answer.
- **A multi-threaded engine where the host allows cross-origin isolation**, as an option alongside
  the worker pool.

## Not planned

- Accounts, cloud sync, or any backend.
- LLM-written commentary: explanations must be deterministic and private.
- Copying chess.com's proprietary labels; ours are documented heuristics.
