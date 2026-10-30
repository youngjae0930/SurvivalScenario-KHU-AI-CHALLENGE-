import { useState } from 'react'
import { createCatalogClient, createProductClient } from './app/catalog-client'
import { GameRoot } from './ui/GameRoot'
import { createBrowserStore } from './storage/browser-store'
import { PlaytestPanel } from './ui/playtest/PlaytestPanel'

function App() {
  const [playtest] = useState(() => new URLSearchParams(window.location.search).get('playtest') === '1')
  const [client] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const previewId = import.meta.env.DEV ? params.get('content-preview') : null
    const previewTrust = Number(params.get('trust') ?? '40')
    // Explicit development-only context. Never reads or overwrites the product save.
    const companion = previewId && params.get('companion-preview') === 'intervention'
      ? { name: '동료 선택 체험', traits: params.get('companion-trait') === 'same' ? { risk: 10, cognition: 10, affect: 10 } : { risk: 70, cognition: 70, affect: 70 }, trust: Number.isInteger(previewTrust) && previewTrust >= 0 && previewTrust <= 100 ? previewTrust : 40 }
      : undefined
    return previewId ? createCatalogClient({ packId: previewId, companion }) : createProductClient({ store: createBrowserStore() })
  })
  return <><GameRoot client={client} />{playtest && <PlaytestPanel client={client} />}</>
}

export default App
