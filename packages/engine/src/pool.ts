import { AnalysisAborted, type AnalyseRequest, type AnalyseResult, type Engine } from '@chessreview/core'
import { EngineError } from './uci'

export interface PoolEngine extends Engine {
  dispose(): void
}

interface Task {
  req: AnalyseRequest
  signal: AbortSignal | undefined
  resolve: (r: AnalyseResult) => void
  reject: (e: unknown) => void
  retries: number
}

/**
 * Runs analyses on several engines at once. Positions of a game are independent, so a pool of
 * single-threaded engines scales close to linearly and needs no SharedArrayBuffer, which means
 * it works on any static host. Engines are created lazily and a crashed one is replaced.
 */
export class EnginePool implements Engine {
  private idle: PoolEngine[] = []
  private queue: Task[] = []
  private busy = 0
  private creating = 0
  private all = new Set<PoolEngine>()
  private disposed = false
  private failures = 0
  private limit: number

  constructor(
    private create: () => Promise<PoolEngine>,
    readonly size: number,
    private maxFailures = 3,
  ) {
    if (size < 1) throw new RangeError('pool size must be at least 1')
    this.limit = size
  }

  /** How many engines the pool may run now: its size, less one for every engine that crashed. */
  get workers(): number {
    return this.limit
  }

  analyse(req: AnalyseRequest, signal?: AbortSignal): Promise<AnalyseResult> {
    if (this.disposed) return Promise.reject(new EngineError('the engine pool was disposed'))
    if (signal?.aborted) return Promise.reject(new AnalysisAborted())
    return new Promise((resolve, reject) => {
      const task: Task = { req, signal, resolve, reject, retries: 1 }
      signal?.addEventListener(
        'abort',
        () => {
          const i = this.queue.indexOf(task)
          if (i >= 0) {
            this.queue.splice(i, 1)
            reject(new AnalysisAborted())
          }
        },
        { once: true },
      )
      this.queue.push(task)
      this.pump()
    })
  }

  private pump(): void {
    while (this.queue.length > 0 && !this.disposed) {
      const engine = this.idle.pop()
      if (engine) {
        this.run(engine, this.queue.shift()!)
      } else if (this.all.size + this.creating < this.limit && this.queue.length > this.creating) {
        // Only start a new engine if more tasks are waiting than engines already on their way.
        this.creating++
        this.create().then(
          (e) => {
            this.creating--
            if (this.disposed) return e.dispose()
            this.all.add(e)
            this.idle.push(e)
            this.pump()
          },
          (err) => {
            this.creating--
            this.failures++
            if (this.failures >= this.maxFailures) this.failAll(err)
            else this.pump()
          },
        )
      } else {
        break
      }
    }
  }

  private run(engine: PoolEngine, task: Task): void {
    this.busy++
    engine.analyse(task.req, task.signal).then(
      (r) => {
        this.busy--
        this.idle.push(engine)
        task.resolve(r)
        this.pump()
      },
      (err) => {
        this.busy--
        if (err instanceof AnalysisAborted) {
          this.idle.push(engine)
          task.reject(err)
        } else {
          // The engine may be wedged or dead: discard it, and give the task one more chance elsewhere.
          this.all.delete(engine)
          engine.dispose()
          this.failures++
          // A crash is most often the browser running out of memory, so carry on with fewer workers.
          this.limit = Math.max(1, this.limit - 1)
          if (task.retries > 0 && this.failures < this.maxFailures) {
            task.retries--
            this.queue.unshift(task)
          } else {
            task.reject(err)
          }
          if (this.failures >= this.maxFailures) this.failAll(err)
        }
        this.pump()
      },
    )
  }

  private failAll(err: unknown): void {
    const pending = this.queue.splice(0)
    for (const t of pending) t.reject(err)
  }

  dispose(): void {
    this.disposed = true
    for (const e of this.all) e.dispose()
    this.all.clear()
    this.idle = []
    for (const t of this.queue.splice(0)) t.reject(new EngineError('the engine pool was disposed'))
  }
}

/** Memory a lite engine worker holds, measured: wasm heap plus the 16 MB hash. */
const WORKER_MB = 130

/**
 * A sensible worker count: leave a core for the UI, never below one, and keep the engines within
 * a quarter of the memory the device reports (`navigator.deviceMemory`, in GB, where available).
 */
export function defaultConcurrency(hardwareConcurrency: number | undefined, deviceMemoryGb?: number): number {
  const byCores = Math.min(6, (hardwareConcurrency ?? 4) - 1)
  const byMemory =
    deviceMemoryGb === undefined ? Infinity : Math.floor((deviceMemoryGb * 1024) / 4 / WORKER_MB)
  return Math.max(1, Math.min(byCores, byMemory))
}
