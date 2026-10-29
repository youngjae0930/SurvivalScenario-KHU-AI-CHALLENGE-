import { SaveError } from './opening-save'

export const SAVE_KEY = 'choice-echoes.save'
export const PLAY_LOCK = 'choice-echoes.active-player'

export interface SaveStore {
  read(): string | null
  /** Hold the exclusive player lock until this document closes or navigates away. */
  acquire(): Promise<boolean>
  compareAndSet(expected: string | null, next: string): Promise<void>
}

/** No IO or lock acquisition at construction (safe for React StrictMode initialization). */
export function createBrowserStore(): SaveStore {
  let held = false
  let acquiring: Promise<boolean> | null = null
  const read = () => window.localStorage.getItem(SAVE_KEY)
  return {
    read,
    acquire() {
      if (held) return Promise.resolve(true)
      if (acquiring) return acquiring
      acquiring = new Promise<boolean>((resolve, reject) => {
        if (!navigator.locks) { reject(new SaveError('save-failed', '이 브라우저는 안전한 단일 탭 저장을 지원하지 않습니다. 최신 브라우저에서 실행해 주세요.')); return }
        void navigator.locks.request(PLAY_LOCK, { ifAvailable: true }, async lock => {
          if (!lock) { resolve(false); return }
          held = true
          resolve(true)
          // Browser releases Web Locks when the owning document is destroyed.
          await new Promise<void>(release => window.addEventListener('pagehide', () => { held = false; release() }, { once: true }))
        }).catch(reject)
      }).finally(() => { acquiring = null })
      return acquiring
    },
    async compareAndSet(expected, next) {
      if (!held) throw new SaveError('save-conflict', '다른 탭과의 진행 충돌을 막기 위해 저장을 중단했습니다. 이 탭을 새로고침해 주세요.')
      if (read() !== expected) throw new SaveError('save-conflict', '저장 내용이 다른 곳에서 변경되었습니다. 덮어쓰지 않습니다. 새로고침 후 이어해 주세요.')
      window.localStorage.setItem(SAVE_KEY, next)
    },
  }
}
