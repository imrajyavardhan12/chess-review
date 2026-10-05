import type { Eval, Label } from './types'

export const ORDER: Label[] = ['Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder']

// color: fills (bars, badges, graph markers); text: CSS variable, darkened on light and lightened on dark so it stays readable
export const META: Record<Label, { color: string; text: string; fg: string; glyph: string }> = {
  Best: { color: '#2E8B62', text: 'var(--t-best)', fg: '#fff', glyph: '!' },
  Excellent: { color: '#5BA77D', text: 'var(--t-excellent)', fg: '#fff', glyph: '' },
  Good: { color: '#A3B57A', text: 'var(--t-good)', fg: '#16222B', glyph: '' },
  Inaccuracy: { color: '#E2B53A', text: 'var(--t-inaccuracy)', fg: '#16222B', glyph: '?!' },
  Mistake: { color: '#D56E24', text: 'var(--t-mistake)', fg: '#fff', glyph: '?' },
  Blunder: { color: '#C8403C', text: 'var(--t-blunder)', fg: '#fff', glyph: '??' },
}

export const isNotable = (l: Label) => l === 'Inaccuracy' || l === 'Mistake' || l === 'Blunder'
export const isKeyMoment = (l: Label) => l === 'Mistake' || l === 'Blunder'

export function evalText(e: Eval): string {
  if (e.mate !== null) return e.mate === 0 ? '#' : `M${Math.abs(e.mate)}`
  return `${e.cp >= 0 ? '+' : '−'}${Math.abs(e.cp / 100).toFixed(1)}`
}

export function moveLabel(number: number, color: 'w' | 'b', san: string): string {
  return `${number}${color === 'w' ? '.' : '…'} ${san}`
}
