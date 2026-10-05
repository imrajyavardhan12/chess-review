/** A line-oriented channel to a UCI engine: a Web Worker in browsers, a child process or WASM module in Node. */
export interface Transport {
  send(line: string): void
  /** Subscribes to engine output, one line at a time. Returns an unsubscribe function. */
  onLine(listener: (line: string) => void): () => void
  /** Subscribes to fatal transport errors (worker crashed, process exited). */
  onError(listener: (error: Error) => void): () => void
  terminate(): void
}

/** Small helper so transports don't each reimplement listener bookkeeping. */
export class Emitter<T> {
  private listeners = new Set<(value: T) => void>()
  on(listener: (value: T) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  emit(value: T): void {
    for (const l of [...this.listeners]) l(value)
  }
}
