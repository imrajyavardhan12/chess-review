export type Label =
  | 'Brilliant'
  | 'Great'
  | 'Book'
  | 'Best'
  | 'Excellent'
  | 'Good'
  | 'Inaccuracy'
  | 'Mistake'
  | 'Miss'
  | 'Blunder'

export type Phase = 'opening' | 'middlegame' | 'endgame'
export type Sides<T> = { white: T; black: T }

export interface Move {
  ply: number
  color: 'w' | 'b'
  number: number
  san: string
  uci: string
  best_san: string
  best_uci: string
  win_before: number
  win_after: number
  loss: number
  cp_loss: number
  accuracy: number
  label: Label
  phase: Phase
  gap: number | null
}

export interface Eval {
  cp: number
  mate: number | null
}

export type Counts = Partial<Record<Label, number>>

export interface Review {
  white: string
  black: string
  result: string
  headers: Record<string, string>
  opening: string
  eco: string
  fens: string[]
  evals: Eval[]
  win_series: number[]
  moves: Move[]
  accuracy: Sides<number>
  counts: Sides<Counts>
  phases: Sides<Record<Phase, number | null>>
  acpl: Sides<number>
  rating_estimate: Sides<number>
}

export interface RemoteGame {
  id: string
  url: string
  pgn: string
  white: string
  black: string
  result: string
  time_class: string
  time_control: string
  white_rating: number | null
  black_rating: number | null
  end_time: number
  reviewed: boolean
  summary: { accuracy: { white: number; black: number }; spark: number[] } | null
}

export interface GamesResponse {
  month: string | null
  months: string[]
  games: RemoteGame[]
}

export type JobState =
  | { status: 'queued' | 'running'; done: number; total: number }
  | { status: 'error'; error: string }
  | { status: 'done'; review: Review }
