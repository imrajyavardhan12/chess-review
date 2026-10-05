import type { Label } from './types'

/** Bump whenever classification rules or the Review shape change. Part of the cache key. */
export const ANALYSIS_VERSION = 3

export const MATE_CP = 10_000
/** Centipawn losses are clamped so one mate score can't dominate an average. */
export const CP_CLAMP = 1_000

/** Win chance given up, upper bound per label. Anything above the last is a blunder. */
export const LOSS_THRESHOLDS: ReadonlyArray<readonly [number, Label]> = [
  [2, 'Excellent'],
  [5, 'Good'],
  [10, 'Inaccuracy'],
  [20, 'Mistake'],
]

/** Win-chance points the runner-up must trail by for the best move to count as "Great". */
export const GREAT_GAP = 20
/** ...and only in a contested position: forced lines in decided games are not great. */
export const GREAT_RANGE = [25, 75] as const
/** Net material (in pawns) given up on the destination square for a move to count as a sacrifice. */
export const BRILLIANT_SEE = -2
/** A "Book" move may not lose more than this much win chance. */
export const BOOK_MAX_LOSS = 5

export const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
