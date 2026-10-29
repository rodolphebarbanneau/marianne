import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Spinner, useCall, type Loaded } from '@marianne/sdk/view'
import { ordinal } from '../links'
import type { ParlementMethods, Clip, DeputyCard, Favorites, VideoQuery } from '../types'

/** What the view's parts share: typed calls, navigation, the user's stored data, French formats. */

/** A method of the main side, loaded again when its arguments change; null arguments wait. */
export function useMethod<K extends keyof ParlementMethods & string>(
  method: K,
  args: Parameters<ParlementMethods[K]> | null
): Loaded<Awaited<ReturnType<ParlementMethods[K]>>> {
  return useCall<ParlementMethods, K>(method, args)
}

/** A value that settles: searches wait for the typing to pause. */
export function useDebounced<T>(value: T, ms = 350): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

// ---------------------------------------------------------------- navigation

export type Tab = 'today' | 'mine' | 'favorites' | 'ballots' | 'videos' | 'clips'

/** What opens over a tab: a deputy, a ballot, a video at a passage… */
export type Target =
  | { kind: 'deputy'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'ballot'; id: string }
  | { kind: 'meeting'; id: string }
  | { kind: 'live'; meetingId: string }
  | { kind: 'video'; id: string; start?: number; stopAt?: number; clip?: string }

export interface Nav {
  open(target: Target): void
  /** The videos tab, with a search ready (a deputy's speeches…). */
  searchVideos(query: Partial<VideoQuery>): void
}

export const NavContext = createContext<Nav | null>(null)

export function useNav(): Nav {
  const nav = useContext(NavContext)
  if (!nav) throw new Error('useNav outside the view')
  return nav
}

// ---------------------------------------------------------------- the user's data

export interface Store {
  favorites: Favorites
  setFavorites(patch: Partial<Favorites>): void
  clips: Clip[]
  setClips(clips: Clip[]): void
  /** Deputies whose votes the ballots show: the user's own and their favorites. */
  followed: DeputyCard[]
}

export const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore outside the view')
  return store
}

/** Starred or not, and the toggle. */
export function useStar(kind: keyof Favorites, id: string): [boolean, () => void] {
  const { favorites, setFavorites } = useStore()
  const on = favorites[kind].includes(id)
  return [on, () => setFavorites({ [kind]: on ? favorites[kind].filter((x) => x !== id) : [...favorites[kind], id] })]
}

export function Star({ kind, id }: { kind: keyof Favorites; id: string }) {
  const [on, toggle] = useStar(kind, id)
  return (
    <button className={`star${on ? ' on' : ''}`} onClick={toggle} title={on ? 'retirer des favoris' : 'ajouter aux favoris'}>
      {on ? '★' : '☆'}
    </button>
  )
}

// ---------------------------------------------------------------- blocks

export function Loading({ children = 'chargement…' }: { children?: ReactNode }) {
  return (
    <p className="dim">
      <Spinner /> {children}
    </p>
  )
}

export function Failure({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <p className="bad">
      ✗ {error}
      {retry && (
        <>
          {' '}
          <button className="link" onClick={retry}>
            réessayer
          </button>
        </>
      )}
    </p>
  )
}

/** A group's color, as the Assemblée draws it. */
export function GroupMark({ color }: { color: string }) {
  return <i className="parlement-mark" style={color ? { background: color } : undefined} />
}

export function DeputyLine({ d }: { d: DeputyCard }) {
  const nav = useNav()
  return (
    <div className="parlement-deputy">
      <button className="parlement-open" onClick={() => nav.open({ kind: 'deputy', id: d.id })}>
        <img src={d.photo} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <span className="parlement-grow">
          <span className="hi">{d.name}</span>
          <span className="small dim">
            <GroupMark color={d.groupColor} /> {d.groupShort || 'non inscrit'} · {d.department} · {constituency(d.constituency)}
          </span>
        </span>
      </button>
      <Star kind="deputies" id={d.id} />
    </div>
  )
}

export function DeputyList({ deputies }: { deputies: DeputyCard[] }) {
  return (
    <div className="parlement-deputies">
      {deputies.map((d) => (
        <DeputyLine key={d.id} d={d} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- French formats

const PARIS = 'Europe/Paris'

/** "mercredi 28 octobre 2026" */
export const longDay = (day: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${day}T12:00:00Z`))

/** "mer. 28 oct. 2026" */
export const shortDate = (iso: string) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : ''

/** "mer. 28 oct. · 14:30" */
export const dateTime = (iso: string) =>
  iso
    ? `${new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))} · ${new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))}`
    : ''

/** "14:30" */
export const hour = (iso: string) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : ''

/** "1re circonscription" */
export const constituency = (n: string) => (n ? `${ordinal(n)} circonscription` : '')

/** "12,3 Mo" */
export const megabytes = (bytes: number) => `${(bytes / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
