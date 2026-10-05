import { describe, expect, it } from 'vitest'
import { formatRemaining, remainingMs } from '../src/services/eta'

describe('remainingMs', () => {
  it('waits for enough progress before estimating', () => {
    expect(remainingMs(null, 5000, 10, 100)).toBeNull()
    expect(remainingMs(0, 5000, 5, 100)).toBeNull() // too few steps
    expect(remainingMs(0, 1400, 10, 100)).toBeNull() // too little time
  })

  it('extrapolates the rate since the first finished step', () => {
    // Steps 2..11 took 10 s, so 1 s each, and 89 are left.
    expect(remainingMs(1000, 11_000, 11, 100)).toBe(89_000)
  })

  it('ignores how long the engine took to start', () => {
    // The same rate whether step 1 came after 100 ms or after 5 s.
    expect(remainingMs(100, 10_100, 11, 100)).toBe(remainingMs(5000, 15_000, 11, 100))
  })

  it('is zero at the end', () => {
    expect(remainingMs(0, 5000, 100, 100)).toBe(0)
  })
})

describe('formatRemaining', () => {
  it.each([
    [3000, 'A few seconds left'],
    [12_000, 'About 15 seconds left'],
    [41_000, 'About 45 seconds left'],
    [70_000, 'About a minute left'],
    [150_000, 'About 3 minutes left'],
  ])('%s ms -> %s', (ms, text) => {
    expect(formatRemaining(ms)).toBe(text)
  })
})
