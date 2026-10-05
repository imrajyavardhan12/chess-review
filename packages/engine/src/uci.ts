import {
  AnalysisAborted,
  type AnalyseRequest,
  type AnalyseResult,
  type Engine,
  MATE_CP,
} from '@chessreview/core'
import { Emitter, type Transport } from './transport'

export class EngineError extends Error {
  override name = 'EngineError'
}

export interface UciOptions {
  threads?: number
  hashMb?: number
  /** Give up on a single search after this long. A wedged engine would otherwise hang a review forever. */
  searchTimeoutMs?: number
}

interface Info {
  depth: number
  nodes: number
  score: { kind: 'cp' | 'mate'; value: number }
  pv: string[]
}

/** Parses one `info` line; returns null if it carries no score and principal variation. */
export function parseInfo(line: string): Info | null {
  if (!line.startsWith('info ')) return null
  const t = line.split(/\s+/)
  const at = (key: string) => t.indexOf(key)
  const num = (key: string) => {
    const i = at(key)
    return i < 0 ? undefined : Number(t[i + 1])
  }
  const s = at('score')
  const pv = at('pv')
  const depth = num('depth')
  const nodes = num('nodes')
  if (s < 0 || pv < 0 || depth === undefined || nodes === undefined) return null
  const kind = t[s + 1]
  const value = Number(t[s + 2])
  if ((kind !== 'cp' && kind !== 'mate') || Number.isNaN(value)) return null
  return { depth, nodes, score: { kind, value }, pv: t.slice(pv + 1) }
}

/** White-POV centipawns and mate distance from an engine score, which UCI reports for the side to move. */
export function toWhitePov(score: Info['score'], turn: 'w' | 'b'): { cp: number; mate: number | null } {
  const sign = turn === 'w' ? 1 : -1
  if (score.kind === 'cp') return { cp: sign * score.value, mate: null }
  const mate = sign * score.value
  return { cp: mate > 0 ? MATE_CP - mate : -MATE_CP - mate, mate }
}

/**
 * UCI protocol client. Runs one search at a time (queued), and sends `ucinewgame` before each so
 * the transposition table starts empty: that makes every result independent of what ran before it,
 * which is what lets a pool of engines give the same answers as a single one.
 */
export class UciEngine implements Engine {
  private chain: Promise<unknown> = Promise.resolve()
  private lines = new Emitter<string>()
  private dead: Error | null = null
  private unsubscribe: Array<() => void> = []

  private constructor(
    private transport: Transport,
    private opts: UciOptions,
  ) {
    this.unsubscribe.push(transport.onLine((l) => this.lines.emit(l)))
    this.unsubscribe.push(
      transport.onError((e) => {
        this.dead = e
        this.lines.emit('')
      }),
    )
  }

  static async start(transport: Transport, opts: UciOptions = {}): Promise<UciEngine> {
    const engine = new UciEngine(transport, opts)
    try {
      transport.send('uci')
      const advertised = new Set<string>()
      await engine.waitFor(
        (l) => {
          const m = /^option name (.+?) type /.exec(l)
          if (m) advertised.add(m[1]!)
          return l === 'uciok'
        },
        20_000,
        'the engine did not answer the UCI handshake',
      )
      // Analysis, not play: python-chess does the same, and it keeps both implementations identical.
      if (advertised.has('UCI_AnalyseMode')) transport.send('setoption name UCI_AnalyseMode value true')
      transport.send(`setoption name Threads value ${opts.threads ?? 1}`)
      transport.send(`setoption name Hash value ${opts.hashMb ?? 16}`)
      transport.send('isready')
      await engine.waitFor((l) => l === 'readyok', 20_000, 'the engine did not become ready')
    } catch (e) {
      transport.terminate()
      throw e
    }
    return engine
  }

  /** Resolves with the first line matching `done`; rejects on transport failure or timeout. */
  private waitFor(done: (line: string) => boolean, timeoutMs: number, what: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const stop = this.lines.on((line) => {
        if (this.dead) return finish(() => reject(new EngineError(`engine failed: ${this.dead!.message}`)))
        if (done(line)) finish(() => resolve(line))
      })
      const timer = setTimeout(() => finish(() => reject(new EngineError(`Timed out: ${what}.`))), timeoutMs)
      const finish = (settle: () => void) => {
        clearTimeout(timer)
        stop()
        settle()
      }
      if (this.dead) finish(() => reject(new EngineError(`engine failed: ${this.dead!.message}`)))
    })
  }

  analyse(req: AnalyseRequest, signal?: AbortSignal): Promise<AnalyseResult> {
    const run = () => this.search(req, signal)
    const result = this.chain.then(run, run)
    this.chain = result.catch(() => undefined)
    return result
  }

  private async search(req: AnalyseRequest, signal?: AbortSignal): Promise<AnalyseResult> {
    if (signal?.aborted) throw new AnalysisAborted()
    if (this.dead) throw new EngineError(`engine failed: ${this.dead.message}`)
    const turn = req.fen.split(' ')[1] === 'b' ? 'b' : 'w'
    let last: Info | null = null
    let aborted = false

    const onAbort = () => {
      aborted = true
      this.transport.send('stop')
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const parts = [`go depth ${req.depth} nodes ${req.nodes}`]
    if (req.searchMoves?.length) parts.push(`searchmoves ${req.searchMoves.join(' ')}`)
    this.transport.send('ucinewgame')
    this.transport.send(`position fen ${req.fen}`)
    this.transport.send(parts.join(' '))

    try {
      const bestLine = await this.waitFor(
        (line) => {
          const info = parseInfo(line)
          if (info) last = info
          return line.startsWith('bestmove')
        },
        this.opts.searchTimeoutMs ?? 120_000,
        'the search did not finish',
      )
      if (aborted) throw new AnalysisAborted()
      const token = bestLine.split(/\s+/)[1]
      const best = token && token !== '(none)' ? token : null
      const info = last as Info | null
      if (!info) throw new EngineError(`engine returned no score for ${req.fen}`)
      return {
        eval: toWhitePov(info.score, turn),
        best: best ?? info.pv[0] ?? null,
        depth: info.depth,
        nodes: info.nodes,
      }
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  dispose(): void {
    for (const u of this.unsubscribe) u()
    this.transport.terminate()
  }
}
