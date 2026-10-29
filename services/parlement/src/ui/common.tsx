import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Spinner, useCall, type Loaded } from '@marianne/sdk/view'
import { ordinal } from '../links'
import { parisDay } from '../time'
import type { BallotLine, Chamber, Clip, Favorites, MemberCard, MemberVote, Mine, ParlementMethods, Position, Shelf, VideoItem, VideoQuery } from '../types'

/** What the view's parts share: typed calls, navigation, the user's stored data, French formats, the small marks. */

/** A method of the main side, loaded again when its arguments change; null arguments wait. */
export function useMethod<K extends keyof ParlementMethods & string>(
  method: K,
  args: Parameters<ParlementMethods[K]> | null
): Loaded<Awaited<ReturnType<ParlementMethods[K]>>> {
  return useCall<ParlementMethods, K>(method, args)
}

/** The latest day with public ballots (today on a sitting day): what the home and the day's views open on; null while loading. */
export function useBallotDay(): string | null {
  const latest = useMethod('ballots', [{ limit: 1 }])
  if (latest.error) return parisDay()
  if (!latest.data) return null
  const day = latest.data[0]?.date.slice(0, 10)
  return day && day < parisDay() ? day : parisDay()
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

export type Tab = 'home' | 'hemicycle' | 'ballots' | 'members' | 'videos' | 'agenda'

/** What opens over a tab, with a way back: a member, a ballot, a meeting, a video at a passage… */
export type Target =
  | { kind: 'member'; chamber: Chamber; id: string }
  | { kind: 'group'; chamber: Chamber; id: string }
  | { kind: 'ballot'; chamber: Chamber; id: string }
  | { kind: 'meeting'; id: string }
  | { kind: 'live'; chamber: Chamber; id: string }
  | { kind: 'video'; ref: string; start?: number; stopAt?: number; clip?: string }

/** Which chambers the screen shows: both, or one. */
export type Chambers = 'both' | Chamber

export interface Nav {
  open(target: Target): void
  tab(tab: Tab): void
  /** The videos tab, with a search ready (a member's speeches…). */
  searchVideos(query: Partial<VideoQuery>): void
  chambers: Chambers
  /** Whether the screen shows a chamber. */
  shows(chamber: Chamber): boolean
  /** Wide enough for a list and its detail side by side; narrower, a detail opens as a pane. */
  wide: boolean
}

export const NavContext = createContext<Nav | null>(null)

export function useNav(): Nav {
  const nav = useContext(NavContext)
  if (!nav) throw new Error('useNav outside the view')
  return nav
}

// ---------------------------------------------------------------- the user's data

export interface Prefs {
  /** The lens is on: comparisons with the leaning the user declared. */
  lens: boolean
}

export interface Store {
  favorites: Favorites
  setFavorites(patch: Partial<Favorites>): void
  clips: Clip[]
  setClips(clips: Clip[]): void
  shelf: Shelf
  setShelf(patch: Partial<Shelf>): void
  /** Videos kept on the shelf, as they were when kept (to show them without asking the portals). */
  videos: Record<string, VideoItem>
  keepVideo(video: VideoItem): void
  prefs: Prefs
  setPrefs(patch: Partial<Prefs>): void
  /** The user's own (from their address) and what they let the service read; null until loaded or without data. */
  mine: Mine | null
}

export const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore outside the view')
  return store
}

/** The lens' group in a chamber (an acronym), when the user declared one and the lens is on. */
export function useLens(): { an: string | null; se: string | null; on: boolean; declared: boolean } {
  const { mine, prefs } = useStore()
  const an = mine?.leaning?.an[0] ?? null
  const se = mine?.leaning?.se[0] ?? null
  const declared = !!(an || se)
  return { an: declared && prefs.lens ? an : null, se: declared && prefs.lens ? se : null, on: declared && prefs.lens, declared }
}

/** The members whose votes the screens follow: the user's own, then those they follow. */
export function useFollowed(): { mine: MemberCard[]; ids: string[] } {
  const { mine, favorites } = useStore()
  // A split commune whose address doesn't tell the constituency: none of its deputies is "yours".
  const own = mine ? [...(mine.exact ? mine.deputies : []), ...mine.senators] : []
  return { mine: own, ids: [...new Set([...own.map((m) => m.id), ...favorites.members])] }
}

/** Followed or not, and the toggle. */
export function useFollow(kind: keyof Favorites, id: string): [boolean, () => void] {
  const { favorites, setFavorites } = useStore()
  const on = favorites[kind].includes(id)
  return [on, () => setFavorites({ [kind]: on ? favorites[kind].filter((x) => x !== id) : [...favorites[kind], id] })]
}

export function FollowButton({ id, kind = 'members' }: { id: string; kind?: keyof Favorites }) {
  const [on, toggle] = useFollow(kind, id)
  return (
    <button className={`parlement-follow${on ? ' on' : ''}`} onClick={toggle} title={on ? 'ne plus suivre' : 'suivre ses votes et ses interventions'}>
      {on ? '★ suivi' : '☆ suivre'}
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

/** A chamber, as a Videotex code: AN cyan, SÉNAT magenta. */
export function ChamberCode({ chamber }: { chamber: Chamber }) {
  return <span className={`parlement-ch ${chamber}`}>{chamber === 'an' ? 'AN' : 'SÉNAT'}</span>
}

/** A group: its colour as a mosaic block, its acronym in text ink. */
export function GroupChip({ short, color, name, small }: { short: string; color: string; name?: string; small?: boolean }) {
  return (
    <span className={`parlement-grp${small ? ' small' : ''}`} title={name}>
      <i style={{ background: color || undefined }} />
      {short || 'NI'}
    </span>
  )
}

/** "Vos idées": a half-filled disc, drawn like the app's status dots. */
export function LensIcon() {
  return <i className="parlement-idee" aria-hidden />
}

export function LensChip({ group }: { group: string }) {
  return (
    <span className="parlement-lens" title="la sensibilité indiquée dans Réglages › Identité">
      <LensIcon /> vos idées · {group}
    </span>
  )
}

export const POSITION_SHORT: Record<Position, string> = { for: 'pour', against: 'contre', abstention: 'abst.', nonVoting: 'non-votant' }

/** A vote as a word in its colour; ⇄ when cast by a colleague. */
export function Vote({ vote }: { vote: MemberVote | null | undefined }) {
  if (!vote?.position) return <span className="parlement-pos none">—</span>
  return (
    <span className={`parlement-pos ${vote.position}`}>
      {POSITION_SHORT[vote.position]}
      {vote.proxy && (
        <span className="dim" title="par délégation : un collègue a voté pour lui">
          {' '}
          ⇄
        </span>
      )}
    </span>
  )
}

export function Result({ line }: { line: Pick<BallotLine, 'adopted' | 'result'> }) {
  return <span className={`parlement-res ${line.adopted ? 'ok' : 'bad'}`}>{line.adopted ? 'adopté' : /^rejet/.test(line.result) ? 'rejeté' : line.result}</span>
}

/** Pour · contre · abstention as a bar, 2px apart. */
export function VoteBar({ line, width = 92 }: { line: Pick<BallotLine, 'for' | 'against' | 'abstentions'>; width?: number }) {
  const total = line.for + line.against + line.abstentions || 1
  const part = (n: number, cls: string) => (n ? <i className={cls} style={{ width: `${(n / total) * 100}%` }} /> : null)
  return (
    <span className="parlement-vbar" style={{ width }} title={`${line.for} pour · ${line.against} contre · ${line.abstentions} abstentions`}>
      {part(line.for, 'f')}
      {part(line.against, 'a')}
      {part(line.abstentions, 's')}
    </span>
  )
}

/** A member's votes as mosaic blocks, one per ballot: green for, red against, yellow abstention, half by proxy, hollow when they didn't vote. */
export function Mosaic({ votes, big }: { votes: Array<{ title: string; vote: MemberVote | undefined }>; big?: boolean }) {
  return (
    <span className={`parlement-mos${big ? ' big' : ''}`}>
      {votes.map(({ title, vote }, i) => (
        <i
          key={i}
          className={`${vote?.position && vote.position !== 'nonVoting' ? vote.position : 'none'}${vote?.proxy ? ' px' : ''}`}
          title={`${title} : ${vote?.position ? `${POSITION_SHORT[vote.position]}${vote.proxy ? ' (délégation)' : ''}` : 'pas de vote'}`}
        />
      ))}
    </span>
  )
}

/** A member's portrait: the chamber's photo, a mosaic of their group's colour when there is none. */
export function Face({ member, size = 40 }: { member: Pick<MemberCard, 'photo' | 'groupColor' | 'name'>; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed || !member.photo) return <span className="parlement-face none" style={{ width: size, height: size, background: member.groupColor }} />
  return <img className="parlement-face" src={member.photo} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} />
}

// ---------------------------------------------------------------- French formats

const PARIS = 'Europe/Paris'

/** "mercredi 28 octobre 2026" */
export const longDay = (day: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${day}T12:00:00Z`))

/** "mer. 28 oct." */
export const shortDay = (day: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00Z`))

/** "28 oct." */
export const dayMonth = (day: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${day.slice(0, 10)}T12:00:00Z`))

/** "mer. 28 oct. 2026" */
export const shortDate = (iso: string) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : ''

/** "mer. 28 oct. · 14:30" */
export const dateTime = (iso: string) =>
  iso ? `${new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))} · ${hour(iso)}` : ''

/** "14 h 30" */
export const hour = (iso: string) => {
  if (!iso) return ''
  const [h, m] = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).split(':')
  return `${h} h ${m}`
}

/** "1re circonscription" */
export const constituency = (n: string) => (n ? `${ordinal(n)} circonscription` : '')

/** "12,3 Mo" */
export const megabytes = (bytes: number) => `${(bytes / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`

/** "75 %" */
export const percent = (share: number) => `${Math.round(share * 100)} %`

/** "1 scrutin public", "3 scrutins publics", "0 scrutin public": French counts take the plural from 2. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`

/** "votre députée", "votre sénateur" */
export const yourTitle = (m: Pick<MemberCard, 'chamber' | 'female'>) =>
  m.chamber === 'an' ? (m.female ? 'votre députée' : 'votre député') : m.female ? 'votre sénatrice' : 'votre sénateur'
