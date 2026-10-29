// One-time migration. Never overwrite an authored catalog.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { eventText, actionText } from '../src/content/texts/opening.ts'

const destination = new URL('../src/content/catalog/packs/opening/', import.meta.url)
try { await access(destination); throw new Error('대상 폴더가 존재합니다. 기존 콘텐츠를 덮어쓰지 않습니다.') }
catch (error) { if (error.code !== 'ENOENT') throw error }
const old = JSON.parse(await readFile(new URL('../src/content/rules/opening.json', import.meta.url), 'utf8'))
for (const folder of ['locations', 'events', 'scripts']) await mkdir(new URL(`${folder}/`, destination), { recursive: true })
async function write(path, data) { await writeFile(new URL(path, destination), `${JSON.stringify(data, null, 2)}\n`) }
const locationIds = ['villa', 'convenience-store', 'alley', 'management-office', 'hospital-entry', 'hospital-exit']
const tags = ['shelter', 'store', 'alley', 'rest', 'hospital-entry', 'hospital-exit']
const goals = { 'E05.explore': 'clear', 'E05.bypass': 'bypass', 'E05.rush': 'clear', 'E05.tools': 'clear', 'E06.withdraw': 'withdraw', 'E06.salvage': 'salvage', 'E06.abandon': 'withdraw', 'E06.defend': 'withdraw' }
const extreme = id => [{ kind: 'number', subject: 'protagonist', stat: 'risk', min: id === 'E05' ? 0 : 78, max: id === 'E05' ? 22 : 100 }]
await write('manifest.json', {
  formatVersion: 1, id: 'opening', revision: 'catalog-opening-1', rulesVersion: old.rulesVersion,
  title: '병원 구간까지 · 콘텐츠 확장 기반', startLocationId: 'villa',
  stages: [{ id: 'early', minVisits: 4, maxVisits: 8 }, { id: 'middle', minVisits: 2, maxVisits: 8 }, { id: 'late', minVisits: 0, maxVisits: 8 }], facts: [],
  boundary: { nextEventId: 'E07', title: '병원을 뒤로하고', text: ['현재 등록된 구간을 마쳤습니다. 다음 E07 자료 조사는 아직 연결되지 않았습니다.', '이 화면은 결말이 아니며 계승을 생성하지 않습니다.'] },
})
for (const [index, event] of old.events.entries()) {
  const copy = eventText[event.id]
  await write(`locations/${locationIds[index]}.json`, { id: locationIds[index], name: index === 0 ? '빌라 대피소' : copy.place,
    stage: index < 4 ? 'early' : 'middle', tags: ['road', tags[index]], fromTags: index === 0 ? [] : ['road'],
    after: index === 0 ? [] : [locationIds[index - 1]], required: true, weight: 1,
  })
  const choices = event.choices.map(choice => ({
    id: choice.id, goalId: goals[choice.id] ?? choice.id, ...Object.fromEntries(['label', 'intention', 'target'].map(key => [key, actionText[choice.id][key]])),
    judgment: choice.judgment,
    behavior: choice.kind === 'recovery' ? { kind: 'recovery', ruleEventId: event.id, choice: choice.choice }
      : { kind: 'action', variants: choice.variants.map(variant => ({ conditions: variant.when === 'supply-present' ? [{ kind: 'resource', resource: 'supply', min: 1, max: 3 }] : [], action: variant.action })) },
    successFacts: {}, failureFacts: {},
  }))
  const groups = [{ id: 'normal', priority: 0, conditions: [], notices: [], choices: choices.slice(0, 2) }]
  if (choices.length > 2) groups.unshift({ id: 'extreme', priority: 10, conditions: extreme(event.id), notices: [event.id === 'E05' ? '모험 극단: 두 돌입 방식 중에서 선택합니다.' : '안정 극단: 두 철수 방식 중에서 선택합니다.'], choices: choices.slice(2) })
  await write(`events/${event.id}.json`, { id: event.id, title: copy.title, locationIds: [locationIds[index]], locationTags: [tags[index]], conditions: [], weight: 1, groups })
  const script = (id, choiceId, slot, conditions, priority, text) => ({ id, eventId: event.id, choiceId, slot, conditions, priority, weight: 1, once: false, text })
  const scripts = [script(`${event.id}.scene`, null, 'scene', [], 0, copy.story)]
  if (copy.extremeStory) scripts.push(script(`${event.id}.scene.extreme`, null, 'scene', extreme(event.id), 20, copy.extremeStory))
  if (copy.exteriorStory) scripts.push(script(`${event.id}.scene.exterior`, null, 'scene', [{ kind: 'flag', flag: 'access', value: false }], 10, copy.exteriorStory))
  for (const choice of choices) {
    scripts.push(script(`${choice.id}.success`, choice.id, 'success', [], 0, actionText[choice.id].success))
    if (actionText[choice.id].failure.length) scripts.push(script(`${choice.id}.failure`, choice.id, 'failure', [], 0, actionText[choice.id].failure))
  }
  await write(`scripts/${event.id}.json`, scripts)
}
console.log(`기존 콘텐츠 변환 완료: ${fileURLToPath(destination)}`)
