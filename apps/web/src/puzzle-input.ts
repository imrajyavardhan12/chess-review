import { legalUci, sanOf } from '@chessreview/core'

const clean = (s: string) =>
  s
    .trim()
    .replace(/[+#!?]/g, '')
    .replace(/^0-0-0$/, 'O-O-O')
    .replace(/^0-0$/, 'O-O')
    .replace(/\s+/g, '')

/**
 * The legal move a typed text stands for, as UCI, or null. Accepts the notation of a score sheet
 * ("Nxd5", "e4", "O-O", with or without check marks) and coordinates ("e2e4"). It does not guess:
 * text that fits more than one move, or none, gives null. Piece letters are case-sensitive, so "nf3" is not a knight move.
 */
export function moveFromText(fen: string, text: string): string | null {
  const t = clean(text)
  if (t === '') return null
  const legal = legalUci(fen)
  const byCoordinates = legal.filter((m) => m === t.toLowerCase())
  if (byCoordinates.length === 1) return byCoordinates[0]!
  const bySan = legal.filter((m) => clean(sanOf(fen, m)) === t)
  return bySan.length === 1 ? bySan[0]! : null
}
