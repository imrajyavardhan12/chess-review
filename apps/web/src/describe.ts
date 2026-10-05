const NAMES: Record<string, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
}
const ORDER = 'kqrbnp'

/**
 * A position in words, for screen readers: each side's pieces by kind, most valuable first, e.g.
 * "White: king g1, queen d1, rooks a1 f1, pawns a2 b2. Black: king g8, …". White to move is said last.
 */
export function describePosition(fen: string): string {
  const [placement = '', turn = 'w'] = fen.split(' ')
  const found: Record<string, string[]> = {}
  placement.split('/').forEach((row, k) => {
    let file = 0
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch)
        continue
      }
      const sq = String.fromCharCode(97 + file) + String(8 - k)
      ;(found[ch] ??= []).push(sq)
      file++
    }
  })
  const side = (white: boolean) =>
    [...ORDER]
      .map((t) => {
        const squares = (found[white ? t.toUpperCase() : t] ?? []).sort()
        if (!squares.length) return ''
        return `${NAMES[t]}${squares.length > 1 ? 's' : ''} ${squares.join(' ')}`
      })
      .filter(Boolean)
      .join(', ')
  return `White: ${side(true)}. Black: ${side(false)}. ${turn === 'w' ? 'White' : 'Black'} to move.`
}
