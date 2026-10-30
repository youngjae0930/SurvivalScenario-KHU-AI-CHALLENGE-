import { afterEach, expect, it, vi } from 'vitest'
import { createBrowserStore, SAVE_KEY } from './browser-store'

afterEach(() => vi.unstubAllGlobals())
it('초기화는 잠금과 원문 일치를 확인하고 게임 저장 키만 제거한다', async () => {
  const data = new Map([[SAVE_KEY, 'original'], ['other-app', 'keep']])
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => { data.delete(key) },
  }, addEventListener: vi.fn() })
  vi.stubGlobal('navigator', { locks: { request: (_: string, __: unknown, callback: (lock: object) => Promise<void>) => callback({}) } })
  const store = createBrowserStore()
  await expect(store.compareAndRemove!('original')).rejects.toMatchObject({ code: 'save-conflict' })
  expect(data.get(SAVE_KEY)).toBe('original')
  expect(await store.acquire()).toBe(true)
  await expect(store.compareAndRemove!('stale')).rejects.toMatchObject({ code: 'save-conflict' })
  expect(data.get(SAVE_KEY)).toBe('original')
  await store.compareAndRemove!('original')
  expect(store.read()).toBeNull()
  expect(data.get('other-app')).toBe('keep')
})
