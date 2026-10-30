/** One schema powers runtime validation and the JSON Schema given to content authors. */
export interface Shape {
  readonly type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
  readonly properties?: Readonly<Record<string, Shape>>
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean | Shape
  readonly items?: Shape
  readonly anyOf?: readonly Shape[]
  readonly enum?: readonly unknown[]
  readonly minimum?: number
  readonly maximum?: number
  readonly minItems?: number
  readonly maxItems?: number
  readonly minLength?: number
  readonly maxLength?: number
  readonly pattern?: string
}
const str = (maxLength = 5000): Shape => ({ type: 'string', minLength: 1, maxLength })
const id: Shape = { ...str(80), pattern: '^[A-Za-z][A-Za-z0-9_.-]*$' }
const bool: Shape = { type: 'boolean' }
const num = (minimum: number, maximum: number): Shape => ({ type: 'number', minimum, maximum })
const int = (minimum: number, maximum: number): Shape => ({ type: 'integer', minimum, maximum })
const enumeration = (...values: unknown[]): Shape => ({ enum: values })
const array = (items: Shape, minItems = 0, maxItems = 1000): Shape => ({ type: 'array', items, minItems, maxItems })
const object = (properties: Record<string, Shape>, required = Object.keys(properties)): Shape => ({ type: 'object', properties, required, additionalProperties: false })
const one = (...anyOf: Shape[]): Shape => ({ anyOf })
const nullable = (shape: Shape): Shape => one({ type: 'null' }, shape)
const stage = enumeration('early', 'middle', 'late')
const ruleEvent = { ...str(3), pattern: '^E(0[1-9]|1[0-2])$' }
const axis = enumeration('risk', 'cognition', 'affect')
const flag = enumeration('access', 'data', 'helpEstablished', 'routeKnown')
const condition: Shape = one(
  object({ kind: enumeration('opportunity'), id }),
  object({ kind: enumeration('number'), subject: enumeration('protagonist', 'companion'), stat: enumeration('stress', 'stamina', 'injury', 'risk', 'cognition', 'affect', 'trust'), min: int(0, 100), max: int(0, 100) }),
  object({ kind: enumeration('resource'), resource: enumeration('supply', 'medkit'), min: int(0, 3), max: int(0, 3) }),
  object({ kind: enumeration('companion'), present: bool }), object({ kind: enumeration('weapon'), value: bool }),
  object({ kind: enumeration('flag'), flag, value: bool }), object({ kind: enumeration('fact'), id, value: bool }),
  object({ kind: enumeration('visited'), locationId: id, value: bool }),
  object({ kind: enumeration('location-tag'), tag: id }), object({ kind: enumeration('stage'), stage }),
)
const conditions = array(condition, 0, 30)
export const executionSchema = object({ role: str(80), conditions, sharedRisk: str(), risk: enumeration('routine', 'hazardous') }, ['role', 'conditions', 'sharedRisk'])
const reunion = object({ locationTags: array(id, 1, 30), minVisits: int(1, 128), conditions })
export const autonomySchema = one(
  object({ conditions, playerJudgment: enumeration('rescue', 'self'), companionJudgment: enumeration('rescue', 'self'), reunion }),
  object({ conditions, conflicts: array(object({ playerGoalId: id, companionGoalId: id, reason: str() }), 1, 30), reunion }),
)
const impact = one(object({ kind: enumeration('value'), axis, pole: enumeration('left', 'right'), magnitude: int(1, 3), reason: str(200) }),
  object({ kind: enumeration('support'), magnitude: int(-3, 3), reason: str(200) }))
export const relationshipSchema = object({ success: array(impact, 0, 5), failure: array(impact, 0, 5) })
export const infectionSchema = array(object({ source: enumeration('infected-person', 'protagonist', 'companion', 'actor'),
  target: enumeration('protagonist', 'companion', 'actor', 'other'), contact: enumeration('bite', 'blood') }), 1, 4)
export const endingSchema = object({ conditions, kind: enumeration('cure-discovery', 'tunnel-escape', 'outskirts-escape') })
const effect: Shape = one(
  object({ kind: enumeration('add'), stat: enumeration('stress', 'stamina', 'injury', 'supply', 'medkit'), amount: int(-100, 100) }),
  object({ kind: enumeration('set-flag'), flag, value: bool }), object({ kind: enumeration('set-weapon'), value: bool }),
  object({ kind: enumeration('set-rescue-decision'), value: enumeration('rescue', 'self', null) }),
  object({ kind: enumeration('remove-all'), resource: enumeration('supply', 'medkit') }),
)
const flags = object({ access: bool, data: bool, helpEstablished: bool, routeKnown: bool }, [])
export const catalogActionSchema = object({
  id, eventId: ruleEvent,
  requires: object({ stamina: int(0, 100), supply: int(0, 3), medkit: int(0, 2), injuryMax: int(0, 3), weapon: bool, companion: bool, flags }, []),
  costs: object({ stamina: int(0, 100), supply: int(0, 3), medkit: int(0, 2) }),
  check: nullable(object({ base: int(0, 100), physical: bool, weaponBonus: bool, traitWeights: array(object({ axis, pole: enumeration('left', 'right'), weight: num(0.000001, 1) }), 1, 2) })),
  traitDelta: object({ risk: int(-100, 100), cognition: int(-100, 100), affect: int(-100, 100) }),
  successEffects: array(effect, 0, 30), failureEffects: array(effect, 0, 30),
})
const action = catalogActionSchema
const factUpdates: Shape = { type: 'object', properties: {}, additionalProperties: bool }
export const locationSchema = object({ id, name: str(100), stage, tags: array(id, 1, 30), fromTags: array(id, 0, 30), after: array(id, 0, 128), required: bool, weight: int(1, 1000), enabled: bool }, ['id', 'name', 'stage', 'tags', 'fromTags', 'after', 'required', 'weight'])
const interventionSchema = object({ mode: enumeration('companion-choice'), groupId: id, axis, extremePole: enumeration('left', 'right'), replaceChoiceId: id,
    alternatives: array(object({ groupId: id, choiceId: id }), 1, 20), judgment: enumeration('rescue', 'self', null), text: str(), notices: array(str(), 1, 10) },
    ['groupId', 'axis', 'extremePole', 'replaceChoiceId', 'alternatives', 'judgment', 'text', 'notices'])
function makeEventSchema(minChoices: number, maxChoices: number): Shape { return object({
  autonomy: autonomySchema,
  recommendation: object({ axis }),
  id, title: str(100), locationIds: array(id, 0, 128), locationTags: array(id, 0, 30), conditions, weight: int(1, 1000),
  intervention: interventionSchema,
  interventions: array(interventionSchema, 1, 6),
  groups: array(object({
    id, priority: int(0, 1000), conditions, notices: array(str(), 0, 10),
    choices: array(object({ id, goalId: id, label: str(200), intention: str(), target: str(200), judgment: enumeration('rescue', 'self', null), pace: enumeration('slow', 'balanced', 'fast'), destinationSegmentId: id,
      behavior: one(
        object({ kind: enumeration('action'), variants: array(object({ conditions, action }), 1, 10) }),
        object({ kind: enumeration('recovery'), ruleEventId: enumeration('E04', 'E11'), choice: enumeration('maintain', 'share', 'rest') }),
        object({ kind: enumeration('escape'), ruleEventId: enumeration('E12'), route: enumeration('short', 'detour', 'request') }),
      ), successFacts: factUpdates, failureFacts: factUpdates,
      execution: executionSchema,
      relationship: relationshipSchema,
      infection: infectionSchema,
      ending: endingSchema,
    }, ['id', 'goalId', 'label', 'intention', 'target', 'judgment', 'behavior', 'successFacts', 'failureFacts']), minChoices, maxChoices),
  }), 1, 20),
}, ['id', 'title', 'locationIds', 'locationTags', 'conditions', 'weight', 'groups']) }
/** Choice count follows the scene; never pad a group to fill UI slots. */
export const eventSchema = makeEventSchema(1, 20)
const savedEventSchema = makeEventSchema(1, 20)
export const scriptSchema = object({ id, eventId: id, choiceId: nullable(id), slot: enumeration('scene', 'success', 'failure', 'opinion', 'hesitation', 'departure-warning', 'departure', 'absent', 'reunion', 'recommendation-failure', 'infection-ending'), conditions,
  priority: int(0, 1000), weight: int(1, 1000), once: bool, text: array(str(), 1, 20) })
export const manifestSchema = object({ formatVersion: enumeration(1), id, revision: id, rulesVersion: enumeration('1.2-stress-1'), title: str(100), startLocationId: id,
  extremeExperienceVersion: enumeration('middle-1'),
  companionStateVersion: enumeration('separate-1'),
  traitRangeVersion: enumeration('relaxed-1'),
  reactionVersion: enumeration('responsibility-1', 'contextual-1'),
  infectionVersion: enumeration('immediate-1'),
  researchVersion: enumeration('research-1'),
  endingVersion: enumeration('routes-1'),
  opportunities: array(object({ id, locationTags: array(id, 1, 30) }), 1, 20),
  dialogueVersion: enumeration('scripts-1'),
  routeVersion: enumeration('stages-1', 'slots-1'),
  slotPlan: object({ startSegmentId: id, segments: array(object({ id, stage,
    slots: array(object({ number: int(1, 48), candidates: array(id, 1, 20) }), 1, 16),
    nextSegmentIds: array(id, 0, 20), lockedReason: str(), entry: object({ conditions, reason: str() }),
  }, ['id', 'stage', 'slots', 'nextSegmentIds']), 1, 20) }),
  trustVersion: enumeration('outcome-1', 'outcome-2'),
  trustScale: int(2, 2),
  executionVersion: enumeration('command-1'),
  autonomyVersion: enumeration('journey-1', 'journey-2'),
  presentationVersion: enumeration('reflection-1'),
  recommendationVersion: enumeration('survival-1'),
  decisionMemoryVersion: enumeration('context-1'),
  decisionEcho: object({ version: enumeration('echo-1'), compatibleRevisions: array(id, 1, 50) }),
  stages: array(object({ id: stage, minVisits: int(0, 16), maxVisits: int(0, 16) }), 3, 3), facts: array(id, 0, 100),
  boundary: object({ nextEventId: id, title: str(100), text: array(str(), 1, 10) }),
}, ['formatVersion', 'id', 'revision', 'rulesVersion', 'title', 'startLocationId', 'stages', 'facts', 'boundary'])
export const packSchema = object({ manifest: manifestSchema, locations: array(locationSchema, 1, 128), events: array(eventSchema, 1, 512), scripts: array(scriptSchema, 1, 10000) })
export const savedPackSchema = object({ manifest: manifestSchema, locations: array(locationSchema, 1, 128), events: array(savedEventSchema, 1, 512), scripts: array(scriptSchema, 1, 10000) })

export function validateShape(shape: Shape, value: unknown, path = '$'): string[] {
  const error = (message: string) => [`${path}: ${message}`]
  if (shape.anyOf) return shape.anyOf.some(option => validateShape(option, value, path).length === 0) ? [] : error('허용된 형식 중 일치하는 정의가 없습니다.')
  if (shape.enum && !shape.enum.includes(value)) return error(`허용값: ${shape.enum.join(', ')}`)
  if (shape.type === 'null') return value === null ? [] : error('null이 필요합니다.')
  if (shape.type === 'boolean') return typeof value === 'boolean' ? [] : error('boolean이 필요합니다.')
  if (shape.type === 'string') return typeof value === 'string' && value.trim().length >= (shape.minLength ?? 0) && value.length <= (shape.maxLength ?? Infinity)
    && (!shape.pattern || new RegExp(shape.pattern).test(value)) ? [] : error('문자열 길이/형식이 올바르지 않습니다.')
  if (shape.type === 'integer' || shape.type === 'number') return typeof value === 'number' && Number.isFinite(value)
    && (shape.type !== 'integer' || Number.isSafeInteger(value)) && value >= (shape.minimum ?? -Infinity) && value <= (shape.maximum ?? Infinity) ? [] : error('숫자 범위/형식이 올바르지 않습니다.')
  if (shape.type === 'array') {
    if (!Array.isArray(value) || value.length < (shape.minItems ?? 0) || value.length > (shape.maxItems ?? Infinity)) return error(shape.minItems === shape.maxItems ? `배열에는 정확히 ${shape.minItems}개가 필요합니다.` : '배열 길이가 올바르지 않습니다.')
    return value.flatMap((item, index) => validateShape(shape.items!, item, `${path}[${index}]`))
  }
  if (shape.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return error('객체가 필요합니다.')
    const data = value as Record<string, unknown>
    const errors = (shape.required ?? []).filter(key => !Object.hasOwn(data, key)).map(key => `${path}.${key}: 필수 필드입니다.`)
    for (const [key, item] of Object.entries(data)) {
      if (Object.hasOwn(shape.properties ?? {}, key)) errors.push(...validateShape(shape.properties![key], item, `${path}.${key}`))
      else if (shape.additionalProperties === false || ['__proto__', 'constructor', 'prototype'].includes(key)) errors.push(`${path}.${key}: 허용되지 않은 필드입니다.`)
      else if (typeof shape.additionalProperties === 'object') errors.push(...validateShape(shape.additionalProperties, item, `${path}.${key}`))
    }
    return errors
  }
  return []
}
