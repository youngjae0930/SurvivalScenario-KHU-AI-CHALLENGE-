import { createServer } from 'vite'

// Use the same registry/compiler/planner as the product, including automatic JSON discovery.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { readCatalogPacks } = await server.ssrLoadModule('/src/content/catalog/registry.ts')
  const { planRoute } = await server.ssrLoadModule('/src/engine/catalog/route.ts')
  const { planSlotSegment } = await server.ssrLoadModule('/src/engine/catalog/slots.ts')
  for (const pack of readCatalogPacks()) {
    function completeSegments(id, seed, previous = []) {
      const segment = pack.manifest.slotPlan.segments.find(item => item.id === id)
      const sampled = planSlotSegment(pack, id, seed)
      const route = [...previous, ...sampled.route]
      return segment.nextSegmentIds.length ? segment.nextSegmentIds.filter(next => !pack.manifest.slotPlan.segments.find(item => item.id === next).lockedReason)
        .flatMap(next => completeSegments(next, sampled.rngState, route)) : [route]
    }
    const routes = Array.from({ length: 16 }, (_, i) => {
      const seed = Math.imul(i + 1, 0x9e3779b9) >>> 0
      return pack.manifest.slotPlan ? completeSegments(pack.manifest.slotPlan.startSegmentId, seed) : [planRoute(pack, seed).route]
    }).flat()
    console.log(JSON.stringify({
      pack: pack.manifest.id, revision: pack.manifest.revision,
      stages: pack.manifest.stages.map(stage => ({ ...stage,
        active: pack.locations.filter(l => l.stage === stage.id && l.enabled !== false).length,
        required: pack.locations.filter(l => l.stage === stage.id && l.enabled !== false && l.required).length,
      })),
      disabled: pack.locations.filter(l => l.enabled === false).map(l => l.id),
      sampledRuns: routes.length, observedLengths: [...new Set(routes.map(route => route.length))].sort((a, b) => a - b),
      observedRoutes: new Set(routes.map(route => route.join('/'))).size,
      ...(pack.manifest.slotPlan ? { lockedSegments: pack.manifest.slotPlan.segments.filter(segment => segment.lockedReason).map(segment => segment.id) } : {}),
      note: '관측 분량은16개 시드와 활성 분기 조합의 표본입니다. 플레이 중 행동 추첨은 별도이며 실제 읽고 판단하는 시간은 직접 측정해야 합니다.',
    }, null, 2))
  }
} finally {
  await server.close()
}
