import type { CatalogLegacy, CatalogPack, CatalogRun, CompanionContext } from '../../domain/catalog'
import { isRecord, isTraits } from '../../domain/validation'
import { isCompanionContext } from './intervention'
import { catalogLegacy, createCatalogRun } from './runtime'
import { isDecisionMemory } from './decision-memory'

/** Mechanical companion input only. Ending and old survival state are not memories. */
export interface CatalogInheritance {
  readonly sourceRunId: string
  readonly companion: CompanionContext
  readonly rescueDecision: CatalogRun['core']['flags']['rescueDecision']
  readonly judgmentCounts: CatalogRun['judgmentCounts']
  readonly independentUsed: false
}

export function catalogInheritance(pack: CatalogPack, completed: CatalogRun): CatalogInheritance | null {
  const legacy = catalogLegacy(pack, completed)
  if (!legacy || !completed.result) return null
  return {
    sourceRunId: legacy.sourceRunId,
    companion: { name: legacy.name, traits: { ...legacy.traits }, trust: 50 },
    rescueDecision: legacy.rescueDecision,
    judgmentCounts: { ...legacy.judgmentCounts },
    independentUsed: false,
  }
}

export function isCatalogLegacy(value: unknown): value is CatalogLegacy {
  const keys = ['legacyId', 'sourceRunId', 'name', 'traits', 'rescueDecision', 'judgmentCounts', 'representativeActions', 'ending', 'rulesVersion', 'contentRevision']
  if (!isRecord(value) || keys.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !keys.includes(key) && key !== 'decisionMemory')
    || !isRecord(value.judgmentCounts) || typeof value.sourceRunId !== 'string' || !value.sourceRunId || value.sourceRunId.length > 200
    || value.legacyId !== `${value.sourceRunId}:legacy` || typeof value.contentRevision !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value.contentRevision)
    || value.rulesVersion !== '1.2-stress-1' || !['data-and-escape', 'escape', 'escape-failed'].includes(String(value.ending))
    || ![null, 'rescue', 'self'].includes(value.rescueDecision as null | string) || !isTraits(value.traits) || Object.keys(value.traits).length !== 3
    || !isCompanionContext({ name: value.name, traits: value.traits, trust: 50, judgmentCounts: value.judgmentCounts }) || !isRecord(value.representativeActions)) return false
  const actions = value.representativeActions
  if (!(Object.keys(actions).length === 3 && ['E02', 'E07', 'E10'].every(id => {
    const action = actions[id]
    return Object.hasOwn(actions, id) && (action === null || (typeof action === 'string' && /^(companion:)?[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(action)))
  }))) return false
  if (!Object.hasOwn(value, 'decisionMemory')) return true
  if (!isDecisionMemory(value.decisionMemory) || !value.decisionMemory.entries.length) return false
  const entries = value.decisionMemory.entries
  if (!entries.every(entry => entry.context.core.protagonist.name === value.name && entry.context.content.revision === value.contentRevision
    && entry.context.content.rulesVersion === value.rulesVersion)) return false
  if (!['E02', 'E07', 'E10'].every(id => actions[id] === (entries.find(entry => entry.eventId === id)?.actionId ?? null))) return false
  const recorded = { rescue: 0, self: 0 }
  for (const entry of entries) {
    const judgment = entry.context.options.find(option => option.actionId === entry.actionId)!.judgment
    if (judgment) recorded[judgment]++
  }
  if (value.judgmentCounts.rescue !== recorded.rescue || value.judgmentCounts.self !== recorded.self) return false
  const last = entries.at(-1)!.context
  const finalTraits = value.traits
  return (['risk', 'cognition', 'affect'] as const).every(axis => finalTraits[axis] === Math.max(0, Math.min(100, last.core.protagonist.traits[axis] + last.selectedAction.traitDelta[axis])))
}

/** Rebuilds from a compact previous character without copying any older companion/archive. */
export function createInheritedCatalogRun(nextPack: CatalogPack, previous: CatalogLegacy, input: Parameters<typeof createCatalogRun>[1]): CatalogRun {
  if (!isCatalogLegacy(previous)) throw new Error('계승 기록이 올바르지 않습니다.')
  if (input.runId === previous.sourceRunId) throw new Error('다음 회차에는 새로운 회차 ID가 필요합니다.')
  if (input.companion !== undefined) throw new Error('다음 동료는 직전 결말에서만 생성합니다.')
  const run = createCatalogRun(nextPack, { ...input, companion: { name: previous.name, traits: { ...previous.traits }, trust: 50, judgmentCounts: { ...previous.judgmentCounts } } })
  return { ...run, previousLegacy: structuredClone(previous) }
}

/** Creates the candidate; the app commits it only after the new questionnaire is confirmed. */
export function prepareNextCatalogRun(sourcePack: CatalogPack, completed: CatalogRun, nextPack: CatalogPack, input: Parameters<typeof createCatalogRun>[1]) {
  const inherited = catalogInheritance(sourcePack, completed)
  if (!inherited) throw new Error('결말이 확정된 회차만 계승할 수 있습니다.')
  if (input.runId === completed.runId) throw new Error('다음 회차에는 새로운 회차 ID가 필요합니다.')
  if (input.companion !== undefined) throw new Error('다음 동료는 직전 결말에서만 생성합니다.')
  return { run: createInheritedCatalogRun(nextPack, catalogLegacy(sourcePack, completed)!, input), inherited }
}
