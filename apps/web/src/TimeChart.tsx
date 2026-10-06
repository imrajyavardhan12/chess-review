import {
  formatClock,
  formatSpent,
  isKeyMoment,
  moveName,
  type MoveTime,
  type Review,
  type TimeReport,
} from '@chessreview/core'
import { useEffect, useRef, useState } from 'react'
import { META } from './labels'

const H = 140
const PAD = { top: 8, right: 44, bottom: 16, left: 34 }

/**
 * Both players' clocks over the game. White is the solid line, Black the dashed one, each named at
 * its end; the band at the bottom is time trouble, and errors are marked in their label's colour.
 */
export function TimeChart({
  review,
  report,
  onSelect,
}: {
  review: Review
  report: TimeReport
  onSelect: (ply: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(340)
  const [hover, setHover] = useState<MoveTime | null>(null)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => e && setW(e.contentRect.width))
    ro.observe(box.current!)
    return () => ro.disconnect()
  }, [])

  const { times } = report
  const top = report.clock?.baseMs ?? Math.max(...times.map((t) => t.clockMs))
  const plies = review.moves.length
  const iw = Math.max(1, w - PAD.left - PAD.right)
  const x = (ply: number) => PAD.left + (plies <= 1 ? 0 : ((ply - 1) / (plies - 1)) * iw)
  const y = (ms: number) => PAD.top + (1 - Math.min(ms, top) / top) * (H - PAD.top - PAD.bottom)
  const path = (c: 'w' | 'b') =>
    times
      .filter((t) => t.color === c)
      .map((t, i) => `${i ? 'L' : 'M'}${x(t.ply).toFixed(1)},${y(t.clockMs).toFixed(1)}`)
      .join('')
  const last = (c: 'w' | 'b') => times.filter((t) => t.color === c).at(-1)
  const moveOf = (ply: number) => review.moves[ply - 1]!
  // Each line is named at its end; names that would overlap are pushed apart.
  const endLabels = (['w', 'b'] as const).flatMap((c) => {
    const t = last(c)
    return t ? [{ text: c === 'w' ? 'White' : 'Black', x: x(t.ply), y: y(t.clockMs) }] : []
  })
  const [a, b] = endLabels
  if (a && b && Math.abs(a.y - b.y) < 12) {
    const mid = (a.y + b.y) / 2
    const [upper, lower] = a.y <= b.y ? [a, b] : [b, a]
    upper.y = mid - 6
    lower.y = mid + 6
  }
  const nearest = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    const ply = Math.round(((clientX - r.left - PAD.left) / iw) * (plies - 1)) + 1
    return times.reduce((b, t) => (Math.abs(t.ply - ply) < Math.abs(b.ply - ply) ? t : b), times[0]!)
  }

  return (
    <div
      className="tchart"
      ref={box}
      onMouseMove={(e) => setHover(nearest(e.clientX))}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => onSelect(nearest(e.clientX).ply)}
    >
      <svg
        width={w}
        height={H}
        role="img"
        aria-label="Both clocks over the game; the table below has the numbers."
      >
        {report.thresholdMs !== null && (
          <rect
            x={PAD.left}
            y={y(report.thresholdMs)}
            width={iw}
            height={y(0) - y(report.thresholdMs)}
            className="tchart-trouble"
          />
        )}
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={PAD.left + iw} y1={y(v)} y2={y(v)} className="tchart-grid" />
            <text x={PAD.left - 5} y={y(v) + 4} className="tchart-axis" textAnchor="end">
              {formatClock(v)}
            </text>
          </g>
        ))}
        <path d={path('w')} className="tchart-line" />
        <path d={path('b')} className="tchart-line dashed" />
        {endLabels.map((l) => (
          <text key={l.text} x={l.x + 5} y={l.y + 4} className="tchart-axis">
            {l.text}
          </text>
        ))}
        {times
          .filter((t) => isKeyMoment(moveOf(t.ply).label))
          .map((t) => (
            <circle
              key={t.ply}
              cx={x(t.ply)}
              cy={y(t.clockMs)}
              r={4}
              fill={META[moveOf(t.ply).label].color}
              className="trace-mark"
            />
          ))}
        {hover && (
          <line x1={x(hover.ply)} x2={x(hover.ply)} y1={PAD.top} y2={y(0)} className="tchart-cursor" />
        )}
      </svg>
      {hover && (
        <div className="trace-tip" style={{ left: Math.max(70, Math.min(w - 70, x(hover.ply))) }}>
          <strong>{moveName(moveOf(hover.ply))}</strong> {formatClock(hover.clockMs)} left
          {hover.spentMs !== null ? `, took ${formatSpent(hover.spentMs)}` : ''}
        </div>
      )}
    </div>
  )
}
