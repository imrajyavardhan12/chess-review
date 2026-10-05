import { describe, expect, it, vi } from 'vitest'
import { openStore } from '../src/services/storage'

describe('openStore without IndexedDB', () => {
  it('falls back to memory so the app still works, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = await openStore() // no `indexedDB` global in this environment
    await store.putRequest({ id: 'x', pgn: '1. e4 *', preset: 'quick', createdAt: 1 })
    expect((await store.getRequest('x'))?.id).toBe('x')
    expect(warn).toHaveBeenCalled()
  })
})
