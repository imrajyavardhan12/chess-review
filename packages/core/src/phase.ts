import { fullmoveOf } from './chess-util'
import { PHASES, type Phase } from './types'

/** Opening until move 10, endgame at six or fewer minor and major pieces (Lichess's rule). */
export function gamePhase(fen: string): Phase {
  const placement = fen.split(' ')[0] ?? ''
  const pieces = (placement.match(/[nbrqNBRQ]/g) ?? []).length
  if (pieces <= 6) return 'endgame'
  return fullmoveOf(fen) <= 10 ? 'opening' : 'middlegame'
}

export const phaseIndex = (p: Phase): number => PHASES.indexOf(p)
