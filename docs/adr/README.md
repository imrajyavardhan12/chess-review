# Architecture decision records

Short records of decisions that someone will later ask "why?" about: the context, the decision, the
alternatives and the consequences. Earlier decisions (the client-side engine, the worker pool,
reproducibility, Python as the oracle) are in [ARCHITECTURE.md](../ARCHITECTURE.md#decisions).

| ADR                                         | Decision                                                            |
| ------------------------------------------- | ------------------------------------------------------------------- |
| [0001](0001-tactic-explanations.md)         | Tactic explanations from the engine's own lines, computed when read |
| [0002](0002-free-analysis.md)               | Free analysis on the review board, kept apart from the review       |
| [0003](0003-full-engine.md)                 | The full-strength engine as a verified, opt-in download             |
| [0004](0004-insights.md)                    | Cross-game insights, computed on demand from stored reviews         |
| [0005](0005-time-analysis.md)               | Time analysis from the PGN's clock comments                         |
| [0006](0006-import-export.md)               | Lichess as a source, batch reviews, and review files                |
| [0007](0007-offline-and-low-end-devices.md) | Offline use, low-end devices and accessibility                      |
| [0008](0008-visual-design-system.md)        | Visual design system: the trace as identity, tokens, one shell      |

Each ADR arrives with the pull request that implements it, so a link here resolves once that pull
request is merged.

To add one, copy the shape of an existing ADR, take the next number, and add a row here.
