import { useEffect, useState } from 'react'
import { getReviewService, type JobState } from './services'

/** Live state of one review: null until the service has answered. */
export function useReviewState(id: string): JobState | null {
  const [state, setState] = useState<JobState | null>(null)
  useEffect(() => {
    let off: () => void = () => undefined
    let stale = false
    setState(null)
    void getReviewService().then((service) => {
      if (!stale) off = service.subscribe(id, setState)
    })
    return () => {
      stale = true
      off()
    }
  }, [id])
  return state
}

export async function cancelReview(id: string): Promise<void> {
  ;(await getReviewService()).cancel(id)
}
