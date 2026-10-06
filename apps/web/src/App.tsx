import { Suspense, lazy, useEffect, useState } from 'react'
import { Home } from './Home'
import { applyUpdate, useUpdateReady } from './offline'
import { ReviewPage } from './Review'

// Insights is a page of its own, loaded only when opened.
const InsightsPage = lazy(() => import('./Insights').then((m) => ({ default: m.InsightsPage })))

// Routes live in the hash so a reload keeps you on the same review:
//   #/                      game list
//   #/review/<id>?u=<name>  one review (u = whose games you were browsing)
//   #/insights              statistics across every stored review
function parse(hash: string) {
  const m = hash.match(/^#\/review\/([a-f0-9]+)(?:\?u=(.*))?$/)
  return m && m[1] ? { id: m[1], me: m[2] ? decodeURIComponent(m[2]) : null } : null
}

export function App() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  const updateReady = useUpdateReady()
  const route = parse(hash)
  return (
    <>
      {updateReady && (
        <p className="update" role="status">
          A new version of chessreview is ready.{' '}
          <button className="ghost" onClick={applyUpdate}>
            Reload
          </button>
        </p>
      )}
      {hash === '#/insights' ? (
        <Suspense fallback={null}>
          <InsightsPage />
        </Suspense>
      ) : route ? (
        <ReviewPage id={route.id} me={route.me} />
      ) : (
        <Home />
      )}
    </>
  )
}

export function openReview(id: string, me: string | null) {
  location.hash = `#/review/${id}${me ? `?u=${encodeURIComponent(me)}` : ''}`
}
