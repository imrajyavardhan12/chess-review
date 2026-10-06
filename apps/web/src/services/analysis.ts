import { AnalysisAborted, MATE_CP, positionKey, terminal, type Eval } from '@chessreview/core'
import type { EngineHost } from './engine-host'

/** The engine's view of a position the user is exploring. Separate from any stored review. */
export interface LiveEval {
  eval: Eval
  /** Best move and line (UCI); empty when the game is over. */
  line: string[]
  depth: number
}

export interface Limits {
  depth: number
  nodes: number
}

/**
 * Evaluates single positions on demand, on the same engine pool as reviews. A search is limited by
 * depth and nodes, can be cancelled (the engine is told to stop), and its answer is remembered, so
 * stepping back and forth through a line costs nothing the second time.
 */
export class LiveAnalysis {
  private cache = new Map<string, LiveEval>()

  constructor(
    private host: EngineHost,
    private size = 256,
  ) {}

  async analyse(fen: string, limits: Limits, signal?: AbortSignal): Promise<LiveEval> {
    const key = `${positionKey(fen)}|${limits.depth}|${limits.nodes}`
    const hit = this.cache.get(key)
    if (hit) return hit
    if (signal?.aborted) throw new AnalysisAborted()
    const end = terminal(fen)
    const result: LiveEval = end
      ? {
          eval: {
            cp: end.winner === 'w' ? MATE_CP : end.winner === 'b' ? -MATE_CP : 0,
            mate: end.winner ? 0 : null,
          },
          line: [],
          depth: 0,
        }
      : await this.host.use(async (engine) => {
          const r = await engine.analyse({ fen, depth: limits.depth, nodes: limits.nodes }, signal)
          return { eval: r.eval, line: r.pv, depth: r.depth }
        })
    this.cache.set(key, result)
    if (this.cache.size > this.size) this.cache.delete(this.cache.keys().next().value!)
    return result
  }
}
