import type { Puzzle, PuzzleLimits } from './puzzles'
import type { Perspective } from './tactics/explain'
import type { Phase } from './types'

/**
 * What the Train page keeps for each of a player's mistakes, and how it decides what to ask next.
 * All of it is pure, so the schedule can be tested without a browser or a clock.
 */

const DAY = 24 * 60 * 60 * 1000
/** Days until a puzzle comes back, by box. A right answer moves it up a box, a wrong one back to the first. */
export const BOX_DAYS: readonly number[] = [0, 1, 3, 7, 14, 30]
/** A puzzle answered wrongly is asked again after this long, so it does not repeat straight away. */
export const RETRY_MS = 10 * 60 * 1000

export interface Progress {
  box: number
  /** When the puzzle is next due (ms). Zero for one never asked. */
  due: number
  attempts: number
  solved: number
  lastAt: number | null
}

export const freshProgress = (): Progress => ({ box: 0, due: 0, attempts: 0, solved: 0, lastAt: null })

/** Which side of a tactic the mistake was on. A tactic the player played is not a mistake, so it has no puzzle. */
export type PuzzlePerspective = Exclude<Perspective, 'played'>

/** One checked mistake. `puzzle` is null when the check found no single clear answer; it is kept so the check is not repeated. */
export interface PuzzleRecord {
  id: string
  player: string
  gameId: string
  opponent: string
  date: string | null
  /** The tactic behind the mistake, when the review could name one. */
  tactic: string | null
  /**
   * Whether the player allowed that tactic or missed it. Absent on puzzles made before this was kept; null
   * when it could not be worked out, e.g. the game's review is gone.
   */
  perspective?: PuzzlePerspective | null
  /** What the position was checked with. A stricter check later can re-run the older ones. */
  checkedWith: PuzzleLimits
  puzzle: Puzzle | null
  progress: Progress
}

/** The progress after one answer. */
export function answer(p: Progress, correct: boolean, now: number): Progress {
  const attempts = p.attempts + 1
  const solved = p.solved + (correct ? 1 : 0)
  if (!correct) return { box: 0, due: now + RETRY_MS, attempts, solved, lastAt: now }
  const box = Math.min(p.box + 1, BOX_DAYS.length - 1)
  return { box, due: now + BOX_DAYS[box]! * DAY, attempts, solved, lastAt: now }
}

type Ready = PuzzleRecord & { puzzle: Puzzle }
const ready = (r: PuzzleRecord): r is Ready => r.puzzle !== null

export interface Queue {
  /** Asked before and due again. */
  due: Ready[]
  /** Never asked, biggest mistakes first. */
  fresh: Ready[]
  /** Asked before and not due yet. */
  waiting: Ready[]
}

export function queue(records: readonly PuzzleRecord[], now: number): Queue {
  const all = records.filter(ready)
  return {
    due: all
      .filter((r) => r.progress.attempts > 0 && r.progress.due <= now)
      .sort((a, b) => a.progress.due - b.progress.due),
    fresh: all.filter((r) => r.progress.attempts === 0).sort((a, b) => b.puzzle.loss - a.puzzle.loss),
    waiting: all.filter((r) => r.progress.attempts > 0 && r.progress.due > now),
  }
}

/** The puzzle to ask next, skipping those already asked in this sitting. Due ones come first. */
export function pickNext(
  records: readonly PuzzleRecord[],
  now: number,
  skip: ReadonlySet<string> = new Set(),
): PuzzleRecord | null {
  const q = queue(records, now)
  return [...q.due, ...q.fresh].find((r) => !skip.has(r.id)) ?? null
}

export interface Summary {
  total: number
  due: number
  fresh: number
  attempts: number
  solved: number
  byPhase: Record<Phase, { total: number; attempts: number; solved: number }>
}

export function summarize(records: readonly PuzzleRecord[], now: number): Summary {
  const q = queue(records, now)
  const all = records.filter(ready)
  const byPhase: Summary['byPhase'] = {
    opening: { total: 0, attempts: 0, solved: 0 },
    middlegame: { total: 0, attempts: 0, solved: 0 },
    endgame: { total: 0, attempts: 0, solved: 0 },
  }
  for (const r of all) {
    const s = byPhase[r.puzzle.phase]
    s.total++
    s.attempts += r.progress.attempts
    s.solved += r.progress.solved
  }
  return {
    total: all.length,
    due: q.due.length,
    fresh: q.fresh.length,
    attempts: all.reduce((n, r) => n + r.progress.attempts, 0),
    solved: all.reduce((n, r) => n + r.progress.solved, 0),
    byPhase,
  }
}

/** The tactic of a mistake, from its explanation: what to store on its puzzle. */
export function puzzleTactic(e: { kind: string; perspective: Perspective } | null): {
  tactic: string | null
  perspective: PuzzlePerspective | null
} {
  return e && e.perspective !== 'played'
    ? { tactic: e.kind, perspective: e.perspective }
    : { tactic: null, perspective: null }
}

/**
 * The puzzles whose mistake had this tactic, and, when `perspective` is given, was on that side of it.
 * `null` for the tactic means no focus: everything.
 */
export function withTactic(
  records: readonly PuzzleRecord[],
  tactic: string | null,
  perspective: PuzzlePerspective | null = null,
): readonly PuzzleRecord[] {
  if (tactic === null) return records
  return records.filter((r) => r.tactic === tactic && (perspective === null || r.perspective === perspective))
}

export interface Today {
  /** Puzzles answered since the day began. */
  done: number
  /** Done plus what is still to ask, up to the goal; never below `done`. */
  target: number
}

/**
 * How far along today's set is. The goal is soft: past it the player can carry on, and `target` just
 * follows `done`. `dayStart` is the start of the player's local day (ms), passed in so this needs no clock or zone.
 */
export function today(records: readonly PuzzleRecord[], now: number, dayStart: number, goal: number): Today {
  const done = records.filter((r) => r.puzzle !== null && (r.progress.lastAt ?? 0) >= dayStart).length
  const q = queue(records, now)
  return { done, target: Math.max(done, Math.min(goal, done + q.due.length + q.fresh.length)) }
}
