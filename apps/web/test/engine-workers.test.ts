import { describe, expect, it } from 'vitest'
import { fullEngineWorkers } from '../src/services/engine'

describe('workers for the full engine', () => {
  it('uses at most two, one on a device with 4 GB or less, never none', () => {
    expect(fullEngineWorkers(7, undefined)).toBe(2)
    expect(fullEngineWorkers(7, 8)).toBe(2)
    expect(fullEngineWorkers(7, 4)).toBe(1)
    expect(fullEngineWorkers(1, undefined)).toBe(1)
  })
})
