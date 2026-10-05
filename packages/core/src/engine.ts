import type { Eval } from './types'

export interface AnalyseRequest {
  fen: string
  depth: number
  nodes: number
  /** Restrict the root search to these moves (UCI). Used to find the best alternative to the played move. */
  searchMoves?: string[]
}

export interface AnalyseResult {
  /** Score from White's point of view, whoever is to move. */
  eval: Eval
  best: string | null
  depth: number
  nodes: number
}

/**
 * The only thing the review needs from a chess engine. Implementations live in
 * @chessreview/engine (Web Worker, Node process, pool); tests can pass a fake.
 */
export interface Engine {
  analyse(req: AnalyseRequest, signal?: AbortSignal): Promise<AnalyseResult>
}

export class AnalysisAborted extends Error {
  override name = 'AnalysisAborted'
  constructor() {
    super('Analysis was cancelled.')
  }
}
