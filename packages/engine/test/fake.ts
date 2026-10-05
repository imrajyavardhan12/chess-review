import { Emitter, type Transport } from '../src'

type Handler = (cmd: string, reply: (line: string) => void) => void

/** A scripted UCI engine. `handler` sees every command and decides what to answer. */
export class FakeTransport implements Transport {
  readonly sent: string[] = []
  terminated = false
  private lines = new Emitter<string>()
  private errors = new Emitter<Error>()

  constructor(private handler: Handler = FakeTransport.polite()) {}

  /** Answers the handshake and finishes every `go` with a fixed score and move. */
  static polite(info = 'info depth 10 score cp 25 nodes 1000 pv e2e4 e7e5', best = 'bestmove e2e4'): Handler {
    return (cmd, reply) => {
      if (cmd === 'uci') reply('uciok')
      else if (cmd === 'isready') reply('readyok')
      else if (cmd.startsWith('go')) {
        reply(info)
        reply(best)
      }
    }
  }

  send(line: string): void {
    this.sent.push(line)
    queueMicrotask(() => this.handler(line, (l) => this.lines.emit(l)))
  }
  onLine(l: (line: string) => void) {
    return this.lines.on(l)
  }
  onError(l: (e: Error) => void) {
    return this.errors.on(l)
  }
  terminate(): void {
    this.terminated = true
  }
  crash(message = 'boom'): void {
    this.errors.emit(new Error(message))
  }
  say(line: string): void {
    this.lines.emit(line)
  }
}

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
export const BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
