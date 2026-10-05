/**
 * Time left in an analysis, from the rate measured so far. The clock starts at the first finished
 * step, so starting the engine (a one-off cost) doesn't make the estimate pessimistic. Until there
 * is enough to go on there is no estimate, rather than a wild one.
 */
export function remainingMs(
  firstStepAt: number | null,
  now: number,
  done: number,
  total: number,
): number | null {
  if (firstStepAt === null || done < 6 || now - firstStepAt < 1500) return null
  const perStep = (now - firstStepAt) / (done - 1)
  return Math.max(0, (total - done) * perStep)
}

/** "About 40 seconds left": rounded, because a precise-looking number would promise too much. */
export function formatRemaining(ms: number): string {
  const s = ms / 1000
  if (s < 10) return 'A few seconds left'
  if (s < 55) return `About ${Math.ceil(s / 5) * 5} seconds left`
  const m = Math.round(s / 60)
  return m <= 1 ? 'About a minute left' : `About ${m} minutes left`
}
