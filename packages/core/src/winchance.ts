import { CP_CLAMP } from './rules'

/** Win chance (%) for a centipawn score, using the published Lichess logistic fit. */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** Accuracy (0-100) of a single move from the win chance it gave up. Lichess formula. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const loss = Math.max(0, winBefore - winAfter)
  const acc = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669
  return Math.max(0, Math.min(100, acc))
}

export function clampCp(cp: number): number {
  return Math.max(-CP_CLAMP, Math.min(CP_CLAMP, cp))
}

/**
 * Rough performance rating from average centipawn loss: 3100 * e^(-0.01 * ACPL).
 * A coarse public fit, not a calibrated rating. Engine strength, time control and game length all
 * move it, so present it as an estimate only.
 */
export function estimateRating(acpl: number): number {
  const raw = Math.max(100, Math.min(3000, 3100 * Math.exp(-0.01 * acpl)))
  return Math.floor(raw / 10) * 10
}

export const mean = (xs: readonly number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0

/** Population standard deviation. */
export function pstdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/**
 * Game accuracy for one side: the average of a volatility-weighted mean and a harmonic mean of
 * per-move accuracies (the Lichess method). `wins` is White's win chance per position and
 * `plies` the 1-based ply of each of this side's moves, with `totalMoves` the length of the game.
 */
export function gameAccuracy(
  wins: readonly number[],
  mine: ReadonlyArray<{ ply: number; accuracy: number }>,
  totalMoves: number,
): number {
  if (mine.length === 0) return 0
  const size = Math.max(2, Math.min(8, Math.floor(totalMoves / 10)))
  const weights = mine.map((m) => {
    const window = wins.slice(Math.max(0, m.ply - 1), m.ply - 1 + size)
    const sd = window.length > 1 ? pstdev(window) : 0.5
    return Math.max(0.5, Math.min(12, sd))
  })
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const weighted = mine.reduce((acc, m, i) => acc + (weights[i] ?? 0) * m.accuracy, 0) / weightSum
  const harmonic = mine.length / mine.reduce((acc, m) => acc + 1 / Math.max(m.accuracy, 0.01), 0)
  return (weighted + harmonic) / 2
}
