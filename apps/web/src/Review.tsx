import {
  coachLine,
  explainReviewMove,
  moveName,
  winPercent,
  type Counts,
  type Explanation,
  type MoveReview as Move,
  type Phase,
  type Review,
  type Side,
} from '@chessreview/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { EvalGraph } from './EvalGraph'
import { explore, fenOf, lineMoves, play, stepTo, targets, type Exploration } from './explore'
import { cancelReview, useLiveEval, useReviewState } from './hooks'
import { ERRORS, META, ORDER, evalText, isKeyMoment, isNotable } from './labels'
import { BOARDS, usePrefs } from './prefs'
import type { LiveEval } from './services'
import { Settings } from './Settings'
import { overlayFor } from './tactics'

export function ReviewPage({ id, me }: { id: string; me: string | null }) {
  const state = useReviewState(id)
  if (state?.status === 'done') return <ReviewView review={state.review} me={me} />

  return (
    <div className="home">
      <header className="homebar">
        <span className="wordmark">
          <a href="#/">chessreview</a>
        </span>
        <Settings />
      </header>
      {state?.status === 'error' || state?.status === 'missing' ? (
        <>
          <p className="error" role="alert">
            {state.status === 'error'
              ? state.message
              : 'This review isn’t on this device. Reviews are stored in your browser, so open the game from your list again.'}
          </p>
          <a href="#/">Back to your games</a>
        </>
      ) : (
        <div className="progress" role="status">
          <h1>Analysing</h1>
          <p className="muted">
            {state?.status === 'running' && state.total > 0
              ? `Step ${state.done} of ${state.total}. The engine runs on your device, so speed depends on it.`
              : 'Starting the engine.'}
          </p>
          <div className="bar">
            <div
              style={{
                width: `${state?.status === 'running' && state.total ? (state.done / state.total) * 100 : 3}%`,
              }}
            />
          </div>
          <p>
            <button
              className="ghost"
              onClick={() => {
                void cancelReview(id)
                location.hash = '#/'
              }}
            >
              Cancel
            </button>
          </p>
        </div>
      )}
    </div>
  )
}

// Where the explored line goes next.
const LINE_ARROW = 'rgba(76,127,214,0.8)'

const isLight = (sq: string) => (sq.charCodeAt(0) - 97 + Number(sq[1]) - 1) % 2 === 1

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
  // Moves the user is trying out on the board: never stored, never part of the review.
  const [exploring, setExploring] = useState<Exploration | null>(null)
  // A piece picked up by clicking, waiting for a click on where it goes.
  const [picked, setPicked] = useState<string | null>(null)
  const sq = BOARDS[usePrefs().board]
  const orientation = flipped ? 'black' : 'white'
  const n = review.fens.length - 1

  const goto = (p: number) => {
    setPly(Math.max(0, Math.min(n, p)))
    setShowBest(false)
    setExploring(null)
    setPicked(null)
    setTab('moves')
  }
  const startExploring = (x: Exploration) => {
    setExploring(x)
    setShowBest(false)
    setPicked(null)
    setTab('moves')
  }

  const move: Move | null = ply > 0 ? (review.moves[ply - 1] ?? null) : null
  const bestShown = !exploring && showBest && !!move && !!move.bestUci && move.bestUci !== move.uci
  const exploreFen = exploring ? fenOf(exploring) : null
  const fen = exploreFen ?? (bestShown ? review.fens[ply - 1]! : review.fens[ply]!)
  const { live, last, thinking } = useLiveEval(exploreFen)

  const tactic = useMemo(() => (ply > 0 ? explainReviewMove(review, ply - 1) : null), [review, ply])
  const overlay = overlayFor(tactic, fen)

  // The step buttons walk the exploration while there is one, the game otherwise.
  const at = exploring ? exploring.at : ply
  const end = exploring ? exploring.moves.length : n
  const walk = (p: number) => (exploring ? setExploring(stepTo(exploring, p)) : goto(p))

  /** Plays a move on the board, starting an exploration from the shown position if none is running. */
  const tryMove = (from: string, to: string): boolean => {
    const next = play(exploring ?? explore(fen), from, to)
    if (next) startExploring(next)
    return next !== null
  }

  const keyPlies = useMemo(() => review.moves.filter((m) => isKeyMoment(m.label)).map((m) => m.ply), [review])
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
      const keys: Record<string, () => void> = exploring
        ? {
            ArrowLeft: () => setExploring(stepTo(exploring, exploring.at - 1)),
            ArrowRight: () => setExploring(stepTo(exploring, exploring.at + 1)),
            Home: () => setExploring(stepTo(exploring, 0)),
            End: () => setExploring(stepTo(exploring, exploring.moves.length)),
            Escape: () => setExploring(null),
            f: () => setFlipped((v) => !v),
          }
        : {
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

  const moveArrows =
    bestShown && move
      ? [
          {
            startSquare: move.uci.slice(0, 2),
            endSquare: move.uci.slice(2, 4),
            color: 'rgba(200,64,60,0.75)',
          },
          { startSquare: move.bestUci.slice(0, 2), endSquare: move.bestUci.slice(2, 4), color: '#2E8B62' },
        ]
      : []
  // While exploring: where the line goes next, and the engine's choice.
  const exploreArrows: typeof moveArrows = []
  if (exploring) {
    const next = exploring.moves[exploring.at]
    if (next)
      exploreArrows.push({ startSquare: next.slice(0, 2), endSquare: next.slice(2, 4), color: LINE_ARROW })
    const best = live?.line[0]
    if (best && best !== next)
      exploreArrows.push({ startSquare: best.slice(0, 2), endSquare: best.slice(2, 4), color: '#2E8B62' })
  }
  // The tactic's own arrow, unless it repeats one already drawn.
  const drawn = [...moveArrows, ...exploreArrows]
  const arrows = [
    ...drawn,
    ...overlay.arrows.filter(
      (a) => !drawn.some((m) => m.startSquare === a.startSquare && m.endSquare === a.endSquare),
    ),
  ]
  const ringColor = move ? META[move.label].color : 'transparent'

  const lastUci = exploring ? exploring.moves[exploring.at - 1] : bestShown ? undefined : move?.uci
  const lastSquares = lastUci ? [lastUci.slice(0, 2), lastUci.slice(2, 4)] : []
  const badge =
    move && !bestShown && !exploring && (isNotable(move.label) || move.label === 'Best') ? move : null
  const dots = picked ? targets(fen, picked) : []

  const top: Side = orientation === 'white' ? 'black' : 'white'
  const bottom: Side = orientation === 'white' ? 'white' : 'black'
  const h = review.headers
  const rating = (s: Side) => (s === 'white' ? h.WhiteElo : h.BlackElo)
  const evalPly = bestShown ? ply - 1 : ply // the eval of whichever position is on the board
  // While exploring, the live eval; until it arrives, the bar holds the last one it had.
  const shownEval = exploring ? (live ?? last)?.eval : review.evals[evalPly]
  const win = shownEval ? winPercent(shownEval.cp) : (review.winSeries[evalPly] ?? 50)
  const evalLabel = exploring && thinking ? '…' : shownEval ? evalText(shownEval) : '…'
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
            {[
              review.result.replace('-', '–'),
              h.Termination,
              opening,
              h.Date && !h.Date.includes('?') ? h.Date.replaceAll('.', '-') : '',
            ]
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
            <EvalBar win={win} evalLabel={evalLabel} orientation={orientation} />
            <div className="board">
              <Chessboard
                options={{
                  position: fen,
                  boardOrientation: orientation,
                  allowDragging: true,
                  onPieceDrop: ({ sourceSquare, targetSquare }) =>
                    targetSquare !== null && tryMove(sourceSquare, targetSquare),
                  onSquareClick: ({ piece, square }) => {
                    if (picked && dots.includes(square) && tryMove(picked, square)) return
                    const mine = piece && piece.pieceType[0] === fen.split(' ')[1]
                    setPicked(mine && square !== picked ? square : null)
                  },
                  allowDrawingArrows: false,
                  clearArrowsOnPositionChange: false,
                  animationDurationInMs: 160,
                  lightSquareStyle: { backgroundColor: sq.light },
                  darkSquareStyle: { backgroundColor: sq.dark },
                  arrows,
                  squareRenderer: ({ square, children }) => {
                    const hl = lastSquares.includes(square)
                    const showBadge = badge && square === badge.uci.slice(2, 4)
                    const ring = overlay.rings.includes(square)
                    const dot = dots.includes(square)
                    return (
                      <div
                        data-ring={ring || undefined}
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'relative',
                          backgroundColor:
                            hl || square === picked ? (isLight(square) ? sq.hlLight : sq.hlDark) : undefined,
                          boxShadow: ring ? `inset 0 0 0 3px ${ringColor}` : undefined,
                        }}
                      >
                        {children}
                        {dot && <span className="dot-target" aria-hidden="true" />}
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
            <IconButton
              label="Start"
              onClick={() => walk(0)}
              disabled={at === 0}
              d="M6 5v14M18 5l-8 7 8 7z"
            />
            <IconButton
              label="Previous move"
              onClick={() => walk(at - 1)}
              disabled={at === 0}
              d="M15 5l-8 7 8 7z"
            />
            <IconButton
              label="Next move"
              onClick={() => walk(at + 1)}
              disabled={at === end}
              d="M9 5l8 7-8 7z"
            />
            <IconButton
              label="End"
              onClick={() => walk(end)}
              disabled={at === end}
              d="M18 5v14M6 5l8 7-8 7z"
            />
            <button className="ghost" onClick={() => setFlipped((v) => !v)} title="Flip board (f)">
              Flip board
            </button>
            {!exploring && (
              <button className="ghost" onClick={() => startExploring(explore(fen))}>
                Explore
              </button>
            )}
          </div>
          <p className="hint">
            {exploring
              ? 'Arrow keys step through your moves. Esc returns to the game.'
              : 'Arrow keys step through the game. F flips the board, B shows the best move. Move a piece to explore.'}
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
              <button key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
                {t === 'moves' ? 'Moves' : 'Report'}
              </button>
            ))}
          </div>
          {tab === 'moves' ? (
            <>
              {exploring ? (
                <ExplorePanel
                  x={exploring}
                  live={live}
                  thinking={thinking}
                  onChange={setExploring}
                  onExit={() => setExploring(null)}
                />
              ) : (
                <Commentary
                  move={move}
                  tactic={tactic}
                  review={review}
                  mySide={mySide}
                  ply={ply}
                  bestShown={bestShown}
                  onToggleBest={() => setShowBest((v) => !v)}
                  onExplore={startExploring}
                  prevKey={prevKey}
                  nextKey={nextKey}
                  goto={goto}
                />
              )}
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

function EvalBar({ win, evalLabel, orientation }: { win: number; evalLabel: string; orientation: Side }) {
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

function IconButton({
  label,
  d,
  onClick,
  disabled,
}: {
  label: string
  d: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button className="icon" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <path d={d} />
      </svg>
    </button>
  )
}

function PlayerSummary({
  name,
  acc,
  counts,
  isMe,
}: {
  name: string
  acc: number
  counts: Counts
  isMe: boolean
}) {
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
              Go to {moveName(move)}
            </button>
          </>
        )}
      </p>
    </div>
  )
}

/** Commentary for a move: the tactic behind it when one was found, then what it cost or saved. */
function explain(m: Move, side: string, opening: string, tactic: Explanation | null): string {
  const cost = m.loss < 1 ? 'less than 1%' : `${Math.round(m.loss)}%`
  const best = m.bestSan && m.bestUci !== m.uci ? ` The best move was ${m.bestSan}.` : ''
  const why = tactic ? `${tactic.text} ` : ''
  switch (m.label) {
    case 'Brilliant':
      return tactic
        ? tactic.text
        : 'A sacrifice that works out. The engine rates it among the best moves in the position.'
    case 'Great': {
      const gap = m.gap ? ` The next best would have cost ${side} ${Math.round(m.gap)}% of win chance.` : ''
      return tactic ? `${tactic.text}${gap}` : `The only move that held the position.${gap}`
    }
    case 'Book':
      return `A known opening move${opening ? `: ${opening}` : ''}.`
    case 'Best':
      return 'The engine’s top choice.'
    case 'Miss':
      return tactic
        ? `${why}It cost ${side} ${cost} of win chance.`
        : `The last move gave ${side} a chance and this one let it go, costing ${cost} of win chance.${best}`
    default:
      return `${why}It cost ${side} ${cost} of win chance.${tactic ? '' : best}`
  }
}

function Commentary({
  move,
  tactic,
  review,
  mySide,
  ply,
  bestShown,
  onToggleBest,
  onExplore,
  prevKey,
  nextKey,
  goto,
}: {
  move: Move | null
  tactic: Explanation | null
  review: Review
  mySide: Side | null
  ply: number
  bestShown: boolean
  onToggleBest: () => void
  onExplore: (x: Exploration) => void
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
            {moveName(move)}
            {META[move.label].glyph && (
              <span style={{ color: META[move.label].text }}> {META[move.label].glyph}</span>
            )}
          </h2>
          <p>
            <b style={{ color: META[move.label].text }}>{move.label}.</b>{' '}
            {explain(move, side, review.opening, tactic)}
          </p>
          {move.loss > 0.5 && <Swing move={move} />}
          <p className="muted nums">
            {side} win chance {Math.round(move.winBefore)}% → {Math.round(move.winAfter)}%. Eval{' '}
            {evalText(review.evals[ply - 1]!)} → {evalText(review.evals[ply]!)}.
          </p>
          {move.bestUci && move.bestUci !== move.uci && (review.lines[ply - 1]?.length ?? 0) > 0 && (
            <div className="bestline">
              <span className="muted">Best line</span>
              <MoveChips
                fen={review.fens[ply - 1]!}
                line={review.lines[ply - 1]!.slice(0, 8)}
                label="Best line"
                onPick={(i) => onExplore(explore(review.fens[ply - 1]!, review.lines[ply - 1], i + 1))}
              />
            </div>
          )}
          {tactic && tactic.line.length > 0 && (
            <button
              className="link"
              onClick={() => onExplore(explore(tactic.fen, tactic.line, Math.max(0, tactic.at) + 1))}
            >
              Step through it
            </button>
          )}
          {move.bestUci && move.bestUci !== move.uci && (
            <button className="secondary" onClick={onToggleBest}>
              {bestShown ? 'Back to the game' : `Show ${move.bestSan} instead`}
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

/** A line as buttons, one per move; `current` marks the move on the board. */
function MoveChips({
  fen,
  line,
  label,
  current,
  onPick,
}: {
  fen: string
  line: readonly string[]
  label: string
  current?: number
  onPick: (index: number) => void
}) {
  return (
    <span className="chips" role="list" aria-label={label}>
      {lineMoves(fen, line).map((m) => (
        <span role="listitem" key={m.index}>
          <button className="chip" aria-current={m.index === current} onClick={() => onPick(m.index)}>
            {m.text}
          </button>
        </span>
      ))}
    </span>
  )
}

/** Free analysis: what the user is trying, and what the engine thinks of it. Nothing here is saved. */
function ExplorePanel({
  x,
  live,
  thinking,
  onChange,
  onExit,
}: {
  x: Exploration
  live: LiveEval | undefined
  thinking: boolean
  onChange: (x: Exploration) => void
  onExit: () => void
}) {
  const fen = fenOf(x)
  return (
    <div className="comment explore" aria-live="polite">
      <h2>Exploring</h2>
      <p className="muted">Try moves on the board. They are not part of the review and are not saved.</p>
      <p className="nums explore-eval">
        <b>{thinking || !live ? 'Thinking…' : evalText(live.eval)}</b>
        {live && !thinking && live.depth > 0 && <span className="muted"> depth {live.depth}</span>}
      </p>
      {live && !thinking && live.line.length > 0 && (
        <div className="bestline">
          <span className="muted">Engine</span>
          <MoveChips
            fen={fen}
            line={live.line.slice(0, 8)}
            label="Engine line"
            onPick={(i) =>
              onChange(
                explore(x.root, [...x.moves.slice(0, x.at), ...live.line.slice(0, i + 1)], x.at + i + 1),
              )
            }
          />
        </div>
      )}
      <div className="bestline">
        <span className="muted">Moves</span>
        {x.moves.length ? (
          <MoveChips
            fen={x.root}
            line={x.moves}
            label="Your moves"
            current={x.at - 1}
            onPick={(i) => onChange(stepTo(x, i + 1))}
          />
        ) : (
          <span className="muted"> none yet</span>
        )}
      </div>
      <button className="secondary" onClick={onExit}>
        Back to the game
      </button>
    </div>
  )
}

const PHASE_NAMES: Record<Phase, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
}

function Report({
  review,
  mySide,
  goto,
}: {
  review: Review
  mySide: Side | null
  goto: (p: number) => void
}) {
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
  const num = (v: number | null, suffix = '') => (v === null ? '–' : `${v.toFixed(1)}${suffix}`)
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
            <td>{review.ratingEstimate.white}</td>
            <td>{review.ratingEstimate.black}</td>
          </tr>
          <tr>
            <th scope="row">Average centipawn loss</th>
            <td>{Math.round(review.acpl.white)}</td>
            <td>{Math.round(review.acpl.black)}</td>
          </tr>
        </tbody>
      </table>
      <p className="note muted">
        The rating is a rough guess from average centipawn loss, not a calibrated rating. Treat it as a way to
        compare the two players in this game. Move labels come from the engine’s win-chance model.
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
        <div className="mrow" role="listitem" key={row[0]!.ply}>
          <span className="mnum">{row[0]!.number}</span>
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
  const kept = Math.min(move.winBefore, move.winAfter)
  return (
    <div
      className="swing"
      role="img"
      aria-label={`Win chance ${Math.round(move.winBefore)}% to ${Math.round(move.winAfter)}%`}
    >
      <span className="swing-kept" style={{ width: `${kept}%` }} />
      <span
        className="swing-lost"
        style={{ left: `${kept}%`, width: `${move.loss}%`, background: META[move.label].color }}
      />
    </div>
  )
}
