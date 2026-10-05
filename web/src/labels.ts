import type { Eval, Label } from './types'

export const ORDER: Label[] = ['Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder']

// color: fills (bars, badges, graph markers); text: same hue darkened to read on paper
export const META: Record<Label, { color: string; text: string; fg: string; glyph: string }> = {
  Best: { color: '#2E8B62', text: '#1F6B49', fg: '#fff', glyph: '!' },
  Excellent: { color: '#5BA77D', text: '#2F7A52', fg: '#fff', glyph: '' },
  Good: { color: '#A3B57A', text: '#5E6F3A', fg: '#16222B', glyph: '' },
  Inaccuracy: { color: '#E2B53A', text: '#85630A', fg: '#16222B', glyph: '?!' },
  Mistake: { color: '#D56E24', text: '#A8501A', fg: '#fff', glyph: '?' },
  Blunder: { color: '#C8403C', text: '#A82F2B', fg: '#fff', glyph: '??' },
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
