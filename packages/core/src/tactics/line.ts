import { Chess } from 'chess.js'
import type { Color } from '../types'
import { VALUE, staticExchange, type PieceType } from './board'

/** One move of a line, with the positions either side of it. */
export interface Step {
  before: string
  after: string
  color: Color
  from: string
  to: string
  uci: string
  san: string
  piece: PieceType
  /** What the move took, if anything (a pawn for en passant). */
  captured: PieceType | null
  promotion: PieceType | null
  check: boolean
  mate: boolean
}

/** Plays a UCI line from a position. Stops at the first move that is not legal, so a bad line is cut, never thrown. */
export function replay(fen: string, line: readonly string[]): Step[] {
  const steps: Step[] = []
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return steps
  }
  for (const uci of line) {
    let m
    try {
      m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      break
    }
    steps.push({
      before: m.before,
      after: m.after,
      color: m.color,
      from: m.from,
      to: m.to,
      uci,
      san: m.san,
      piece: m.piece,
      captured: m.captured ?? null,
      promotion: m.promotion ?? null,
      check: m.san.endsWith('+') || m.san.endsWith('#'),
      mate: m.san.endsWith('#'),
    })
  }
  return steps
}

/** Material the mover of `step` wins with it: what it captures, plus what a promotion adds. */
export function gain(step: Step): number {
  return (step.captured ? VALUE[step.captured] : 0) + (step.promotion ? VALUE[step.promotion] - 1 : 0)
}

/** The most the side to move can win by one capture sequence, by static exchange; 0 if nothing. */
export function bestCapture(fen: string): number {
  const captures = new Chess(fen)
    .moves({ verbose: true })
    .filter((m) => m.captured)
    .sort((x, y) => VALUE[y.captured!] - VALUE[x.captured!])
  let best = 0
  for (const m of captures) {
    // An exchange never wins more than the piece it starts by taking.
    if (VALUE[m.captured!] <= best) break
    best = Math.max(best, staticExchange(fen, m.from, m.to))
  }
  return best
}

/**
 * Material `color` gains (negative: loses) along a line, in pawns, settled at the end: if the line
 * stops in the middle of an exchange (its last move a capture), the side to move is credited with
 * what it can still take.
 */
export function outcome(fen: string, line: readonly string[], color: Color): number {
  const steps = replay(fen, line)
  let total = 0
  for (const s of steps) total += (s.color === color ? 1 : -1) * gain(s)
  const last = steps[steps.length - 1]
  if (!last?.captured || last.mate) return total
  return total + (last.color === color ? -1 : 1) * bestCapture(last.after)
}
