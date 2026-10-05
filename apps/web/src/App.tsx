import { useEffect, useState } from 'react'
import { Home } from './Home'
import { applyUpdate, useUpdateReady } from './offline'
import { ReviewPage } from './Review'

// Routes live in the hash so a reload keeps you on the same review:
//   #/                      game list
//   #/review/<id>?u=<name>  one review (u = whose games you were browsing)
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
      {route ? <ReviewPage id={route.id} me={route.me} /> : <Home />}
    </>
  )
}

export function openReview(id: string, me: string | null) {
  location.hash = `#/review/${id}${me ? `?u=${encodeURIComponent(me)}` : ''}`
}
