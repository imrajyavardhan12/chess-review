import { EnginePool, type PoolEngine } from '@chessreview/engine'
import type { Engine } from '@chessreview/core'

/**
 * Owns the engine pool. Workers are created on first use and torn down after a quiet spell,
 * because each one holds tens of megabytes that an idle tab shouldn't keep.
 */
export class EngineHost {
  private pool: EnginePool | null = null
  private users = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private create: () => Promise<PoolEngine>,
    private size: number,
    private idleMs = 30_000,
  ) {}

  async use<T>(work: (engine: Engine) => Promise<T>): Promise<T> {
    clearTimeout(this.timer)
    this.users++
    this.pool ??= new EnginePool(this.create, this.size)
    try {
      return await work(this.pool)
    } finally {
      this.users--
      if (this.users === 0) this.timer = setTimeout(() => this.shutdown(), this.idleMs)
    }
  }

  /** True while workers exist. */
  get running(): boolean {
    return this.pool !== null
  }

  shutdown(): void {
    clearTimeout(this.timer)
    this.pool?.dispose()
    this.pool = null
  }
}
