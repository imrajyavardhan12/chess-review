import {
  pickNext,
  playersIn,
  queue,
  summarize,
  today,
  withTactic,
  replay,
  type Phase,
  type PuzzleRecord,
} from '@chessreview/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { AppHeader } from './AppHeader'
import { lineMoves, targets } from './explore'
import { useAsync } from './hooks'
import { tacticTopic } from './insight-facts'
import { NAMED_PIECES, isLight, reducedMotion } from './pieces'
import { BOARDS, rememberedPlayer, usePrefs } from './prefs'
import { moveFromText } from './puzzle-input'
import { getPuzzleService, getReviewService, type SyncProgress } from './services'

const PHASE_NAMES: Record<Phase, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
}
const COLOR_NAMES = { w: 'White', b: 'Black' }
const ARROW = 'rgba(76,127,214,0.85)'
/** How many puzzles make up a day's set. Soft: the player can carry on past it. */
const DAILY_GOAL = 10

const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0)

/** Puzzles made from the player's own mistakes, asked until they stick. Nothing leaves the device. */
export function TrainPage({ tactic, player: asked }: { tactic: string | null; player: string | null }) {
  const stored = useAsync('all', async () => (await getReviewService()).allReviews())
  const players = useMemo(() => playersIn((stored.value ?? []).map((s) => s.review)), [stored.value])
  const [chosen, setChosen] = useState<string | null>(null)
  const named = (name: string | null) => players.find((p) => p.name.toLowerCase() === name?.toLowerCase())
  const player = chosen ?? named(asked)?.name ?? named(rememberedPlayer())?.name ?? players[0]?.name ?? null

  useEffect(() => {
    document.title = 'Train · chessreview'
  }, [])

  return (
    <>
      <AppHeader active="train" />
      <main className="page train">
        <div className="insights-head">
          <h1>Train</h1>
          {players.length > 0 && (
            <label className="player">
              Player
              <select value={player ?? ''} onChange={(e) => setChosen(e.target.value)}>
                {players.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.games} game{p.games === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {stored.loading ? (
          <p className="muted">Reading your reviews…</p>
        ) : player === null ? (
          <div className="empty">
            <p>Puzzles come from your own mistakes, so there is nothing to practise yet.</p>
            <p>
              <a href="#/">Review some of your games</a> first.
            </p>
          </div>
        ) : (
          <Session key={`${player}|${tactic ?? ''}`} player={player} tactic={tactic} />
        )}
      </main>
    </>
  )
}

/** One player's puzzles: finds new ones in the background while the ready ones can be played. */
function Session({ player, tactic }: { player: string; tactic: string | null }) {
  const [records, setRecords] = useState<PuzzleRecord[] | null>(null)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [failed, setFailed] = useState(false)
  // Undefined until a puzzle is ready; null once the player has been through everything that is due.
  const [chosenId, setChosenId] = useState<string | null | undefined>(undefined)
  // Moved on with each answer, so the day's count and what is due follow the clock.
  const [now, setNow] = useState(() => Date.now())
  const [asked, setAsked] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    let stale = false
    const controller = new AbortController()
    void (async () => {
      try {
        const service = await getPuzzleService()
        if (!stale) setRecords(await service.list(player))
        await service.sync(player, (p) => !stale && setProgress(p), controller.signal)
        if (!stale) setRecords(await service.list(player))
      } catch (e) {
        console.warn('Could not prepare the puzzles', e)
        if (!stale) setFailed(true)
      } finally {
        if (!stale) setProgress(null)
      }
    })()
    return () => {
      stale = true
      controller.abort()
    }
  }, [player])

  const focused = records ? withTactic(records, tactic) : null
  const startId = focused ? (pickNext(focused, now)?.id ?? null) : null
  // Lock the first puzzle as soon as there is one, so puzzles found later do not replace it mid-answer.
  if (chosenId === undefined && startId !== null) setChosenId(startId)
  const currentId = chosenId ?? null
  const current = records?.find((r) => r.id === currentId) ?? null

  const answered = async (record: PuzzleRecord, correct: boolean) => {
    const next = await (await getPuzzleService()).answer(record, correct)
    setNow(Date.now())
    setRecords((rs) => rs?.map((r) => (r.id === next.id ? next : r)) ?? rs)
  }
  const next = () => {
    if (!records || !current) return
    const skip = new Set(asked).add(current.id)
    setAsked(skip)
    setChosenId(pickNext(withTactic(records, tactic), Date.now(), skip)?.id ?? null)
  }

  const stats = records ? summarize(records, now) : null
  const q = focused ? queue(focused, now) : null
  const count = focused?.filter((r) => r.puzzle !== null).length ?? 0
  const day = records ? today(records, now, startOfDay(now), DAILY_GOAL) : null
  const searching = progress !== null && progress.done < progress.total

  return (
    <>
      {searching && (
        <p className="muted" role="status">
          Looking for puzzles in your games… {progress.done} of {progress.total} positions checked.
        </p>
      )}
      {failed && (
        <p className="muted">Something went wrong while preparing the puzzles. Try reloading the page.</p>
      )}
      {tactic !== null && (
        <p className="train-focus">
          <span>
            Practising <strong>{tacticTopic(tactic)}</strong>
            {focused && ` · ${count} puzzle${count === 1 ? '' : 's'}`}
          </span>
          <a href="#/train">Show all puzzles</a>
        </p>
      )}
      {day && day.target > 0 && <DayStrip done={day.done} target={day.target} />}
      {records === null ? (
        <p className="muted">Reading your puzzles…</p>
      ) : current ? (
        <PuzzleCard key={current.id} record={current} onAnswered={answered} onNext={next} />
      ) : tactic !== null && focused && focused.every((r) => r.puzzle === null) ? (
        searching ? null : (
          <div className="empty">
            <p>No puzzles for {tacticTopic(tactic).toLowerCase()} yet.</p>
            <p className="muted">
              Not every mistake becomes a puzzle. <a href="#/train">Show all puzzles</a>.
            </p>
          </div>
        )
      ) : stats && stats.total === 0 ? (
        searching ? null : (
          <div className="empty">
            <p>No clear puzzles in your games yet.</p>
            <p className="muted">
              A mistake becomes a puzzle when one move was clearly the best. Review more of your games and
              check again.
            </p>
          </div>
        )
      ) : (
        <div className="empty">
          <p>You have answered everything that is due.</p>
          <p className="muted">
            {q && q.waiting.length > 0
              ? `${q.waiting.length} puzzle${q.waiting.length === 1 ? '' : 's'} will come back later, when it is time to check that they stuck.`
              : 'Review more games to find new puzzles.'}
          </p>
        </div>
      )}
      {stats && stats.total > 0 && <Progress stats={stats} />}
    </>
  )
}

/** Today's set: how many of its puzzles have been answered. */
function DayStrip({ done, target }: { done: number; target: number }) {
  return (
    <div className="train-day">
      <p>
        <strong>{done}</strong> of {target} today
        {done >= target && done > 0 ? ' · done for today' : ''}
      </p>
      <span className="train-day-bar" aria-hidden="true">
        <span style={{ width: `${(done / target) * 100}%` }} />
      </span>
    </div>
  )
}

function Progress({ stats }: { stats: ReturnType<typeof summarize> }) {
  return (
    <section className="train-progress" aria-label="Your progress">
      <div className="tiles train-tiles">
        <div className="tile">
          <span className="tile-label">Puzzles</span>
          <span className="tile-num">{stats.total}</span>
        </div>
        <div className="tile">
          <span className="tile-label">New</span>
          <span className="tile-num">{stats.fresh}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Due again</span>
          <span className="tile-num">{stats.due}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Solved first try</span>
          <span className="tile-num">
            {stats.attempts > 0 ? `${Math.round((stats.solved / stats.attempts) * 100)}%` : '–'}
          </span>
        </div>
      </div>
      <table className="train-phases">
        <caption>By phase of the game</caption>
        <thead>
          <tr>
            <th scope="col">Phase</th>
            <th scope="col">Puzzles</th>
            <th scope="col">Solved</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(PHASE_NAMES) as Phase[]).map((p) => {
            const s = stats.byPhase[p]
            return (
              <tr key={p}>
                <th scope="row">{PHASE_NAMES[p]}</th>
                <td>{s.total}</td>
                <td>{s.attempts > 0 ? `${Math.round((s.solved / s.attempts) * 100)}%` : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

type Status = 'asking' | 'wrong' | 'solved' | 'shown'

const TW = 700
const TH = 220

/** Where in the player's game the puzzle sits: the game's win chance, with the moment of the mistake marked. */
function PuzzleTrace({ gameId, moveIndex, held }: { gameId: string; moveIndex: number; held: number }) {
  const stored = useAsync(`puzzle-trace|${gameId}`, async () => (await getReviewService()).stored(gameId))
  const series = stored.value?.review.winSeries
  if (!series || series.length < 2) return null
  const last = series.length - 1
  const x = (i: number) => (i / last) * TW
  const y = (v: number) => TH - (v / 100) * TH
  const line = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const at = Math.min(moveIndex, last)
  const move = Math.floor(moveIndex / 2) + 1
  return (
    <div className="puzzle-trace">
      <div
        className="puzzle-trace-plot"
        role="img"
        aria-label={`Win chance across your game. The puzzle is at move ${move}, where you held ${Math.round(held)}%.`}
      >
        <svg viewBox={`0 0 ${TW} ${TH}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={`${line}L${TW},${TH}L0,${TH}Z`} className="trace-white" />
          <line
            x1="0"
            x2={TW}
            y1={TH / 2}
            y2={TH / 2}
            className="trace-mid"
            vectorEffect="non-scaling-stroke"
          />
          <path d={line} className="trace-line" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="puzzle-trace-cursor" style={{ left: `${(x(at) / TW) * 100}%` }} />
        <span className="puzzle-trace-tag" style={{ left: `${(x(at) / TW) * 100}%` }}>
          Move {move} · you held {Math.round(held)}%
        </span>
      </div>
    </div>
  )
}

/** One puzzle. Keyed by its id, so everything here starts over for the next one. */
function PuzzleCard({
  record,
  onAnswered,
  onNext,
}: {
  record: PuzzleRecord
  onAnswered: (record: PuzzleRecord, correct: boolean) => Promise<void>
  onNext: () => void
}) {
  const puzzle = record.puzzle!
  const sq = BOARDS[usePrefs().board]
  const [status, setStatus] = useState<Status>('asking')
  const [wrongMove, setWrongMove] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [unclear, setUnclear] = useState(false)
  // Only the first answer counts towards the schedule; trying again is practice.
  const recorded = useRef(false)

  const done = status === 'solved' || status === 'shown'
  const after = useMemo(() => replay(puzzle.fen, [puzzle.solution]).at(-1)?.after ?? puzzle.fen, [puzzle])
  const fen = done ? after : puzzle.fen
  const color = COLOR_NAMES[puzzle.color]
  const dots = !done && picked ? targets(puzzle.fen, picked) : []
  const line = useMemo(() => lineMoves(puzzle.fen, puzzle.line), [puzzle])

  const submit = (uci: string) => {
    if (done) return
    setPicked(null)
    setUnclear(false)
    const correct = uci === puzzle.solution
    if (!recorded.current) {
      recorded.current = true
      void onAnswered(record, correct)
    }
    if (correct) {
      setStatus('solved')
      setWrongMove(null)
    } else {
      setStatus('wrong')
      setWrongMove(uci)
    }
  }
  const tryMove = (from: string, to: string): boolean => {
    const uci = [from + to, from + to + 'q'].find((m) => moveFromText(puzzle.fen, m) === m)
    if (!uci) return false
    submit(uci)
    return uci === puzzle.solution
  }
  const reveal = () => {
    if (!recorded.current) {
      recorded.current = true
      void onAnswered(record, false)
    }
    setStatus('shown')
  }

  const arrows = done
    ? [{ startSquare: puzzle.solution.slice(0, 2), endSquare: puzzle.solution.slice(2, 4), color: ARROW }]
    : []
  const lastSquares = done ? [puzzle.solution.slice(0, 2), puzzle.solution.slice(2, 4)] : []
  const when = record.date ? ` on ${record.date}` : ''

  return (
    <div className="stage train-stage">
      <section className="boardcol" aria-label="Puzzle board">
        <div className="board" role="group" aria-label={`Board, ${color} to move`}>
          <div>
            <Chessboard
              options={{
                position: fen,
                boardOrientation: puzzle.color === 'w' ? 'white' : 'black',
                pieces: NAMED_PIECES,
                allowDragging: !done,
                onPieceDrop: ({ sourceSquare, targetSquare }) =>
                  targetSquare !== null && tryMove(sourceSquare, targetSquare),
                onSquareClick: ({ piece, square }) => {
                  if (done) return
                  if (picked && dots.includes(square) && tryMove(picked, square)) return
                  const mine = piece && piece.pieceType[0] === puzzle.color
                  setPicked(mine && square !== picked ? square : null)
                },
                allowDrawingArrows: false,
                animationDurationInMs: reducedMotion() ? 0 : 160,
                lightSquareStyle: { backgroundColor: sq.light },
                darkSquareStyle: { backgroundColor: sq.dark },
                arrows,
                squareRenderer: ({ square, children }) => {
                  const hl = lastSquares.includes(square) || square === picked
                  return (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        backgroundColor: hl ? (isLight(square) ? sq.hlLight : sq.hlDark) : undefined,
                      }}
                    >
                      {children}
                      {dots.includes(square) && <span className="dot-target" aria-hidden="true" />}
                    </div>
                  )
                },
              }}
            />
          </div>
        </div>
      </section>

      <section className="train-panel" aria-label="Puzzle">
        <p className="train-kicker">
          {PHASE_NAMES[puzzle.phase]} · from your game against {record.opponent}
          {when}
        </p>
        <h2>
          {done
            ? status === 'solved'
              ? 'Correct'
              : 'The best move'
            : `${color} to move. Find the best move.`}
        </h2>

        <PuzzleTrace gameId={record.gameId} moveIndex={puzzle.moveIndex} held={puzzle.winBefore} />

        <div role="status" className="train-feedback">
          {status === 'asking' && <p className="muted">Drag a piece, or type your move below.</p>}
          {status === 'wrong' && (
            <p>
              {wrongMove === puzzle.playedUci
                ? 'That is the move you played in the game, and it was the mistake.'
                : 'That is not the best move.'}{' '}
              Try again, or show the answer.
            </p>
          )}
          {done && (
            <p>
              <strong>{puzzle.solutionSan}</strong> was the move. In the game you played{' '}
              <strong>{puzzle.playedSan}</strong> and gave up {puzzle.loss.toFixed(0)} points of win chance.
            </p>
          )}
          {unclear && (
            <p className="train-error">That is not a legal move here. Write it like Nxd5 or e2e4.</p>
          )}
        </div>

        {!done && (
          <form
            className="train-input"
            onSubmit={(e) => {
              e.preventDefault()
              const uci = moveFromText(puzzle.fen, text)
              if (!uci) return setUnclear(true)
              setText('')
              submit(uci)
            }}
          >
            <label>
              Your move
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Nxd5"
              />
            </label>
            <button type="submit" className="secondary">
              Check
            </button>
          </form>
        )}

        {done && (
          <>
            <p className="train-line">
              <span className="muted">Best line: </span>
              {line.map((m) => m.text).join(' ')}
            </p>
            <div className="train-actions">
              <button className="primary" onClick={onNext} autoFocus>
                Next puzzle
              </button>
              <a
                className="secondary"
                href={`#/review/${record.gameId}?u=${encodeURIComponent(record.player)}`}
              >
                Open the game
              </a>
            </div>
          </>
        )}
        {!done && status === 'wrong' && (
          <div className="train-actions">
            <button className="secondary" onClick={reveal}>
              Show the answer
            </button>
          </div>
        )}
        {status === 'asking' && (
          <div className="train-actions">
            <button className="ghost" onClick={reveal}>
              Show the answer
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
