import { Chess, type Square } from 'chess.js'
import { PIECE_VALUE } from './rules'

const value = (piece: string): number => PIECE_VALUE[piece] ?? 0

/**
 * Static exchange evaluation: the net material (in pawns) the mover keeps if both sides keep
 * capturing on the destination square with their cheapest piece, each free to stop.
 * Negative means the move gives material away on that square.
 */
export function see(fenBefore: string, uci: string): number {
  const c = new Chess(fenBefore)
  const from = uci.slice(0, 2) as Square
  const to = uci.slice(2, 4) as Square
  const mover = c.get(from)
  if (!mover) throw new Error(`no piece on ${from} in ${fenBefore}`)
  const captured = c.get(to)
  const enPassant = mover.type === 'p' && !captured && from[0] !== to[0]

  const gain = [captured ? value(captured.type) : enPassant ? 1 : 0]
  let attacker = value(mover.type)
  c.move({ from, to, promotion: uci[4] })

  while (gain.length < 14) {
    const captures = c.moves({ verbose: true }).filter((m) => m.to === to && m.captured)
    const next = captures.reduce<(typeof captures)[number] | undefined>(
      (best, m) => (best === undefined || value(m.piece) < value(best.piece) ? m : best),
      undefined,
    )
    if (!next) break
    gain.push(attacker - (gain[gain.length - 1] ?? 0))
    attacker = value(next.piece)
    c.move({ from: next.from, to: next.to, promotion: next.promotion })
  }
  for (let d = gain.length - 1; d > 0; d--) {
    gain[d - 1] = -Math.max(-(gain[d - 1] ?? 0), gain[d] ?? 0)
  }
  return gain[0] || 0 // `|| 0` also turns -0 into 0
}
