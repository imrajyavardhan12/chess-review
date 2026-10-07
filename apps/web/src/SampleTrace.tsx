import { GLYPH } from '@chessreview/core'
import { SAMPLE } from './sample'

const W = 640
const H = 240
const PAD = 14

/**
 * The home page's picture of what the product does: one real game's win-chance trace with its three
 * biggest swings called out. It is real analysis output (see scripts/make-sample.mjs), not an illustration.
 */
export function SampleTrace() {
  const { series, marks } = SAMPLE
  const last = series.length - 1
  const y = (v: number) => PAD + (1 - v / 100) * (H - 2 * PAD)
  const line = series
    .map((v, i) => `${i ? 'L' : 'M'}${((i / last) * W).toFixed(1)},${y(v).toFixed(1)}`)
    .join('')

  return (
    <figure className="sample">
      <figcaption>
        <span className="pill">Sample</span>
        <span>{SAMPLE.title}</span>
      </figcaption>
      <div
        className="sample-plot"
        role="img"
        aria-label={`White's win chance across ${last} moves, with ${marks.length} blunders marked`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={`${line}L${W},${H}L0,${H}Z`} className="sample-fill" />
          <line x1="0" x2={W} y1={y(50)} y2={y(50)} className="sample-mid" />
          <path d={line} className="sample-line" />
        </svg>
        <span className="sample-axis top">Black ahead</span>
        <span className="sample-axis bottom">White ahead</span>
        {marks.map((m, i) => {
          const at = m.ply / last
          const crowded = i > 0 && m.ply - marks[i - 1]!.ply < 8
          return (
            <span
              key={m.ply}
              className={`flag${at > 0.7 ? ' flag-left' : ''}${crowded ? ' flag-high' : ''}`}
              style={{ left: `${at * 100}%`, top: `${(y(series[m.ply] ?? 50) / H) * 100}%` }}
            >
              <i className="flag-dot" />
              <span className="flag-text">
                {m.text} <b>{GLYPH[m.label]}</b>
              </span>
            </span>
          )
        })}
      </div>
      <p className="sample-caption">
        Win chance after every move. The yellow flags are blunders that gave up{' '}
        {marks[0] ? Math.min(...marks.map((m) => m.lost)) : 25}% or more of it.
      </p>
    </figure>
  )
}
