import type { ServiceState } from '@marianne/sdk'
import { api, useLive } from '../lib/api'

/** The services and what the user made of them (on, starred), kept up to date. */
export const useServices = (): ServiceState[] => useLive(api.listServices, api.onServices) ?? []

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
