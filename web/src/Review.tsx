import { useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { getReview } from './api'
import { EvalGraph } from './EvalGraph'
import { META, ORDER, evalText, isKeyMoment, isNotable, moveLabel } from './labels'
import type { Counts, Label, Move, Review } from './types'

type View =
  | { kind: 'running'; done: number; total: number; queued: boolean }
  | { kind: 'done'; review: Review }
  | { kind: 'error'; message: string }

function useReviewJob(id: string): View {
  const [view, setView] = useState<View>({ kind: 'running', done: 0, total: 0, queued: true })
  useEffect(() => {
    let stop = false
    let timer = 0
    const tick = async () => {
      try {
        const r = await getReview(id)
        if (stop) return
        if (r.status === 'done') return setView({ kind: 'done', review: r.review })
        if (r.status === 'error') return setView({ kind: 'error', message: r.error })
        setView({ kind: 'running', done: r.done, total: r.total, queued: r.status === 'queued' })
      } catch (e) {
        if (!stop) setView({ kind: 'error', message: (e as Error).message })
        return
      }
      timer = window.setTimeout(tick, 700)
    }
    tick()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [id])
  return view
}

export function ReviewPage({ id, me }: { id: string; me: string | null }) {
  const view = useReviewJob(id)

  if (view.kind === 'done') return <ReviewView review={view.review} me={me} />

  return (
    <div className="home">
      <header className="wordmark">
        <a href="#/">chessreview</a>
      </header>
      {view.kind === 'error' ? (
        <>
          <p className="error" role="alert">
            {view.message}
          </p>
          <a href="#/">Back to your games</a>
        </>
      ) : (
        <div className="progress" role="status">
          <h1>Analysing</h1>
          <p className="muted">
            {view.queued || !view.total
              ? 'Waiting for the engine to start.'
              : `Position ${view.done} of ${view.total}. This takes about half a minute.`}
          </p>
          <div className="bar">
            <div style={{ width: `${view.total ? (view.done / view.total) * 100 : 3}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

const isLight = (sq: string) => (sq.charCodeAt(0) - 97 + Number(sq[1]) - 1) % 2 === 1
const HIGHLIGHT = { light: '#EBDD9B', dark: '#C7B25A' }

function ReviewView({ review, me }: { review: Review; me: string | null }) {
  const mySide = !me
    ? null
    : review.white.toLowerCase() === me.toLowerCase()
      ? 'white'
      : review.black.toLowerCase() === me.toLowerCase()
        ? 'black'
        : null

  const [ply, setPly] = useState(0)
  const [flipped, setFlipped] = useState(mySide === 'black')
  const [showBest, setShowBest] = useState(false)
  const orientation = flipped ? 'black' : 'white'
  const n = review.fens.length - 1

  const goto = (p: number) => {
    setPly(Math.max(0, Math.min(n, p)))
    setShowBest(false)
  }

  const move: Move | null = ply > 0 ? review.moves[ply - 1] : null
  const bestShown = showBest && !!move && !!move.best_uci && move.label !== 'Best'
  const fen = bestShown ? review.fens[ply - 1] : review.fens[ply]

  const keyPlies = useMemo(
    () => review.moves.filter((m) => isKeyMoment(m.label)).map((m) => m.ply),
    [review],
  )
  const prevKey = [...keyPlies].reverse().find((p) => p < ply)
  const nextKey = keyPlies.find((p) => p > ply)

  useEffect(() => {
    document.title = `${review.white} vs ${review.black} · chessreview`
  }, [review])

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      const keys: Record<string, () => void> = {
        ArrowLeft: () => goto(ply - 1),
        ArrowRight: () => goto(ply + 1),
        Home: () => goto(0),
        End: () => goto(n),
        f: () => setFlipped((v) => !v),
        b: () => setShowBest((v) => !v),
      }
      const run = keys[e.key]
      if (run) {
        e.preventDefault()
        run()
      }
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  })

  const arrows =
    bestShown && move
      ? [
          { startSquare: move.uci.slice(0, 2), endSquare: move.uci.slice(2, 4), color: 'rgba(200,64,60,0.75)' },
          { startSquare: move.best_uci.slice(0, 2), endSquare: move.best_uci.slice(2, 4), color: '#2E8B62' },
        ]
      : []

  const lastSquares = move && !bestShown ? [move.uci.slice(0, 2), move.uci.slice(2, 4)] : []
  const badge = move && !bestShown && (isNotable(move.label) || move.label === 'Best') ? move : null

  const top = orientation === 'white' ? 'black' : 'white'
  const bottom = orientation === 'white' ? 'white' : 'black'
  const h = review.headers
  const rating = (s: 'white' | 'black') => (s === 'white' ? h.WhiteElo : h.BlackElo)
  const evalPly = bestShown ? ply - 1 : ply // the eval of whichever position is on the board
  const win = review.win_series[evalPly]

  return (
    <div className="review">
      <header className="topbar">
        <a href="#/" className="back">
          Games
        </a>
        <div className="title">
          <h1>
            {review.white} vs {review.black}
          </h1>
          <p className="muted">
            {[review.result.replace('-', '–'), h.Termination, review.opening, h.Date?.replaceAll('.', '-')]
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
      </header>

      <div className="stage">
        <section className="boardcol" aria-label="Board">
          <PlayerTag name={review[top]} rating={rating(top)} side={top} />
          <div className="board-row">
            <EvalBar win={win} evalLabel={evalText(review.evals[evalPly])} orientation={orientation} />
            <div className="board">
              <Chessboard
                options={{
                  position: fen,
                  boardOrientation: orientation,
                  allowDragging: false,
                  allowDrawingArrows: false,
                  clearArrowsOnPositionChange: false,
                  animationDurationInMs: 160,
                  lightSquareStyle: { backgroundColor: '#DCE4E8' },
                  darkSquareStyle: { backgroundColor: '#6F8A9C' },
                  arrows,
                  squareRenderer: ({ square, children }) => {
                    const hl = lastSquares.includes(square)
                    const showBadge = badge && square === badge.uci.slice(2, 4)
                    return (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'relative',
                          backgroundColor: hl ? HIGHLIGHT[isLight(square) ? 'light' : 'dark'] : undefined,
                        }}
                      >
                        {children}
                        {showBadge && (
                          <span
                            className="badge"
                            style={{ background: META[badge.label].color, color: META[badge.label].fg }}
                          >
                            {META[badge.label].glyph}
                          </span>
                        )}
                      </div>
                    )
                  },
                }}
              />
            </div>
          </div>
          <PlayerTag name={review[bottom]} rating={rating(bottom)} side={bottom} />
          <div className="controls">
            <IconButton label="Start" onClick={() => goto(0)} disabled={ply === 0} d="M6 5v14M18 5l-8 7 8 7z" />
            <IconButton label="Previous move" onClick={() => goto(ply - 1)} disabled={ply === 0} d="M15 5l-8 7 8 7z" />
            <IconButton label="Next move" onClick={() => goto(ply + 1)} disabled={ply === n} d="M9 5l8 7-8 7z" />
            <IconButton label="End" onClick={() => goto(n)} disabled={ply === n} d="M18 5v14M6 5l8 7-8 7z" />
            <button className="ghost" onClick={() => setFlipped((v) => !v)} title="Flip board (f)">
              Flip board
            </button>
          </div>
        </section>

        <aside className="panel">
          <div className="summary">
            {(['white', 'black'] as const).map((s) => (
              <PlayerSummary
                key={s}
                name={review[s]}
                acc={review.accuracy[s]}
                counts={review.counts[s]}
                isMe={mySide === s}
              />
            ))}
          </div>
          <Commentary
            move={move}
            review={review}
            ply={ply}
            bestShown={bestShown}
            onToggleBest={() => setShowBest((v) => !v)}
            prevKey={prevKey}
            nextKey={nextKey}
            goto={goto}
          />
          <MoveList review={review} ply={ply} onSelect={goto} />
        </aside>
      </div>

      <EvalGraph review={review} ply={ply} onSelect={goto} />
    </div>
  )
}

function PlayerTag({ name, rating, side }: { name: string; rating?: string; side: 'white' | 'black' }) {
  return (
    <div className="ptag">
      <i className={`dot ${side}`} aria-label={side} />
      <strong>{name}</strong>
      {rating && <span className="muted">{rating}</span>}
    </div>
  )
}

function EvalBar({
  win,
  evalLabel,
  orientation,
}: {
  win: number
  evalLabel: string
  orientation: 'white' | 'black'
}) {
  const whiteOnBottom = orientation === 'white'
  const leadWhite = win >= 50
  const labelAtBottom = leadWhite === whiteOnBottom
  return (
    <div className="evalbar" role="img" aria-label={`Evaluation ${evalLabel}`}>
      <div className="evalbar-white" style={{ height: `${win}%`, [whiteOnBottom ? 'bottom' : 'top']: 0 }} />
      <span
        className={`evalbar-label ${leadWhite ? 'on-white' : 'on-black'}`}
        style={{ [labelAtBottom ? 'bottom' : 'top']: 4 }}
      >
        {evalLabel}
      </span>
    </div>
  )
}

function IconButton({ label, d, onClick, disabled }: { label: string; d: string; onClick: () => void; disabled: boolean }) {
  return (
    <button className="icon" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </button>
  )
}

function PlayerSummary({ name, acc, counts, isMe }: { name: string; acc: number; counts: Counts; isMe: boolean }) {
  const total = ORDER.reduce((t, l) => t + (counts[l] ?? 0), 0) || 1
  return (
    <div className="psum">
      <div className="psum-name">
        {name}
        {isMe && <span className="you">you</span>}
      </div>
      <div className="acc">
        <span className="acc-num">{acc.toFixed(1)}</span>
        <span className="acc-unit">% accuracy</span>
      </div>
      <div className="mix" role="img" aria-label={ORDER.map((l) => `${counts[l] ?? 0} ${l}`).join(', ')}>
        {ORDER.filter((l) => counts[l]).map((l) => (
          <span key={l} style={{ flexGrow: counts[l]! / total, background: META[l].color }} />
        ))}
      </div>
      <div className="errs">
        {(['Inaccuracy', 'Mistake', 'Blunder'] as Label[]).map((l) => (
          <span key={l} title={l}>
            <b style={{ color: META[l].text }}>{META[l].glyph}</b> {counts[l] ?? 0}
          </span>
        ))}
      </div>
    </div>
  )
}

function Commentary({
  move,
  review,
  ply,
  bestShown,
  onToggleBest,
  prevKey,
  nextKey,
  goto,
}: {
  move: Move | null
  review: Review
  ply: number
  bestShown: boolean
  onToggleBest: () => void
  prevKey?: number
  nextKey?: number
  goto: (p: number) => void
}) {
  const side = move?.color === 'w' ? 'White' : 'Black'
  const cost = move && (move.loss < 1 ? 'less than 1%' : `${Math.round(move.loss)}%`)
  return (
    <div className="comment" aria-live="polite">
      {move ? (
        <>
          <h2>
            {moveLabel(move.number, move.color, move.san)}
            {META[move.label].glyph && <span style={{ color: META[move.label].text }}> {META[move.label].glyph}</span>}
          </h2>
          <p>
            <b style={{ color: META[move.label].text }}>{move.label}.</b>{' '}
            {move.label === 'Best'
              ? 'The engine’s top choice.'
              : `It cost ${side} ${cost} of win chance. The best move was ${move.best_san}.`}
          </p>
          <p className="muted nums">
            {side} win chance {Math.round(move.win_before)}% → {Math.round(move.win_after)}%. Eval{' '}
            {evalText(review.evals[ply - 1])} → {evalText(review.evals[ply])}.
          </p>
          {move.label !== 'Best' && move.best_uci && (
            <button className="secondary" onClick={onToggleBest}>
              {bestShown ? 'Back to the game' : `Show ${move.best_san} instead`}
            </button>
          )}
        </>
      ) : (
        <>
          <h2>Start of the game</h2>
          <p className="muted">Step with the arrow keys, click a move, or click the graph below.</p>
        </>
      )}
      <div className="keynav">
        <button className="ghost" disabled={prevKey === undefined} onClick={() => goto(prevKey!)}>
          Previous mistake
        </button>
        <button className="ghost" disabled={nextKey === undefined} onClick={() => goto(nextKey!)}>
          Next mistake
        </button>
      </div>
    </div>
  )
}

function MoveList({ review, ply, onSelect }: { review: Review; ply: number; onSelect: (p: number) => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [ply])

  const rows: Move[][] = []
  for (let i = 0; i < review.moves.length; i += 2) rows.push(review.moves.slice(i, i + 2))

  return (
    <div className="moves" ref={box} role="list" aria-label="Moves">
      {rows.map((row) => (
        <div className="mrow" role="listitem" key={row[0].ply}>
          <span className="mnum">{row[0].number}</span>
          {row.map((m) => (
            <button
              key={m.ply}
              className="mcell"
              aria-current={m.ply === ply}
              onClick={() => onSelect(m.ply)}
            >
              {m.san}
              {isNotable(m.label) && <b style={{ color: m.ply === ply ? 'inherit' : META[m.label].text }}>{META[m.label].glyph}</b>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
