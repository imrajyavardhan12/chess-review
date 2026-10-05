import { Suspense, lazy, useEffect, useState } from 'react'
import { Home } from './Home'

// Insights is a page of its own, loaded only when opened.
const InsightsPage = lazy(() => import('./Insights').then((m) => ({ default: m.InsightsPage })))
import { ReviewPage } from './Review'

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

  if (hash === '#/insights')
    return (
      <Suspense fallback={null}>
        <InsightsPage />
      </Suspense>
    )
  const route = parse(hash)
  return route ? <ReviewPage id={route.id} me={route.me} /> : <Home />
}

export function openReview(id: string, me: string | null) {
  location.hash = `#/review/${id}${me ? `?u=${encodeURIComponent(me)}` : ''}`
}
