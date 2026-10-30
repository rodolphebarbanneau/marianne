import { useEffect, useState } from 'react'
import type { ServiceState } from '@marianne/sdk'
import type { CatalogueState } from '@shared/catalogue'
import type { TileState } from '@shared/types'
import { api, useLive } from '../lib/api'

/** The services and what the user made of them (added, on, pinned), kept up to date. */
export const useServices = (): ServiceState[] => useLive(api.listServices, api.onServices) ?? []

/** How often the page looks at its tiles while it shows: the stale ones are asked again, the ages move on. */
const TILES_LOOK_MS = 60_000

/**
 * The tiles of the pinned services, while the page that shows them is on screen: looked at when
 * it comes and every minute (Marianne asks a service again when its tile is older than its
 * period), and kept up to date as new ones come.
 */
export function useServiceTiles(): Record<string, TileState> {
  const [tiles, setTiles] = useState<Record<string, TileState>>({})
  useEffect(() => {
    let alive = true
    const look = () => void api.serviceTiles().then((t) => alive && setTiles(t))
    look()
    const timer = setInterval(look, TILES_LOOK_MS)
    const off = api.onServiceTiles((t) => alive && setTiles(t))
    return () => {
      alive = false
      clearInterval(timer)
      off()
    }
  }, [])
  return tiles
}

const NO_CATALOGUE: CatalogueState = { status: 'loading', entries: [], withdrawn: [] }

/** The community catalogue, read again when it is old. */
export const useCatalogue = (): CatalogueState => useLive(api.catalogue, api.onCatalogue) ?? NO_CATALOGUE

/** The service that opens a link itself (a video of the Assemblée…), when one is on. */
export const serviceForLink = (services: ServiceState[], href: string): ServiceState | undefined =>
  services.find((s) => s.on && s.manifest.links.some((prefix) => href.startsWith(prefix)))

/** How the conversation names a service's tool ("assemblée · scrutins"). */
export function serviceToolLabel(services: ServiceState[], name: string): string | undefined {
  for (const s of services) {
    const tool = s.tools.find((t) => t.name === name)
    if (tool) return `${s.manifest.id} · ${tool.label}`
  }
  return undefined
}
