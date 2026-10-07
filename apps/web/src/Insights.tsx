import { insights, playersIn, type Insights as Stats, type Phase, type Tally } from '@chessreview/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader } from './AppHeader'
import { useAsync } from './hooks'
import { factsFor, tacticName } from './insight-facts'
import { ERRORS, META } from './labels'
import { getReviewService } from './services'

const REMEMBERED = 'chessreview.user'
const remembered = () => {
  try {
    return localStorage.getItem(REMEMBERED) ?? ''
  } catch {
    return ''
  }
}

const PHASE_NAMES: Record<Phase, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
}
const TIME_NAMES: Record<string, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  daily: 'Daily',
  unknown: 'Unknown',
}
const pct = (v: number | null) => (v === null ? '–' : `${v.toFixed(0)}%`)

/** Statistics across every game reviewed on this device, for one player. Nothing leaves the device. */
export function InsightsPage() {
  const stored = useAsync('all', async () => (await getReviewService()).allReviews())
  const reviews = useMemo(() => stored.value ?? [], [stored.value])
  const players = useMemo(() => playersIn(reviews.map((s) => s.review)), [reviews])
  const [chosen, setChosen] = useState<string | null>(null)
  const fallback =
    players.find((p) => p.name.toLowerCase() === remembered().toLowerCase())?.name ?? players[0]?.name ?? null
  const player = chosen ?? fallback

  const [progress, setProgress] = useState<{ key: string; done: number; total: number } | null>(null)
  const key = player ? `${player}|${reviews.length}` : null
  const facts = useAsync(key, (signal) =>
    factsFor(reviews, player!, (done, total) => setProgress({ key: key!, done, total }), signal),
  )
  const stats = useMemo(
    () => (facts.value && !facts.loading ? insights(facts.value) : null),
    [facts.value, facts.loading],
  )

  useEffect(() => {
    document.title = 'Insights · chessreview'
  }, [])

  return (
    <>
      <AppHeader active="insights" />
      <main className="page insights">
        <div className="insights-head">
          <h1>Insights</h1>
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
        ) : players.length === 0 ? (
          <div className="empty">
            <p>No reviewed games on this device yet.</p>
            <p className="muted">
              Review a few games and this page shows how your accuracy moves over time, where in the game your
              errors happen, which tactics catch you out, and how your openings and time controls go. It is
              worked out in your browser from your reviews; nothing is sent anywhere.
            </p>
            <a className="primary" href="#/">
              Review a game
            </a>
          </div>
        ) : !stats ? (
          <p className="muted" role="status">
            Working through your games
            {progress?.key === key ? ` (${progress.done} of ${progress.total})` : ''}…
          </p>
        ) : (
          <Report stats={stats} />
        )}
      </main>
    </>
  )
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function Report({ stats }: { stats: Stats }) {
  const best = stats.openings.filter((o) => o.games >= 2)
  const phases = Object.keys(PHASE_NAMES) as Phase[]
  const record = {
    won: sum(stats.timeClasses.map((t) => t.wins)),
    drawn: sum(stats.timeClasses.map((t) => t.draws)),
    lost: sum(stats.timeClasses.map((t) => t.losses)),
  }
  const moves = sum(phases.map((p) => stats.phases[p].moves))
  const errors = sum(
    phases.map((p) => (stats.phases[p].moves * sum(ERRORS.map((l) => stats.phases[p].per100[l] ?? 0))) / 100),
  )
  const per100 = moves ? (errors / moves) * 100 : 0
  const worst = Math.max(1, ...phases.map((p) => sum(ERRORS.map((l) => stats.phases[p].per100[l] ?? 0))))

  return (
    <>
      <p className="lead">
        {stats.games} game{stats.games === 1 ? '' : 's'} reviewed. Average accuracy{' '}
        {stats.accuracy.toFixed(1)}%
        {stats.games > 10 ? `, ${stats.recentAccuracy.toFixed(1)}% over the last ten` : ''}.
      </p>

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Accuracy</span>
          <b className="tile-num">
            {stats.accuracy.toFixed(1)}
            <small>%</small>
          </b>
          <span className="tile-sub">
            {stats.games > 10
              ? `${stats.recentAccuracy.toFixed(1)}% over the last ten`
              : `across ${stats.games} game${stats.games === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Record</span>
          <b className="tile-num">
            <span className="won">{record.won}</span>
            <i>–</i>
            {record.drawn}
            <i>–</i>
            <span className="lost">{record.lost}</span>
          </b>
          <span className="tile-sub">wins, draws and losses</span>
        </div>
        <div className="tile">
          <span className="tile-label">Errors</span>
          <b className="tile-num">{per100.toFixed(1)}</b>
          <span className="tile-sub">per 100 of your moves, inaccuracies included</span>
        </div>
      </div>

      <section className="card" aria-labelledby="trend">
        <h2 id="trend">Accuracy over time</h2>
        <AccuracyChart trend={stats.trend} />
        <details>
          <summary>As a table</summary>
          <table className="rtable">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Opponent</th>
                <th scope="col">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {stats.trend.map((t) => (
                <tr key={t.id}>
                  <td>{t.date ?? '–'}</td>
                  <td>
                    <a href={`#/review/${t.id}`}>{t.opponent}</a>
                  </td>
                  <td>{t.accuracy.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="pair">
        <section className="card" aria-labelledby="phases">
          <h2 id="phases">Errors by phase</h2>
          <p className="muted">Per 100 of your moves in each phase of the game.</p>
          <div className="phasebars">
            {phases.map((p) => {
              const per = stats.phases[p].per100
              const total = sum(ERRORS.map((l) => per[l] ?? 0))
              const has = stats.phases[p].moves > 0
              return (
                <div key={p} className="phasebar">
                  <div className="phasebar-head">
                    <span>{PHASE_NAMES[p]}</span>
                    <b>{has ? total.toFixed(1) : '–'}</b>
                  </div>
                  <div
                    className="stack"
                    role="img"
                    aria-label={ERRORS.map((l) => `${(per[l] ?? 0).toFixed(1)} ${l}`).join(', ')}
                    style={{ width: `${has ? Math.max(4, (total / worst) * 100) : 0}%` }}
                  >
                    {ERRORS.filter((l) => per[l]).map((l) => (
                      <i key={l} style={{ flexGrow: per[l], background: META[l].color }} />
                    ))}
                  </div>
                  <small className="muted">{stats.phases[p].moves} moves</small>
                </div>
              )
            })}
          </div>
          <details>
            <summary>As a table</summary>
            <table className="rtable">
              <thead>
                <tr>
                  <td />
                  {ERRORS.map((l) => (
                    <th key={l} scope="col" title={META[l].help}>
                      <i className="sw" style={{ background: META[l].color }} />
                      <span className="long">{l}</span>
                      <span className="short" aria-hidden="true">
                        {META[l].glyph}
                      </span>
                    </th>
                  ))}
                  <th scope="col">Moves</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((p) => (
                  <tr key={p}>
                    <th scope="row">{PHASE_NAMES[p]}</th>
                    {ERRORS.map((l) => (
                      <td key={l}>
                        {stats.phases[p].moves ? (stats.phases[p].per100[l] ?? 0).toFixed(1) : '–'}
                      </td>
                    ))}
                    <td>{stats.phases[p].moves}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <ul className="legend">
            {ERRORS.map((l) => (
              <li key={l}>
                <i className="sw" style={{ background: META[l].color }} />
                {l}
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="tactics">
          <h2 id="tactics">What your errors had in common</h2>
          {stats.tactics.length === 0 ? (
            <p className="muted">No tactic stood out in your mistakes and blunders yet.</p>
          ) : (
            <>
              <p className="muted">
                {stats.tagged.withTactic} of your {stats.tagged.errors} mistakes, misses and blunders had a
                tactic the engine’s lines confirm.
              </p>
              <table className="rtable tally">
                <tbody>
                  {stats.tactics.slice(0, 8).map((t) => (
                    <tr key={`${t.kind}/${t.perspective}`}>
                      <th scope="row">{tacticName(t.kind, t.perspective)}</th>
                      <td>{t.count}</td>
                      <td className="barcell" aria-hidden="true">
                        <span style={{ width: `${(t.count / stats.tactics[0]!.count) * 100}%` }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>

      <div className="pair">
        <section className="card" aria-labelledby="openings">
          <h2 id="openings">Openings</h2>
          <TallyTable
            rows={(best.length ? best : stats.openings).slice(0, 8).map((o) => ({ name: o.opening, ...o }))}
            label="Opening"
          />
          {best.length > 0 && best.length < stats.openings.length && (
            <p className="note muted">Openings you have played at least twice.</p>
          )}
        </section>

        <section className="card" aria-labelledby="time">
          <h2 id="time">Time controls</h2>
          <TallyTable
            rows={stats.timeClasses.map((t) => ({ name: TIME_NAMES[t.timeClass]!, ...t }))}
            label="Time control"
          />
        </section>
      </div>
    </>
  )
}

function TallyTable({ rows, label }: { rows: Array<Tally & { name: string }>; label: string }) {
  return (
    <table className="rtable">
      <thead>
        <tr>
          <th scope="col">{label}</th>
          <th scope="col">Games</th>
          <th scope="col" title="Wins, draws and losses">
            W / D / L
          </th>
          <th scope="col" title="Points per game: a win is 1, a draw a half">
            Score
          </th>
          <th scope="col">Accuracy</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <th scope="row">{r.name}</th>
            <td>{r.games}</td>
            <td>
              {r.wins} / {r.draws} / {r.losses}
            </td>
            <td>{pct(r.score)}</td>
            <td>{r.accuracy.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const H = 170
const PAD = { top: 10, right: 8, bottom: 18, left: 30 }

/** One series, accuracy per game, oldest first, with a crosshair and a tooltip; click a game to open it. */
function AccuracyChart({ trend }: { trend: Stats['trend'] }) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => e && setW(e.contentRect.width))
    ro.observe(box.current!)
    return () => ro.disconnect()
  }, [])

  const n = trend.length
  const iw = Math.max(1, w - PAD.left - PAD.right)
  const x = (i: number) => PAD.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => PAD.top + (1 - v / 100) * (H - PAD.top - PAD.bottom)
  const line = trend.map((t, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(t.accuracy).toFixed(1)}`).join('')
  const nearest = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    const i = n === 1 ? 0 : Math.round(((clientX - r.left - PAD.left) / iw) * (n - 1))
    return Math.max(0, Math.min(n - 1, i))
  }
  const h = hover === null ? null : trend[hover]

  return (
    <div
      className="achart"
      ref={box}
      onMouseMove={(e) => setHover(nearest(e.clientX))}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        const t = trend[nearest(e.clientX)]
        if (t) location.hash = `#/review/${t.id}`
      }}
    >
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={`Accuracy in ${n} games, oldest first: ${trend.map((t) => t.accuracy.toFixed(0)).join(', ')}.`}
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={w - PAD.right} y1={y(v)} y2={y(v)} className="achart-grid" />
            {v % 50 === 0 && (
              <text x={PAD.left - 6} y={y(v) + 4} className="achart-axis" textAnchor="end">
                {v}
              </text>
            )}
          </g>
        ))}
        <path
          d={`${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`}
          className="achart-area"
        />
        <path d={line} className="achart-line" />
        {trend.map((t, i) => (
          <circle key={t.id} cx={x(i)} cy={y(t.accuracy)} r={n > 60 ? 2.5 : 4} className="achart-dot" />
        ))}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="achart-cursor" />
        )}
        <text x={PAD.left} y={H - 4} className="achart-axis">
          {trend[0]?.date ?? 'oldest'}
        </text>
        <text x={w - PAD.right} y={H - 4} className="achart-axis" textAnchor="end">
          {trend[n - 1]?.date ?? 'newest'}
        </text>
      </svg>
      {h && hover !== null && (
        <div className="trace-tip" style={{ left: Math.max(70, Math.min(w - 70, x(hover))) }}>
          <strong>{h.accuracy.toFixed(1)}%</strong> vs {h.opponent}
          {h.date ? `, ${h.date}` : ''}
        </div>
      )}
    </div>
  )
}
