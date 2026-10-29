import type { CatalogDecisionMemory, CatalogRun } from '../../domain/catalog'
import { autonomySchema, catalogActionSchema, executionSchema, relationshipSchema, validateShape, type Shape } from '../../content/catalog/schema'
import { isCoreAction } from '../actions'
import { buildRecoveryAction } from '../recovery'

const object = (properties: Record<string, Shape>, optional: readonly string[] = []): Shape => ({ type: 'object', properties,
  required: Object.keys(properties).filter(key => !optional.includes(key)), additionalProperties: false })
const int = (minimum: number, maximum: number): Shape => ({ type: 'integer', minimum, maximum })
const text = (maxLength = 80): Shape => ({ type: 'string', minLength: 1, maxLength })
const id: Shape = { ...text(), pattern: '^[A-Za-z][A-Za-z0-9_.-]*$' }
const commandId: Shape = { ...text(90), pattern: '^(companion:)?[A-Za-z][A-Za-z0-9_.-]{0,79}$' }
const bool: Shape = { type: 'boolean' }
const enumeration = (...values: unknown[]): Shape => ({ enum: values })
const nullable = (value: Shape): Shape => ({ anyOf: [{ type: 'null' }, value] })
const array = (items: Shape, minItems: number, maxItems: number): Shape => ({ type: 'array', items, minItems, maxItems })
const traits = object({ risk: int(0, 100), cognition: int(0, 100), affect: int(0, 100) })
const counts = object({ rescue: int(0, 3), self: int(0, 3) })
const companion = object({ name: text(40), traits, trust: int(0, 100), judgmentCounts: counts }, ['judgmentCounts'])
const core = object({
  protagonist: object({ name: text(40), traits, stress: int(0, 100), stamina: int(0, 100), injury: int(0, 3) }),
  inventory: object({ supply: int(0, 3), medkit: int(0, 2), weapon: bool }),
  flags: object({ access: bool, data: bool, helpEstablished: bool, routeKnown: bool, rescueDecision: enumeration(null, 'rescue', 'self') }),
})
const number: Shape = { type: 'number', minimum: -1000, maximum: 1000 }
const probability = object({ base: number, trait: number, condition: number, equipment: number, support: number, flag: number, percent: int(0, 100) })
const preview = object({ allowed: bool, reasons: array(text(5000), 0, 30), check: { anyOf: [object({ kind: enumeration('certain') }), object({ kind: enumeration('probability'), probability })] } })
const runtimeAction: Shape = { ...catalogActionSchema, properties: { ...catalogActionSchema.properties, id: commandId } }
const option = object({ actionId: commandId, goalId: id, judgment: enumeration(null, 'rescue', 'self'), behavior: enumeration('action', 'recovery', 'escape'),
  route: enumeration('short', 'detour', 'request'), pace: enumeration('slow', 'balanced', 'fast'), execution: executionSchema,
  relationship: relationshipSchema, trustOutcomes: object({ success: int(-5, 5), failure: int(-5, 5) }, ['success', 'failure']),
  action: runtimeAction, preview }, ['route', 'pace', 'execution', 'relationship', 'trustOutcomes'])
const context = object({
  optionCount: int(1, 20),
  relationship: object({ version: enumeration('outcome-1'), companion }),
  executionActor: enumeration('companion'), commandTrustSufficient: bool,
  autonomy: object({ policy: autonomySchema, preferredActionId: nullable(commandId) }),
  content: object({ packId: id, revision: id, rulesVersion: enumeration('1.2-stress-1') }),
  eventId: id, locationId: id, stage: enumeration('early', 'middle', 'late'), groupId: id, sceneScriptId: id,
  core, companion: nullable(companion),
  facts: { type: 'object', properties: {}, additionalProperties: bool },
  visitedLocationIds: array(id, 1, 48), options: array(option, 1, 20), selectedAction: runtimeAction,
}, ['autonomy', 'executionActor', 'commandTrustSufficient', 'relationship', 'optionCount'])
const memorySchema = object({ version: enumeration('context-1'), entries: array(object({ eventId: id, actionId: commandId, treat: bool, context }), 0, 48) })

function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((value, i) => sameData(value, b[i]))
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && sameData(left[key], right[key]))
}

/** Shape and local consistency only; the save decoder additionally replays the current run. */
export function isDecisionMemory(value: unknown): value is CatalogDecisionMemory {
  if (validateShape(memorySchema, value).length) return false
  const memory = value as CatalogDecisionMemory
  return memory.entries.every((entry, index) => {
    const { context } = entry
    const selected = context.options.find(option => option.actionId === entry.actionId)
    const visited = context.visitedLocationIds
    if (!selected) return false
    let selectedAction = selected.action
    if (entry.treat) {
      if (selected.behavior !== 'recovery' || !['E04', 'E11'].includes(selected.action.eventId)) return false
      const built = buildRecoveryAction({ state: context.core, eventId: selected.action.eventId as 'E04' | 'E11', phase: 'choice', choice: 'maintain', treat: true, companionTrust: null })
      if (!built.ok) return false
      selectedAction = { ...built.value, id: selected.actionId }
    }
    return (!context.executionActor || (context.companion !== null && selected.execution !== undefined && selected.behavior === 'action'))
      && (!context.relationship || sameData(context.relationship.companion, context.companion))
      && context.eventId === entry.eventId && visited.length === index + 1 && visited.at(-1) === context.locationId
      && new Set(visited).size === visited.length && context.options.length === (context.optionCount ?? 4)
      && new Set(context.options.map(option => option.actionId)).size === context.options.length
      && selected.preview.allowed && context.selectedAction.id === entry.actionId && isCoreAction(context.selectedAction)
      && sameData(selectedAction, context.selectedAction)
      && (!context.companion?.judgmentCounts || context.companion.judgmentCounts.rescue + context.companion.judgmentCounts.self <= 3)
      && context.options.every(option => option.actionId === option.action.id && isCoreAction(option.action)
        && (!option.actionId.startsWith('companion:') || (context.companion !== null && option.action.requires.companion === true))
        && (option.behavior === 'escape' ? option.route !== undefined : option.route === undefined)
        && (option.preview.allowed ? option.preview.reasons.length === 0 : option.preview.reasons.length > 0))
  })
}

/** Only actual committed choices; no synthesized contexts for old packs or missed events. */
export function decisionMemoryFor(run: CatalogRun): CatalogDecisionMemory {
  const entries = run.history.map(entry => {
    if (!entry.decisionContext) throw new Error('선택 당시 상황 기록이 누락되었습니다.')
    return { eventId: entry.eventId, actionId: entry.actionId, treat: entry.treat, context: structuredClone(entry.decisionContext) }
  })
  return { version: 'context-1', entries }
}
