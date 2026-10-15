import { legalUci, positionKey, turnOf } from './chess-util'
import type { AnalyseRequest, Engine } from './engine'
import { isKeyMoment } from './labels'
import { winPercent } from './winchance'
import { PHASES, type Color, type Label, type Phase, type Review, type Side } from './types'

/**
 * Puzzles made from a player's own mistakes. A review already holds the position before every
 * move, the engine's best move and the line behind it, so a candidate needs no new analysis.
 * Whether the best move is the only good one is a separate question: see `verifyPuzzle`.
 */

/** A mistake has to cost at least this much win chance (percentage points) to be worth a puzzle. */
export const PUZZLE_MIN_LOSS = 20
/** Before the mistake the player must not be lost already, and must not be winning with ease. */
export const PUZZLE_WIN_RANGE = [20, 90] as const

export interface PuzzleCandidate {
  /** Index of the move in `review.moves`; the position is `review.fens[moveIndex]`. */
  moveIndex: number
  fen: string
  /** Who has to find the move. */
  color: Color
  /** The engine's best move (UCI) and the line behind it, starting with that move. */
  solution: string
  solutionSan: string
  line: string[]
  /** What was played in the game instead. */
  playedUci: string
  playedSan: string
  label: Label
  /** Win chance (%) the player gave up, and held before the move. */
  loss: number
  winBefore: number
  phase: Phase
}

const colorOf = (side: Side): Color => (side === 'white' ? 'w' : 'b')

/** Candidates from one review, for the player's side, worst mistakes first. */
export function puzzleCandidates(review: Review, side: Side): PuzzleCandidate[] {
  const color = colorOf(side)
  const out: PuzzleCandidate[] = []
  review.moves.forEach((m, i) => {
    if (m.color !== color || !isKeyMoment(m.label)) return
    if (m.loss < PUZZLE_MIN_LOSS || !m.bestUci || m.bestUci === m.uci) return
    if (m.winBefore < PUZZLE_WIN_RANGE[0] || m.winBefore > PUZZLE_WIN_RANGE[1]) return
    const fen = review.fens[i]
    if (!fen || turnOf(fen) !== color) return
    const line = review.lines[i] ?? []
    out.push({
      moveIndex: i,
      fen,
      color,
      solution: m.bestUci,
      solutionSan: m.bestSan,
      line: line[0] === m.bestUci ? line : [m.bestUci],
      playedUci: m.uci,
      playedSan: m.san,
      label: m.label,
      loss: m.loss,
      winBefore: m.winBefore,
      phase: PHASES.includes(m.phase) ? m.phase : 'middlegame',
    })
  })
  return out.sort((a, b) => b.loss - a.loss)
}

/** The same position can come up in several games; a puzzle is only worth asking once. */
export function dedupeByPosition<T extends { fen: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>()
  return items.filter((it) => {
    const key = positionKey(it.fen)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The best move has to beat every other move by this much win chance, or the puzzle has two answers. */
export const PUZZLE_MIN_GAP = 20
/** ...and has to leave the player at least this well off: a puzzle is not "lose slowly". */
export const PUZZLE_MIN_BEST_WIN = 35

export interface Puzzle extends PuzzleCandidate {
  /** Win chance (%) after the best move, and its lead over the best other move, at puzzle depth. */
  bestWin: number
  gap: number
}

export type PuzzleLimits = Pick<AnalyseRequest, 'depth' | 'nodes'>

const moverWin = (cp: number, color: Color) => winPercent(color === 'w' ? cp : -cp)

/**
 * Searches the position again, deeper than the review did, and keeps the candidate only when the
 * same move is still best and nothing else comes close. Returns null otherwise.
 */
export async function verifyPuzzle(
  c: PuzzleCandidate,
  engine: Engine,
  limits: PuzzleLimits,
  signal?: AbortSignal,
): Promise<Puzzle | null> {
  const others = legalUci(c.fen)
    .filter((m) => m !== c.solution)
    .sort()
  if (others.length === 0) return null
  const best = await engine.analyse({ fen: c.fen, ...limits }, signal)
  if (best.best !== c.solution) return null
  const bestWin = moverWin(best.eval.cp, c.color)
  if (bestWin < PUZZLE_MIN_BEST_WIN) return null
  const alt = await engine.analyse({ fen: c.fen, ...limits, searchMoves: others }, signal)
  const gap = bestWin - moverWin(alt.eval.cp, c.color)
  if (gap < PUZZLE_MIN_GAP) return null
  return { ...c, line: best.pv.length > 0 ? best.pv : c.line, bestWin, gap }
}
