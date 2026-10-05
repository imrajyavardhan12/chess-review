import { Chess } from 'chess.js'
import { fullmoveOf } from './chess-util'
import type { Color } from './types'

export class InvalidPgnError extends Error {
  override name = 'InvalidPgnError'
}

export interface ParsedMove {
  /** 1-based. */
  ply: number
  color: Color
  /** Fullmove number as printed in the score sheet. */
  number: number
  san: string
  uci: string
  promotion: boolean
  fenBefore: string
  fenAfter: string
  /** Clock after the move, from `[%clk h:mm:ss]` comments, when present. */
  clockMs: number | null
}

export interface ParsedGame {
  headers: Record<string, string>
  startFen: string
  moves: ParsedMove[]
  /** Position before move 1, then after every move. */
  fens: string[]
}

const CLK = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/

/** Parses the first game in a PGN. Throws InvalidPgnError on bad input; never returns a truncated game. */
export function parseGame(pgn: string): ParsedGame {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch (e) {
    throw new InvalidPgnError(e instanceof Error ? e.message : 'could not read PGN')
  }
  const history = chess.history({ verbose: true })
  if (history.length === 0) throw new InvalidPgnError('The PGN has no moves.')

  const clocks = new Map<string, number>()
  for (const { fen, comment } of chess.getComments()) {
    const m = CLK.exec(comment)
    if (m) clocks.set(fen, (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000)
  }

  const moves: ParsedMove[] = history.map((m, i) => ({
    ply: i + 1,
    color: m.color,
    number: fullmoveOf(m.before),
    san: m.san,
    uci: m.from + m.to + (m.promotion ?? ''),
    promotion: m.promotion !== undefined,
    fenBefore: m.before,
    fenAfter: m.after,
    clockMs: clocks.get(m.after) ?? null,
  }))
  const first = moves[0]!
  return {
    headers: chess.getHeaders(),
    startFen: first.fenBefore,
    moves,
    fens: [first.fenBefore, ...moves.map((m) => m.fenAfter)],
  }
}
