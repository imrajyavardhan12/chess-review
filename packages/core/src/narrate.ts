import { isKeyMoment } from './labels'
import type { Color, MoveReview, Review, Side } from './types'

const sideOf = (c: Color): Side => (c === 'w' ? 'white' : 'black')
const pair = (a: number, b: number) => `${a.toFixed(1)} to ${b.toFixed(1)}`

export function moveName(m: Pick<MoveReview, 'number' | 'color' | 'san'>): string {
  return `${m.number}${m.color === 'w' ? '.' : '…'} ${m.san}`
}

export interface Coaching {
  text: string
  /** The move the text is mostly about, so the UI can offer to jump to it. */
  move: MoveReview | null
}

/**
 * A short plain-language read of the game, written from the numbers. Speaks to "you" when we
 * know which side the reader played; otherwise describes both sides by name.
 */
export function coachLine(r: Review, side: Side | null): Coaching {
  const errors = r.moves.filter((m) => isKeyMoment(m.label) && (!side || sideOf(m.color) === side))
  const worst = errors.reduce<MoveReview | null>((w, m) => (w === null || m.loss > w.loss ? m : w), null)

  if (side) {
    const opp: Side = side === 'white' ? 'black' : 'white'
    const a = r.accuracy[side]
    const b = r.accuracy[opp]
    const lead =
      Math.abs(a - b) < 3
        ? `Accuracy was close, ${pair(a, b)}.`
        : a > b
          ? `You played more accurately than ${r[opp]}, ${pair(a, b)}.`
          : `${r[opp]} played more accurately, ${pair(b, a)}.`
    const tail = worst
      ? `Your costliest error was ${moveName(worst)}, which gave up ${Math.round(worst.loss)}% of your win chance.`
      : 'You made no mistakes or blunders.'
    const mine = (label: 'Brilliant' | 'Great') => r.moves.filter((m) => sideOf(m.color) === side && m.label === label)
    const brilliant = mine('Brilliant')
    const great = mine('Great')
    const plural = (n: number) => (n > 1 ? 's' : '')
    const found = brilliant.length
      ? ` You found ${brilliant.length} brilliant move${plural(brilliant.length)}.`
      : great.length
        ? ` You found ${great.length} great move${plural(great.length)}.`
        : ''
    return { text: `${lead} ${tail}${found}`, move: worst ?? brilliant[0] ?? great[0] ?? null }
  }

  const w = r.accuracy.white
  const b = r.accuracy.black
  const lead =
    Math.abs(w - b) < 3
      ? `Accuracy was close, ${pair(w, b)}.`
      : w > b
        ? `${r.white} played more accurately, ${pair(w, b)}.`
        : `${r.black} played more accurately, ${pair(b, w)}.`
  const tail = worst
    ? `The biggest swing was ${moveName(worst)} by ${worst.color === 'w' ? r.white : r.black}, worth ${Math.round(worst.loss)}% of win chance.`
    : 'Neither side made a serious mistake.'
  return { text: `${lead} ${tail}`, move: worst }
}
