import type { OpeningBook } from './book'
import type { Engine } from './engine'
import { evaluatePositions, type EvaluateOptions } from './evaluate'
import { parseGame } from './pgn'
import { buildReview } from './review'
import type { Review, ReviewSettings } from './types'

/** Parse, evaluate and classify in one call. The browser app uses the pieces separately to report progress. */
export async function reviewGame(
  pgn: string,
  engine: Engine,
  book: OpeningBook,
  settings: ReviewSettings,
  opts?: EvaluateOptions,
): Promise<Review> {
  const game = parseGame(pgn)
  const records = await evaluatePositions(game, engine, settings, opts)
  return buildReview(game, records, book, settings)
}
