import { createServer } from 'vite'
import { writeFile } from 'node:fs/promises'

// Reproducible QA policies, not game AI or a measurement of human play time.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { readDefaultCatalog } = await server.ssrLoadModule('/src/content/catalog/registry.ts')
  const { resolveAnswers } = await server.ssrLoadModule('/src/app/questionnaire.ts')
  const { createInheritedCatalogRun } = await server.ssrLoadModule('/src/engine/catalog/inheritance.ts')
  const runtime = await server.ssrLoadModule('/src/engine/catalog/runtime.ts')
  const { activeCatalogCompanion } = await server.ssrLoadModule('/src/engine/catalog/companion-journey.ts')
  const { catalogGameView } = await server.ssrLoadModule('/src/app/view-models/catalog.ts')
  const pack = readDefaultCatalog()
  const rows = []
  const paths = [['hospital', 'subway'], ['hospital', 'school'], ['department', 'subway'], ['department', 'school'], ['hospital', 'research']]
  const extreme = run => Object.values(run.core.protagonist.traits).some(value => value <= 22 || value >= 78)
  const average = xs => Math.round(xs.reduce((sum, x) => sum + x, 0) / xs.length * 10) / 10
  function choose(run, middle, late, policy) {
    const allowed = runtime.catalogChoices(pack, run).map(choice => ({ choice, preview: runtime.previewCatalogAction(pack, run, choice.id) })).filter(p => p.preview.allowed)
    const find = predicate => allowed.find(p => predicate(p.choice, p.preview))
    return find(c => c.destinationSegmentId === (run.visitIndex === 6 ? middle : late))
      ?? (late === 'research' ? find(c => /\.(transport-record|collect)$/.test(c.id)) : undefined)
      ?? (late === 'research' && policy !== 'cautious' ? find(c => c.id.endsWith('.recover')) : undefined)
      ?? (policy === 'aid' ? find(c => c.judgment === 'rescue' && c.id.endsWith('.aid')) ?? find(c => c.judgment === 'rescue') : undefined)
      ?? (policy === 'gather' ? find((c, p) => p.action.successEffects.some(e => e.kind === 'add' && ['supply', 'medkit'].includes(e.stat) && e.amount > 0)) : undefined)
      ?? find(c => c.behavior.kind === 'recovery' && c.behavior.choice === 'maintain')
      ?? find(c => c.behavior.kind === 'escape' && c.behavior.route === 'short')
      ?? find((c, p) => p.check.kind === 'certain' && p.action.successEffects.some(e => e.kind === 'set-flag' && e.flag === 'routeKnown'))
      ?? find((c, p) => c.behavior.kind === 'action' && p.check.kind === 'certain' && !c.infection)
      ?? allowed[0]
  }
  function simulate(initial, middle, late, policy) {
    let run = initial, firstExtreme = extreme(run) ? 0 : null, emptySupplyEvents = 0, minStamina = run.core.protagonist.stamina
    let risky = 0, characters = 0, opportunitySeen = false, blockedGoal = false
    while (run.phase === 'choice' && run.history.length < 19) {
      const selected = choose(run, middle, late, policy)
      if (!selected) break
      const view = catalogGameView(pack, run)
      characters += view.kind === 'choice' ? [...view.story.map(p => p.text), ...view.actions.map(a => a.label + a.intention)].join('').length : 0
      opportunitySeen ||= runtime.catalogChoices(pack, run).some(c => c.id.endsWith('.transport-record'))
      if ((run.visitIndex === 6 || run.visitIndex === 13) && selected.choice.destinationSegmentId !== (run.visitIndex === 6 ? middle : late)) blockedGoal = true
      if (selected.preview.check.kind === 'probability') risky++
      if (!run.core.inventory.supply) emptySupplyEvents++
      const result = runtime.executeCatalogAction(pack, run, selected.choice.id)
      if (firstExtreme === null && extreme(result)) firstExtreme = result.history.length
      minStamina = Math.min(minStamina, result.core.protagonist.stamina)
      const resultView = catalogGameView(pack, result)
      if ('text' in resultView) characters += resultView.text.join('').length
      run = result.phase === 'result' ? runtime.acknowledgeCatalogResult(pack, result, result.result.resultId) : result
    }
    const legacy = runtime.catalogLegacy(pack, run)
    return { run, legacy, row: { middle, late, policy, ending: legacy?.ending ?? run.phase, completed: run.history.length,
      finalStamina: run.core.protagonist.stamina, minStamina, supply: run.core.inventory.supply, medkit: run.core.inventory.medkit,
      injury: run.core.protagonist.injury, firstExtreme, emptySupplyEvents, risky, characters, opportunitySeen, blockedGoal,
      companionAlive: !!activeCatalogCompanion(run), trust: run.companion?.trust ?? null } }
  }
  for (let seedIndex = 1; seedIndex <= 8; seedIndex++) for (const [middle, late] of paths) for (const policy of ['cautious', 'gather', 'aid']) {
    const answers = resolveAnswers(Array.from({ length: 6 }, (_, i) => ({ questionId: `Q0${i + 1}`, answerId: seedIndex % 3 === 0 ? 'a' : seedIndex % 3 === 1 ? 'b' : i % 2 ? 'b' : 'a' })))
    if (!answers.ok) throw new Error(answers.error.message)
    const input = { runId: `balance-${seedIndex}-${middle}-${late}-${policy}`, name: '점검 생존자', seed: Math.imul(seedIndex, 0x9e3779b9) >>> 0, answers: answers.value }
    const first = simulate(runtime.createCatalogRun(pack, input), middle, late, policy)
    rows.push({ seedIndex, round: 1, ...first.row })
    if (first.legacy) {
      const next = createInheritedCatalogRun(pack, first.legacy, { ...input, runId: input.runId + '-next', seed: Math.imul(seedIndex + 101, 0x9e3779b9) >>> 0 })
      rows.push({ seedIndex, round: 2, ...simulate(next, middle, late, policy).row })
    }
  }
  const summaries = paths.flatMap(([middle, late]) => ['cautious', 'gather', 'aid'].map(policy => {
    const group = rows.filter(r => r.middle === middle && r.late === late && r.policy === policy)
    const endings = Object.fromEntries([...new Set(group.map(r => r.ending))].map(ending => [ending, group.filter(r => r.ending === ending).length]))
    const extremes = group.map(r => r.firstExtreme).filter(n => n !== null)
    return { middle, late, policy, runs: group.length, endings, meanCompleted: average(group.map(r => r.completed)),
      meanMinStamina: average(group.map(r => r.minStamina)), meanEndSupply: average(group.map(r => r.supply)),
      meanRisky: average(group.map(r => r.risky)), extremeRuns: extremes.length, earliestExtreme: extremes.length ? Math.min(...extremes) : null,
      meanFirstExtreme: extremes.length ? average(extremes) : null, blockedGoals: group.filter(r => r.blockedGoal).length }
  }))
  const report = { revision: pack.manifest.revision, sample: '8 seeds × 5 route plans × 3 fixed QA policies × 2 successive rounds',
    note: '플레이어 통계·인간의 판단·읽기 시간 측정이 아니다. 고정 정책 표본이며 조기 사망도 포함한다. 초기 성향은 중립/양극 응답을 섞었다.',
    runs: rows.length, deadlocks: rows.filter(r => !['tunnel-escape', 'outskirts-escape', 'cure-discovery', 'escape', 'data-and-escape', 'escape-failed', 'infection-death'].includes(r.ending)).length,
    earlyExtremeRuns: rows.filter(r => r.firstExtreme !== null && r.firstExtreme <= 1).length, summaries, rows }
  await writeFile(new URL('../docs/balance-sample.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ ...report, rows: undefined }, null, 2))
} finally { await server.close() }
