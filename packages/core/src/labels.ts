import type { Label } from './types'

/** Chess annotation symbol for a label; empty when there isn't a conventional one. */
export const GLYPH: Record<Label, string> = {
  Brilliant: '!!',
  Great: '!',
  Book: '',
  Best: '★',
  Excellent: '',
  Good: '',
  Inaccuracy: '?!',
  Mistake: '?',
  Miss: '×',
  Blunder: '??',
}

export const isKeyMoment = (l: Label): boolean => l === 'Mistake' || l === 'Miss' || l === 'Blunder'
export const isHighlight = (l: Label): boolean => l === 'Brilliant' || l === 'Great'
export const isNotable = (l: Label): boolean => isHighlight(l) || isKeyMoment(l) || l === 'Inaccuracy'
/** Labels shown in a player's error tally. */
export const ERROR_LABELS: readonly Label[] = ['Inaccuracy', 'Mistake', 'Miss', 'Blunder']
