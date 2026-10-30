import { DOMAIN_IDS } from '@marianne/sdk'
import type { DomainId } from '@shared/types'

/** The pages, top to bottom: SUITE goes down one, RETOUR up one. */
export const PAGES = ['home', 'procedures', 'services'] as const
export type PageId = (typeof PAGES)[number]
export const PAGE_LABELS: Record<PageId, string> = { home: 'Marianne', procedures: 'Démarches', services: 'Services' }

/** A domain's dashboard belongs to Démarches; a service, opened by its code ("meteo") with what to show first, to Services. */
export type View =
  | { kind: 'page'; page: PageId }
  | { kind: 'domain'; id: DomainId; tab?: DomainTab }
  | { kind: 'folder'; id: string }
  /**
   * A service's screen. `opened` counts the openings (app/context.tsx): the same service opened again,
   * from its row, its tile, the palette or a link, starts afresh on its first tab, as F2 shows it.
   */
  | { kind: 'service'; id: string; params?: Record<string, string | number>; opened?: number }

/** A domain's tabs. */
export type DomainTab = 'apercu' | 'taches' | 'dossiers' | 'ressources'

/** Where a route leads: a screen, or a page of the settings (and a section of it); null: nowhere known. */
export type RouteTarget = { kind: 'view'; view: View } | { kind: 'settings'; page: string; section: string } | null

/**
 * A route names a screen: "folder:<id>", "settings:<page>#<section>", "service:<code>", "procedures"…
 * (":" or "/" alike). The main process sends them (a notification, the tray), Marianne links to them
 * (marianne:service/infos), and a service opens them with what the screen starts with: its params.
 */
export function routeTarget(route: string, params?: Record<string, string | number>): RouteTarget {
  const [path, section = ''] = route.split('#')
  const [kind, arg = ''] = path.split(/[:/]/)
  if (kind === 'folder' && arg) return { kind: 'view', view: { kind: 'folder', id: arg } }
  if (kind === 'settings') return { kind: 'settings', page: arg || 'identity', section }
  if (kind === 'service' && arg) return { kind: 'view', view: { kind: 'service', id: arg, ...(params && Object.keys(params).length ? { params } : {}) } }
  if (kind === 'domain' && (DOMAIN_IDS as readonly string[]).includes(arg)) return { kind: 'view', view: { kind: 'domain', id: arg as DomainId } }
  // The Actualités page became 3615 INFOS: Marianne's earlier answers still link to it.
  if (kind === 'news') return { kind: 'view', view: { kind: 'service', id: 'infos' } }
  if ((PAGES as readonly string[]).includes(kind)) return { kind: 'view', view: { kind: 'page', page: kind as PageId } }
  return null
}
