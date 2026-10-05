import type { Color } from '../types'

/** Piece letters as in FEN, lowercase. */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export interface Piece {
  type: PieceType
  color: Color
}

/** Material value in pawns. The king has no material value: it is never won, only mated. */
export const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
export const PIECE_NAME: Record<PieceType, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')
export const sideName = (c: Color): string => (c === 'w' ? 'White' : 'Black')

/** Square index: a1 = 0, h1 = 7, a8 = 56. */
export const index = (sq: string): number => sq.charCodeAt(0) - 97 + (Number(sq[1]) - 1) * 8
export const square = (i: number): string => String.fromCharCode(97 + (i % 8)) + String(Math.floor(i / 8) + 1)
const fileOf = (i: number) => i % 8
const rankOf = (i: number) => Math.floor(i / 8)

const ORTHOGONAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const
const DIAGONAL = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const
const KNIGHT = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
] as const
const KING = [...ORTHOGONAL, ...DIAGONAL]

export type Direction = readonly [df: number, dr: number]

/** Directions a sliding piece moves in; empty for pieces that do not slide. */
export function slides(type: PieceType): readonly Direction[] {
  if (type === 'r') return ORTHOGONAL
  if (type === 'b') return DIAGONAL
  if (type === 'q') return KING
  return []
}

function step(i: number, [df, dr]: Direction): number | null {
  const f = fileOf(i) + df
  const r = rankOf(i) + dr
  return f < 0 || f > 7 || r < 0 || r > 7 ? null : r * 8 + f
}

/**
 * A board read from a FEN, for geometry: what attacks what, what stands behind what.
 * Legality (pins, checks) is left to chess.js; attacks here are the plain lines of fire.
 */
export class Board {
  readonly cells: Array<Piece | null> = new Array<Piece | null>(64).fill(null)
  readonly turn: Color

  constructor(readonly fen: string) {
    const [placement = '', turn = 'w'] = fen.split(' ')
    placement.split('/').forEach((row, k) => {
      let f = 0
      for (const ch of row) {
        if (/\d/.test(ch)) {
          f += Number(ch)
          continue
        }
        const lower = ch.toLowerCase() as PieceType
        this.cells[(7 - k) * 8 + f] = { type: lower, color: ch === lower ? 'b' : 'w' }
        f++
      }
    })
    this.turn = turn === 'b' ? 'b' : 'w'
  }

  at(sq: string): Piece | null {
    return this.cells[index(sq)] ?? null
  }

  /** Squares of every piece of `color`, optionally of one type. */
  pieces(color: Color, type?: PieceType): string[] {
    const out: string[] = []
    this.cells.forEach((p, i) => {
      if (p && p.color === color && (!type || p.type === type)) out.push(square(i))
    })
    return out
  }

  king(color: Color): string | null {
    return this.pieces(color, 'k')[0] ?? null
  }

  /** Squares the piece on `from` attacks (pawns: their capture squares). */
  attacks(from: string): string[] {
    const i = index(from)
    const p = this.cells[i]
    if (!p) return []
    const out: number[] = []
    const jump = (dirs: readonly Direction[]) => {
      for (const d of dirs) {
        const j = step(i, d)
        if (j !== null) out.push(j)
      }
    }
    if (p.type === 'p')
      jump(
        p.color === 'w'
          ? [
              [1, 1],
              [-1, 1],
            ]
          : [
              [1, -1],
              [-1, -1],
            ],
      )
    else if (p.type === 'n') jump(KNIGHT)
    else if (p.type === 'k') jump(KING)
    else {
      for (const d of slides(p.type)) {
        for (let j = step(i, d); j !== null; j = step(j, d)) {
          out.push(j)
          if (this.cells[j]) break
        }
      }
    }
    return out.map(square)
  }

  /** Squares of `color`'s pieces that attack `target`. */
  attackers(target: string, color: Color): string[] {
    return this.pieces(color).filter((s) => this.attacks(s).includes(target))
  }

  /** The first two pieces met walking from `from` in direction `d`, nearest first. */
  ray(from: string, d: Direction): Array<{ square: string; piece: Piece }> {
    const out: Array<{ square: string; piece: Piece }> = []
    for (let j = step(index(from), d); j !== null && out.length < 2; j = step(j, d)) {
      const piece = this.cells[j]
      if (piece) out.push({ square: square(j), piece })
    }
    return out
  }

  /** Material of `color` minus material of the other side, in pawns. */
  material(color: Color): number {
    let total = 0
    for (const p of this.cells) if (p) total += (p.color === color ? 1 : -1) * VALUE[p.type]
    return total
  }
}
