import { positionKey, replay, type Explanation } from '@chessreview/core'

export interface Arrow {
  startSquare: string
  endSquare: string
  color: string
}

/** What to draw for a tactic on the position the board is showing. */
export interface Overlay {
  arrows: Arrow[]
  /** Squares to ring, most important first. */
  rings: string[]
}

const NONE: Overlay = { arrows: [], rings: [] }

const ALLOWED = 'rgba(200,64,60,0.8)'
const GOOD = '#2E8B62'

/**
 * Draws a tactic only on a position it belongs to: the one just before its key move (an arrow for
 * the move, rings on the squares involved) or just after it (the rings alone). On any other
 * position the squares would point at the wrong pieces, so nothing is drawn.
 */
export function overlayFor(e: Explanation | null, shownFen: string): Overlay {
  if (!e) return NONE
  const shown = positionKey(shownFen)
  if (e.at < 0) return positionKey(e.fen) === shown ? { arrows: [], rings: e.squares } : NONE
  const steps = replay(e.fen, e.line.slice(0, e.at + 1))
  const key = steps[e.at]
  if (!key) return NONE
  if (positionKey(key.before) === shown) {
    const color = e.perspective === 'allowed' ? ALLOWED : GOOD
    return { arrows: [{ startSquare: key.from, endSquare: key.to, color }], rings: e.squares }
  }
  if (positionKey(key.after) === shown) return { arrows: [], rings: e.squares }
  return NONE
}
