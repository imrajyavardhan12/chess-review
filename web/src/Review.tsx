import { useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { getReview } from './api'
import { EvalGraph } from './EvalGraph'
import { ERRORS, META, ORDER, evalText, isKeyMoment, isNotable, moveLabel } from './labels'
import { BOARDS, usePrefs } from './prefs'
import { Settings } from './Settings'
import type { Counts, Move, Phase, Review } from './types'

type View =
  | { kind: 'running'; done: number; total: number; queued: boolean }
  | { kind: 'done'; review: Review }
  | { kind: 'error'; message: string }

type Side = 'white' | 'black'

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
              : `Step ${view.done} of ${view.total}. This takes about a minute.`}
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
const sideOf = (m: Move): Side => (m.color === 'w' ? 'white' : 'black')

function ReviewView({ review, me }: { review: Review; me: string | null }) {
  const mySide: Side | null = !me
    ? null
    : review.white.toLowerCase() === me.toLowerCase()
      ? 'white'
      : review.black.toLowerCase() === me.toLowerCase()
        ? 'black'
        : null

  const [ply, setPly] = useState(0)
  const [flipped, setFlipped] = useState(mySide === 'black')
  const [showBest, setShowBest] = useState(false)
  const [tab, setTab] = useState<'moves' | 'report'>('moves')
  const sq = BOARDS[usePrefs().board]
  const orientation = flipped ? 'black' : 'white'
  const n = review.fens.length - 1

  const goto = (p: number) => {
    setPly(Math.max(0, Math.min(n, p)))
    setShowBest(false)
    setTab('moves')
  }

  const move: Move | null = ply > 0 ? review.moves[ply - 1] : null
  const bestShown = showBest && !!move && !!move.best_uci && move.best_uci !== move.uci
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

  const top: Side = orientation === 'white' ? 'black' : 'white'
  const bottom: Side = orientation === 'white' ? 'white' : 'black'
  const h = review.headers
  const rating = (s: Side) => (s === 'white' ? h.WhiteElo : h.BlackElo)
  const evalPly = bestShown ? ply - 1 : ply // the eval of whichever position is on the board
  const win = review.win_series[evalPly]
  const opening = [review.eco, review.opening].filter(Boolean).join(' ')

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
            {[review.result.replace('-', '–'), h.Termination, opening, h.Date && !h.Date.includes('?') ? h.Date.replaceAll('.', '-') : '']
              .filter(Boolean)
              .join(', ')}
          </p>
        </div>
        <Settings />
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
                  lightSquareStyle: { backgroundColor: sq.light },
                  darkSquareStyle: { backgroundColor: sq.dark },
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
                          backgroundColor: hl ? (isLight(square) ? sq.hlLight : sq.hlDark) : undefined,
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
          <p className="hint">
            Arrow keys step through the game. F flips the board, B shows the best move.
          </p>
        </section>

        <aside className={`panel${tab === 'report' ? ' compact' : ''}`}>
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
          <div className="tabs" role="tablist">
            {(['moves', 'report'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className="tab"
                onClick={() => setTab(t)}
              >
                {t === 'moves' ? 'Moves' : 'Report'}
              </button>
            ))}
          </div>
          {tab === 'moves' ? (
            <>
              <Commentary
                move={move}
                review={review}
                mySide={mySide}
                ply={ply}
                bestShown={bestShown}
                onToggleBest={() => setShowBest((v) => !v)}
                prevKey={prevKey}
                nextKey={nextKey}
                goto={goto}
              />
              <MoveList review={review} ply={ply} onSelect={goto} />
            </>
          ) : (
            <Report review={review} mySide={mySide} goto={goto} />
          )}
        </aside>
      </div>

      <EvalGraph review={review} ply={ply} onSelect={goto} />
    </div>
  )
}

function PlayerTag({ name, rating, side }: { name: string; rating?: string; side: Side }) {
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
  orientation: Side
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
        {ERRORS.map((l) => (
          <span key={l} title={l}>
            <b style={{ color: META[l].text }}>{META[l].glyph}</b> {counts[l] ?? 0}
          </span>
        ))}
      </div>
    </div>
  )
}

// A short plain-language read of the game, written from the numbers. Speaks to "you" when we
// know which player is the user, otherwise describes both sides.
function coachLine(r: Review, side: Side | null): { text: string; move: Move | null } {
  const errs = r.moves.filter((m) => isKeyMoment(m.label) && (!side || sideOf(m) === side))
  const worst = [...errs].sort((a, b) => b.loss - a.loss)[0] ?? null
  const gap = (a: number, b: number) => `${a.toFixed(1)} to ${b.toFixed(1)}`

  if (side) {
    const opp: Side = side === 'white' ? 'black' : 'white'
    const a = r.accuracy[side]
    const b = r.accuracy[opp]
    const lead =
      Math.abs(a - b) < 3
        ? `Accuracy was close, ${gap(a, b)}.`
        : a > b
          ? `You played more accurately than ${r[opp]}, ${gap(a, b)}.`
          : `${r[opp]} played more accurately, ${gap(b, a)}.`
    const tail = worst
      ? `Your costliest error was ${moveLabel(worst.number, worst.color, worst.san)}, which gave up ${Math.round(worst.loss)}% of your win chance.`
      : 'You made no mistakes or blunders.'
    const found = (label: 'Brilliant' | 'Great') => r.moves.filter((m) => sideOf(m) === side && m.label === label)
    const brill = found('Brilliant')
    const great = found('Great')
    const star = brill.length
      ? ` You found ${brill.length} brilliant move${brill.length > 1 ? 's' : ''}.`
      : great.length
        ? ` You found ${great.length} great move${great.length > 1 ? 's' : ''}.`
        : ''
    return { text: `${lead} ${tail}${star}`, move: worst ?? brill[0] ?? great[0] ?? null }
  }

  const w = r.accuracy.white
  const b = r.accuracy.black
  const lead =
    Math.abs(w - b) < 3
      ? `Accuracy was close, ${gap(w, b)}.`
      : w > b
        ? `${r.white} played more accurately, ${gap(w, b)}.`
        : `${r.black} played more accurately, ${gap(b, w)}.`
  const tail = worst
    ? `The biggest swing was ${moveLabel(worst.number, worst.color, worst.san)} by ${worst.color === 'w' ? r.white : r.black}, worth ${Math.round(worst.loss)}% of win chance.`
    : 'Neither side made a serious mistake.'
  return { text: `${lead} ${tail}`, move: worst }
}

function Coach({ review, mySide, goto }: { review: Review; mySide: Side | null; goto: (p: number) => void }) {
  const { text, move } = coachLine(review, mySide)
  return (
    <div className="coach">
      <p>
        {text}
        {move && (
          <>
            {' '}
            <button className="link" onClick={() => goto(move.ply)}>
              Go to {moveLabel(move.number, move.color, move.san)}
            </button>
          </>
        )}
      </p>
    </div>
  )
}

function explain(m: Move, side: string, opening: string): string {
  const cost = m.loss < 1 ? 'less than 1%' : `${Math.round(m.loss)}%`
  const best = m.best_san && m.best_uci !== m.uci ? ` The best move was ${m.best_san}.` : ''
  switch (m.label) {
    case 'Brilliant':
      return 'A sacrifice that works out. The engine rates it among the best moves in the position.'
    case 'Great':
      return m.gap
        ? `The only move that held the position. The next best would have cost ${side} ${Math.round(m.gap)}% of win chance.`
        : 'The only move that held the position.'
    case 'Book':
      return `A known opening move${opening ? `: ${opening}` : ''}.`
    case 'Best':
      return 'The engine’s top choice.'
    case 'Miss':
      return `The last move gave ${side} a chance and this one let it go, costing ${cost} of win chance.${best}`
    default:
      return `It cost ${side} ${cost} of win chance.${best}`
  }
}

function Commentary({
  move,
  review,
  mySide,
  ply,
  bestShown,
  onToggleBest,
  prevKey,
  nextKey,
  goto,
}: {
  move: Move | null
  review: Review
  mySide: Side | null
  ply: number
  bestShown: boolean
  onToggleBest: () => void
  prevKey?: number
  nextKey?: number
  goto: (p: number) => void
}) {
  const side = move?.color === 'w' ? 'White' : 'Black'
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
            {explain(move, side, review.opening)}
          </p>
          {move.loss > 0.5 && <Swing move={move} />}
          <p className="muted nums">
            {side} win chance {Math.round(move.win_before)}% → {Math.round(move.win_after)}%. Eval{' '}
            {evalText(review.evals[ply - 1])} → {evalText(review.evals[ply])}.
          </p>
          {move.best_uci && move.best_uci !== move.uci && (
            <button className="secondary" onClick={onToggleBest}>
              {bestShown ? 'Back to the game' : `Show ${move.best_san} instead`}
            </button>
          )}
        </>
      ) : (
        <>
          <h2>Start of the game</h2>
          <Coach review={review} mySide={mySide} goto={goto} />
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

const PHASE_NAMES: Record<Phase, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }

function Report({ review, mySide, goto }: { review: Review; mySide: Side | null; goto: (p: number) => void }) {
  const heads = (
    <tr>
      <td />
      {(['white', 'black'] as const).map((s) => (
        <th key={s} scope="col" className="who">
          {review[s]}
        </th>
      ))}
    </tr>
  )
  const num = (v: number | null, suffix = '') => (v === null ? '–' : `${v}${suffix}`)
  return (
    <div className="report">
      <Coach review={review} mySide={mySide} goto={goto} />

      <h3>Move quality</h3>
      <table className="rtable">
        <thead>{heads}</thead>
        <tbody>
          {ORDER.map((l) => (
            <tr key={l}>
              <th scope="row" title={META[l].help}>
                <i className="sw" style={{ background: META[l].color }} />
                {l}
              </th>
              {(['white', 'black'] as const).map((s) => {
                const c = review.counts[s][l] ?? 0
                return (
                  <td key={s} className={c ? '' : 'zero'}>
                    {c}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Accuracy by phase</h3>
      <table className="rtable">
        <thead>{heads}</thead>
        <tbody>
          {(Object.keys(PHASE_NAMES) as Phase[]).map((p) => (
            <tr key={p}>
              <th scope="row">{PHASE_NAMES[p]}</th>
              <td>{num(review.phases.white[p], '%')}</td>
              <td>{num(review.phases.black[p], '%')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Performance estimate</h3>
      <table className="rtable">
        <thead>{heads}</thead>
        <tbody>
          <tr>
            <th scope="row">Rating</th>
            <td>{review.rating_estimate.white}</td>
            <td>{review.rating_estimate.black}</td>
          </tr>
          <tr>
            <th scope="row">Average centipawn loss</th>
            <td>{review.acpl.white}</td>
            <td>{review.acpl.black}</td>
          </tr>
        </tbody>
      </table>
      <p className="note muted">
        The rating is a rough guess from average centipawn loss, not a calibrated rating. Treat it as a
        way to compare the two players in this game. Move labels come from the engine’s win-chance model.
      </p>
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
              {isNotable(m.label) && (
                <b style={{ color: m.ply === ply ? 'inherit' : META[m.label].text }}>{META[m.label].glyph}</b>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// How much of the mover's win chance survived the move; the lost part is drawn in the label's color.
function Swing({ move }: { move: Move }) {
  const kept = Math.min(move.win_before, move.win_after)
  return (
    <div className="swing" role="img" aria-label={`Win chance ${Math.round(move.win_before)}% to ${Math.round(move.win_after)}%`}>
      <span className="swing-kept" style={{ width: `${kept}%` }} />
      <span
        className="swing-lost"
        style={{ left: `${kept}%`, width: `${move.loss}%`, background: META[move.label].color }}
      />
    </div>
  )
}
