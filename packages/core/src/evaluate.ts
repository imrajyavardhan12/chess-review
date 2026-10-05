import { legalUci, terminal, turnOf } from './chess-util'
import { AnalysisAborted, type Engine } from './engine'
import { GREAT_RANGE, MATE_CP } from './rules'
import type { ParsedGame } from './pgn'
import type { EngineRecord, ReviewSettings } from './types'
import { winPercent } from './winchance'

export interface EvaluateOptions {
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

const moverCp = (cp: number, turn: 'w' | 'b') => (turn === 'w' ? cp : -cp)

/**
 * Runs the engine over every position of a game. Positions are independent, so each one is
 * dispatched at once and the engine (a pool, in the browser) decides how much runs in parallel.
 * For a move that matched the engine's choice, a second search with that move excluded finds the
 * runner-up, which is what separates a "Great" move from an ordinary best move.
 */
export async function evaluatePositions(
  game: ParsedGame,
  engine: Engine,
  settings: ReviewSettings,
  { onProgress, signal }: EvaluateOptions = {},
): Promise<EngineRecord[]> {
  const total = game.fens.length + game.moves.length
  let done = 0
  const tick = () => onProgress?.(++done, total)
  const { depth, nodes } = settings

  const one = async (fen: string, i: number): Promise<EngineRecord> => {
    if (signal?.aborted) throw new AnalysisAborted()
    const end = terminal(fen)
    let record: EngineRecord
    if (end) {
      // The engine can't search a finished game: score it directly.
      const cp = end.winner === 'w' ? MATE_CP : end.winner === 'b' ? -MATE_CP : 0
      record = { cp, mate: end.winner ? 0 : null, best: null, secondCp: null }
    } else {
      const r = await engine.analyse({ fen, depth, nodes }, signal)
      record = { cp: r.eval.cp, mate: r.eval.mate, best: r.best, secondCp: null }
    }
    tick()

    const played = game.moves[i]
    // Only contested positions can hold a "Great" move, so only they are worth a second search.
    const win = winPercent(moverCp(record.cp, turnOf(fen)))
    if (played && record.best === played.uci && win >= GREAT_RANGE[0] && win <= GREAT_RANGE[1]) {
      // Stockfish builds its root move list in the order given, so the order changes the search.
      // Sorted UCI is the canonical order, independent of any library's move generator.
      const others = legalUci(fen)
        .filter((m) => m !== played.uci)
        .sort()
      if (others.length > 0) {
        const alt = await engine.analyse({ fen, depth, nodes, searchMoves: others }, signal)
        record.secondCp = alt.eval.cp
      }
    }
    if (played) tick()
    return record
  }

  return Promise.all(game.fens.map(one))
}
