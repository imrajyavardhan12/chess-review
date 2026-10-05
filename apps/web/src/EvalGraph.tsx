import { useEffect, useRef, useState } from 'react'
import { moveName, type Review } from '@chessreview/core'
import { META, evalText, isHighlight, isKeyMoment, isNotable } from './labels'

const H = 120

/** The graph in words: where White's win chance started and ended, and the moves that moved it most. */
export function graphSummary(review: Review): string {
  const ws = review.winSeries
  const swings = review.moves
    .map((m) => ({ m, d: (ws[m.ply] ?? 50) - (ws[m.ply - 1] ?? 50) }))
    .filter((s) => Math.abs(s.d) >= 10)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 3)
    .sort((a, b) => a.m.ply - b.m.ply)
  const pct = (v: number) => `${Math.round(v)}%`
  const moves = swings.length
    ? ` Biggest swings: ${swings.map((s) => `${moveName(s.m)} (${s.d > 0 ? 'up' : 'down'} ${pct(Math.abs(s.d))})`).join(', ')}.`
    : ' No move swung it by 10% or more.'
  return `White's win chance over the game, from ${pct(ws[0] ?? 50)} to ${pct(ws[ws.length - 1] ?? 50)}.${moves} The move list has every move.`
}
const PAD = 8

// The game's trace: white's win chance over time. White fills the area under the line,
// so a swing toward black is visible as a dip. Mistakes and blunders are marked on the line.
export function EvalGraph({
  review,
  ply,
  onSelect,
}: {
  review: Review
  ply: number
  onSelect: (ply: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => e && setW(e.contentRect.width))
    ro.observe(box.current!)
    return () => ro.disconnect()
  }, [])

  const wins = review.winSeries
  const n = wins.length - 1
  const x = (i: number) => (n === 0 ? 0 : (i / n) * w)
  const y = (win: number) => PAD + (1 - win / 100) * (H - 2 * PAD)
  const line = wins.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')

  const plyAt = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    return Math.max(0, Math.min(n, Math.round(((clientX - r.left) / r.width) * n)))
  }

  const hm = hover !== null && hover > 0 ? review.moves[hover - 1] : null
  const tipLeft = hover === null ? 0 : Math.max(70, Math.min(w - 70, x(hover)))

  return (
    <div
      className="trace"
      ref={box}
      onMouseMove={(e) => setHover(plyAt(e.clientX))}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => onSelect(plyAt(e.clientX))}
    >
      <svg width={w} height={H} role="img" aria-label={graphSummary(review)}>
        <path d={`${line}L${w},${H}L0,${H}Z`} className="trace-white" />
        <line x1={0} x2={w} y1={y(50)} y2={y(50)} className="trace-mid" />
        <path d={line} className="trace-line" />
        {review.moves
          .filter((m) => isNotable(m.label))
          .map((m) => (
            <circle
              key={m.ply}
              cx={x(m.ply)}
              cy={y(wins[m.ply] ?? 50)}
              r={isKeyMoment(m.label) || isHighlight(m.label) ? 4.5 : 3}
              fill={META[m.label].color}
              className="trace-mark"
            />
          ))}
        <line x1={x(ply)} x2={x(ply)} y1={0} y2={H} className="trace-cursor" />
        {hover !== null && hover !== ply && (
          <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="trace-hover" />
        )}
      </svg>
      <span className="trace-axis top">Black ahead</span>
      <span className="trace-axis bottom">White ahead</span>
      {hover !== null && (
        <div className="trace-tip" style={{ left: tipLeft }}>
          {hm ? (
            <>
              <strong>{moveName(hm)}</strong>
              {META[hm.label].glyph && (
                <span style={{ color: META[hm.label].color }}> {META[hm.label].glyph}</span>
              )}
              <span> {evalText(review.evals[hover]!)}</span>
            </>
          ) : (
            <strong>Start</strong>
          )}
        </div>
      )}
    </div>
  )
}
