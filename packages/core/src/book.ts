import { positionKey } from './chess-util'

/** Serialised opening book: every position on a known line, and a name for each line's final position. */
export interface BookData {
  version: 1
  positions: string[]
  named: Record<string, [eco: string, name: string]>
}

export interface OpeningBook {
  has(fen: string): boolean
  name(fen: string): { eco: string; name: string } | undefined
}

export function createBook(data: BookData): OpeningBook {
  const positions = new Set(data.positions)
  return {
    has: (fen) => positions.has(positionKey(fen)),
    name: (fen) => {
      const hit = data.named[positionKey(fen)]
      return hit ? { eco: hit[0], name: hit[1] } : undefined
    },
  }
}

export const emptyBook: OpeningBook = { has: () => false, name: () => undefined }

/** Loads the bundled Lichess opening data (CC0) on demand; bundlers split it into its own chunk. */
export async function loadBook(): Promise<OpeningBook> {
  const data = (await import('./data/openings.json')) as unknown as { default: BookData }
  return createBook(data.default)
}
