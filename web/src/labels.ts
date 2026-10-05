import type { Eval, Label } from './types'

export const ORDER: Label[] = [
  'Brilliant',
  'Great',
  'Book',
  'Best',
  'Excellent',
  'Good',
  'Inaccuracy',
  'Mistake',
  'Miss',
  'Blunder',
]

// color: fills (bars, badges, graph markers); text: CSS variable, darkened on light and
// lightened on dark so it stays readable; glyph: chess annotation symbol, '' when there isn't one
export const META: Record<Label, { color: string; text: string; fg: string; glyph: string; help: string }> = {
  Brilliant: { color: '#1ba89b', text: 'var(--t-brilliant)', fg: '#fff', glyph: '!!', help: 'A sacrifice that works out, in a position that was not already decided' },
  Great: { color: '#4c7fd6', text: 'var(--t-great)', fg: '#fff', glyph: '!', help: 'The only move that held the position: the next best was 20% or more worse' },
  Book: { color: '#9c7b5a', text: 'var(--t-book)', fg: '#fff', glyph: '', help: 'A known opening move' },
  Best: { color: '#2e8b62', text: 'var(--t-best)', fg: '#fff', glyph: '★', help: 'The engine’s top choice' },
  Excellent: { color: '#5ba77d', text: 'var(--t-excellent)', fg: '#fff', glyph: '', help: 'Gave up 2% of win chance or less' },
  Good: { color: '#a3b57a', text: 'var(--t-good)', fg: '#16222b', glyph: '', help: 'Gave up 2–5% of win chance' },
  Inaccuracy: { color: '#e2b53a', text: 'var(--t-inaccuracy)', fg: '#16222b', glyph: '?!', help: 'Gave up 5–10% of win chance' },
  Mistake: { color: '#d56e24', text: 'var(--t-mistake)', fg: '#fff', glyph: '?', help: 'Gave up 10–20% of win chance' },
  Miss: { color: '#d0527a', text: 'var(--t-miss)', fg: '#fff', glyph: '×', help: 'A mistake right after the opponent made one: the chance was there and went unused' },
  Blunder: { color: '#c8403c', text: 'var(--t-blunder)', fg: '#fff', glyph: '??', help: 'Gave up more than 20% of win chance' },
}

export const isNotable = (l: Label) =>
  l === 'Brilliant' || l === 'Great' || l === 'Inaccuracy' || l === 'Mistake' || l === 'Miss' || l === 'Blunder'
export const isHighlight = (l: Label) => l === 'Brilliant' || l === 'Great'
export const isKeyMoment = (l: Label) => l === 'Mistake' || l === 'Miss' || l === 'Blunder'
// labels shown in the per-player error tally
export const ERRORS: Label[] = ['Inaccuracy', 'Mistake', 'Miss', 'Blunder']

export function evalText(e: Eval): string {
  if (e.mate !== null) return e.mate === 0 ? '#' : `M${Math.abs(e.mate)}`
  return `${e.cp >= 0 ? '+' : '−'}${Math.abs(e.cp / 100).toFixed(1)}`
}

export function moveLabel(number: number, color: 'w' | 'b', san: string): string {
  return `${number}${color === 'w' ? '.' : '…'} ${san}`
}
