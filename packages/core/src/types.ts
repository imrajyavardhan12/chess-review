export const LABELS = [
  'Brilliant',
  'Great',
  'Book',
  'Best',
  'Excellent',
  'Good',
  'Inaccuracy',
  'Mistake',
  'Miss',
  'Blunder',
] as const
export type Label = (typeof LABELS)[number]

export const PHASES = ['opening', 'middlegame', 'endgame'] as const
export type Phase = (typeof PHASES)[number]

export type Color = 'w' | 'b'
export type Side = 'white' | 'black'
export interface Sides<T> {
  white: T
  black: T
}

/** Engine score from White's point of view. `mate` is moves to mate (negative: Black mates), 0 if the game is over. */
export interface Eval {
  cp: number
  mate: number | null
}

/**
 * Everything the review needs from the engine for one position. Reviews are a pure function of
 * these records plus the game, which is what makes them testable without an engine.
 */
export interface EngineRecord extends Eval {
  /** Best move in UCI notation, null for positions with no legal moves. */
  best: string | null
  /** Eval of the best alternative to the played move; only searched when the played move was the engine's choice. */
  secondCp: number | null
}

export type Counts = Partial<Record<Label, number>>

export interface MoveReview {
  ply: number
  color: Color
  /** Fullmove number as printed in the score sheet. */
  number: number
  san: string
  uci: string
  bestSan: string
  bestUci: string
  /** Mover's win chance (%) before and after the move. */
  winBefore: number
  winAfter: number
  /** Win chance given up, in percentage points. Zero when the move was the engine's choice. */
  loss: number
  cpLoss: number
  accuracy: number
  label: Label
  phase: Phase
  /** How far the best move beat the runner-up in win chance; null when not searched. */
  gap: number | null
  /** Time left on the mover's clock after the move, when the PGN carries clock data. */
  clockMs: number | null
}

export interface ReviewSettings {
  depth: number
  nodes: number
  hashMb: number
  /** Identifies the engine build, e.g. "stockfish-19-lite-single". */
  engine: string
}

export interface Review {
  /** Bump when the shape or the analysis rules change, so stored reviews are recomputed. */
  schemaVersion: number
  settings: ReviewSettings
  white: string
  black: string
  result: string
  headers: Record<string, string>
  opening: string
  eco: string
  fens: string[]
  evals: Eval[]
  winSeries: number[]
  moves: MoveReview[]
  accuracy: Sides<number>
  counts: Sides<Counts>
  phases: Sides<Record<Phase, number | null>>
  acpl: Sides<number>
  ratingEstimate: Sides<number>
}
