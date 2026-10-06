import { isKeyMoment } from './labels'
import type { Color, Review, Side, Sides } from './types'

/** A game's clock: starting time and increment per move, in milliseconds. */
export interface Clock {
  baseMs: number
  incrementMs: number
}

/** Reads a PGN TimeControl ("180", "180+2"). Null for daily games, unknown or missing controls. */
export function parseTimeControl(tc: string | undefined): Clock | null {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc?.trim() ?? '')
  if (!m) return null
  const baseMs = Number(m[1]) * 1000
  return baseMs > 0 ? { baseMs, incrementMs: Number(m[2] ?? 0) * 1000 } : null
}

/**
 * Time trouble: less than a tenth of the starting time left, and never more than two minutes, so
 * a long game's trouble starts where a player would feel it.
 */
export function troubleThresholdMs(clock: Clock): number {
  return Math.min(clock.baseMs / 10, 120_000)
}

export interface MoveTime {
  ply: number
  color: Color
  /** On the mover's clock after the move. */
  clockMs: number
  /** Time the move took, increment taken into account; null when it cannot be known. */
  spentMs: number | null
  /** The mover had less than the trouble threshold left before this move. */
  inTrouble: boolean
}

/**
 * Think time per move from the clock comments. Null when the game has no clocks. Each side's first
 * move is timed from the starting clock when the time control is known.
 */
export function moveTimes(review: Pick<Review, 'moves' | 'headers'>): MoveTime[] | null {
  const timed = review.moves.filter((m) => m.clockMs !== null)
  if (timed.length < review.moves.length / 2 || timed.length === 0) return null
  const clock = parseTimeControl(review.headers.TimeControl)
  const threshold = clock ? troubleThresholdMs(clock) : null
  const previous: Record<Color, number | null> = { w: clock?.baseMs ?? null, b: clock?.baseMs ?? null }
  const out: MoveTime[] = []
  for (const m of review.moves) {
    if (m.clockMs === null) {
      previous[m.color] = null
      continue
    }
    const before = previous[m.color]
    const spentMs = before === null ? null : Math.max(0, before - m.clockMs + (clock?.incrementMs ?? 0))
    out.push({
      ply: m.ply,
      color: m.color,
      clockMs: m.clockMs,
      spentMs,
      inTrouble: threshold !== null && before !== null && before < threshold,
    })
    previous[m.color] = m.clockMs
  }
  return out
}

export interface SideTime {
  moves: number
  /** Mean of the moves whose time is known. */
  averageMs: number
  longest: { ply: number; ms: number } | null
  /** Moves made in time trouble, and how many of them were mistakes, misses or blunders. */
  troubleMoves: number
  troubleErrors: number
  /** The same for the moves made with time to spare. */
  calmMoves: number
  calmErrors: number
}

export interface TimeReport {
  clock: Clock | null
  thresholdMs: number | null
  times: MoveTime[]
  sides: Sides<SideTime>
}

/** How each side used its clock, and how often it erred with and without time to spare. Null without clocks. */
export function timeReport(review: Pick<Review, 'moves' | 'headers'>): TimeReport | null {
  const times = moveTimes(review)
  if (!times) return null
  const clock = parseTimeControl(review.headers.TimeControl)
  const label = new Map(review.moves.map((m) => [m.ply, m.label]))
  const side = (c: Color): SideTime => {
    const mine = times.filter((t) => t.color === c)
    const known = mine.filter((t): t is MoveTime & { spentMs: number } => t.spentMs !== null)
    const longest = known.reduce<(MoveTime & { spentMs: number }) | null>(
      (best, t) => (best === null || t.spentMs > best.spentMs ? t : best),
      null,
    )
    const errs = (ts: MoveTime[]) => ts.filter((t) => isKeyMoment(label.get(t.ply)!)).length
    const trouble = mine.filter((t) => t.inTrouble)
    const calm = mine.filter((t) => !t.inTrouble)
    return {
      moves: mine.length,
      averageMs: known.length ? known.reduce((a, t) => a + t.spentMs, 0) / known.length : 0,
      longest: longest ? { ply: longest.ply, ms: longest.spentMs } : null,
      troubleMoves: trouble.length,
      troubleErrors: errs(trouble),
      calmMoves: calm.length,
      calmErrors: errs(calm),
    }
  }
  const sides: Record<Side, SideTime> = { white: side('w'), black: side('b') }
  return { clock, thresholdMs: clock ? troubleThresholdMs(clock) : null, times, sides }
}

/** "1:05", "0:09", "1:02:03" (from milliseconds, rounded down to the second). */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}

/** "12 s", "1.4 s", "2 min 5 s". */
export function formatSpent(ms: number): string {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`
}
