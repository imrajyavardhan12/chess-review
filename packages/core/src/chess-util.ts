import { Chess } from 'chess.js'
import type { Color } from './types'

/** First four FEN fields: placement, side to move, castling, en passant. Identifies a position for the book. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

export const turnOf = (fen: string): Color => (fen.split(' ')[1] === 'b' ? 'b' : 'w')
export const fullmoveOf = (fen: string): number => Number(fen.split(' ')[5] ?? 1)

/** Positions with no legal move, or no way to mate. The engine cannot search these. */
export function terminal(fen: string): { winner: Color | null } | null {
  const c = new Chess(fen)
  if (c.isCheckmate()) return { winner: c.turn() === 'w' ? 'b' : 'w' }
  if (c.isStalemate() || c.isInsufficientMaterial()) return { winner: null }
  return null
}

export function legalUci(fen: string): string[] {
  return new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''))
}

export function sanOf(fen: string, uci: string): string {
  const c = new Chess(fen)
  return c.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  }).san
}
