import { expect, test } from 'vitest'
import type { CatalogChoice } from '../../domain/catalog'
import { makeCoreState } from '../../test/core-fixtures'
import { evaluateRelationship, protectRecommendedTrust } from './relationship'

const companion = { name: '동료', trust: 50, traits: { risk: 50, cognition: 50, affect: 50 } }
const choice = { relationship: { success: [], failure: [] } } as unknown as CatalogChoice

test('scale doubles positive and negative changes, with a maximum of ten', () => {
  const before = makeCoreState({ supply: 0, medkit: 0 })
  for (const after of [makeCoreState({ supply: 1, medkit: 0 }), makeCoreState({ stamina: 0, injury: 3, supply: 0, medkit: 0 }), makeCoreState({ supply: 3, medkit: 2, weapon: true })]) {
    const old = evaluateRelationship(before, after, companion, choice, 'success')
    const next = evaluateRelationship(before, after, companion, choice, 'success', false, 2)
    expect(next.after - next.before).toBe((old.after - old.before) * 2)
    expect(Math.abs(next.after - next.before)).toBeLessThanOrEqual(10)
  }
})

test('scaled losses stay protected for recommendations and values stay within zero to one hundred', () => {
  const before = makeCoreState({ supply: 0, medkit: 0 })
  const hurt = makeCoreState({ stamina: 0, injury: 3, supply: 0, medkit: 0 })
  const loss = evaluateRelationship(before, hurt, companion, choice, 'failure', false, 2)
  expect(protectRecommendedTrust(loss, true).after).toBe(50)
  expect(evaluateRelationship(before, hurt, { ...companion, trust: 1 }, choice, 'failure', false, 2).after).toBe(0)
  expect(evaluateRelationship(before, makeCoreState({ supply: 3, medkit: 2, weapon: true }), { ...companion, trust: 99 }, choice, 'success', false, 2).after).toBe(100)
})
