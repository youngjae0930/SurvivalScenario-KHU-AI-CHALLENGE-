import { createServer } from 'vite'

// Use the same registry/compiler/planner as the product, including automatic JSON discovery.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { readCatalogPacks } = await server.ssrLoadModule('/src/content/catalog/registry.ts')
  const { planRoute } = await server.ssrLoadModule('/src/engine/catalog/route.ts')
  for (const pack of readCatalogPacks()) {
    const routes = Array.from({ length: 16 }, (_, i) => planRoute(pack, Math.imul(i + 1, 0x9e3779b9) >>> 0).route)
    console.log(JSON.stringify({
      pack: pack.manifest.id, revision: pack.manifest.revision,
      stages: pack.manifest.stages.map(stage => ({ ...stage,
        active: pack.locations.filter(l => l.stage === stage.id && l.enabled !== false).length,
        required: pack.locations.filter(l => l.stage === stage.id && l.required).length,
      })),
      disabled: pack.locations.filter(l => l.enabled === false).map(l => l.id),
      sampledRuns: routes.length, observedLengths: [...new Set(routes.map(route => route.length))].sort((a, b) => a - b),
      observedRoutes: new Set(routes.map(route => route.join('/'))).size,
      note: '관측 분량은16개 시드의 표본입니다. 실제 사람이 읽고 판단하는 플레이 시간은 별도 측정해야 합니다.',
    }, null, 2))
  }
} finally {
  await server.close()
}
