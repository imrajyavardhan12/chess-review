import { legalUci, replay } from '@chessreview/core'

/**
 * Moves the user is trying out from a position of the game. Lives only in the page: it is never
 * stored and never touches the review.
 */
export interface Exploration {
  /** The game position it starts from. */
  root: string
  /** Moves from the root, in UCI. */
  moves: string[]
  /** How many of `moves` are on the board (0: the root). */
  at: number
}

export const explore = (root: string, moves: readonly string[] = [], at = 0): Exploration => ({
  root,
  moves: [...moves],
  at: Math.max(0, Math.min(at, moves.length)),
})

/** The position on the board. */
export function fenOf(x: Exploration): string {
  return replay(x.root, x.moves.slice(0, x.at)).at(-1)?.after ?? x.root
}

/** Steps through the moves already there, clamped to the line. */
export function stepTo(x: Exploration, at: number): Exploration {
  return { ...x, at: Math.max(0, Math.min(at, x.moves.length)) }
}

/**
 * Plays a move on the board. Following the line already there just steps along it; anything else
 * replaces the rest of the line. Returns null for an illegal move. A pawn reaching the last rank
 * becomes a queen unless the move names another piece.
 */
export function play(x: Exploration, from: string, to: string, promotion?: string): Exploration | null {
  const legal = legalUci(fenOf(x))
  const plain = from + to
  const uci =
    legal.find((m) => m === plain + (promotion ?? '')) ??
    legal.find((m) => m === plain) ??
    legal.find((m) => m === plain + 'q')
  if (!uci) return null
  if (x.moves[x.at] === uci) return { ...x, at: x.at + 1 }
  return { ...x, moves: [...x.moves.slice(0, x.at), uci], at: x.at + 1 }
}

/** Squares a piece on `from` can move to. */
export function targets(fen: string, from: string): string[] {
  return [
    ...new Set(
      legalUci(fen)
        .filter((m) => m.startsWith(from))
        .map((m) => m.slice(2, 4)),
    ),
  ]
}

/** A line as clickable moves: SAN with move numbers where a reader expects them. */
export function lineMoves(fen: string, uci: readonly string[]): Array<{ text: string; index: number }> {
  const steps = replay(fen, uci)
  const fullmove = Number(fen.split(' ')[5] ?? 1)
  const offset = steps[0]?.color === 'b' ? 1 : 0
  return steps.map((s, i) => {
    const n = fullmove + Math.floor((i + offset) / 2)
    const text = s.color === 'w' ? `${n}. ${s.san}` : i === 0 ? `${n}… ${s.san}` : s.san
    return { text, index: i }
  })
}
