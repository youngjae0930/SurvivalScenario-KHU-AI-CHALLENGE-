import { drawRandom } from '../random'

/** Separate calls happen only during committed generation, never during a preview. */
export function weightedPick<T extends { readonly weight: number }>(items: readonly T[], rngState: number): { item: T; rngState: number } {
  if (!items.length) throw new Error('추첨 후보가 없습니다.')
  if (items.length === 1) return { item: items[0], rngState }
  const draw = drawRandom(rngState)
  if (!draw.ok) throw new Error(draw.error.message)
  let cursor = draw.value.roll * items.reduce((sum, item) => sum + item.weight, 0)
  for (const item of items) { cursor -= item.weight; if (cursor < 0) return { item, rngState: draw.value.rngState } }
  throw new Error('추첨 가중치가 올바르지 않습니다.')
}
