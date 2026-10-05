export type Label = 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder'

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
  accuracy: number
  label: Label
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
  fens: string[]
  evals: Eval[]
  win_series: number[]
  moves: Move[]
  accuracy: { white: number; black: number }
  counts: { white: Counts; black: Counts }
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
