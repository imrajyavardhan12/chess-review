import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { buildBook } from '../../../scripts/build-openings.mjs'
import { createBook, emptyBook, type BookData } from '../src'
import { readFixture, realBook } from './helpers'
import openings from '../src/data/openings.json'

const tsv = readFileSync(fileURLToPath(new URL('../../../data/openings.tsv', import.meta.url)), 'utf8')

describe('opening book', () => {
  it('the committed openings.json is up to date with data/openings.tsv (run `npm run data` if not)', () => {
    expect(buildBook(tsv)).toEqual(openings)
  })

  it('has exactly the same positions and names as the Python reference', () => {
    const py = readFixture<{ positions: string[]; named: Record<string, [string, string]> }>(
      'book-python.json',
    )
    expect(openings.positions).toEqual(py.positions)
    expect(openings.named).toEqual(py.named)
  })

  it('recognises lines and transpositions, not nonsense', () => {
    const book = realBook()
    const play = (...sans: string[]) => {
      const c = new Chess()
      for (const s of sans) c.move(s)
      return c.fen()
    }
    expect(book.has(play('e4', 'e5', 'Nf3', 'Nc6', 'Bb5'))).toBe(true)
    expect(book.name(play('e4', 'e5', 'Nf3', 'Nc6', 'Bb5'))?.name).toMatch(/Ruy Lopez/)
    // same position reached by two move orders
    expect(book.has(play('d4', 'Nf6', 'c4', 'e6'))).toBe(book.has(play('c4', 'e6', 'd4', 'Nf6')))
    expect(book.has(play('a4', 'h5', 'a5', 'h4'))).toBe(false)
  })

  it('ignores move counters when matching, and the empty book matches nothing', () => {
    const fen = new Chess().fen()
    const data: BookData = { version: 1, positions: [fen.split(' ').slice(0, 4).join(' ')], named: {} }
    expect(createBook(data).has(fen.replace(/ 0 1$/, ' 7 12'))).toBe(true)
    expect(emptyBook.has(fen)).toBe(false)
  })
})
