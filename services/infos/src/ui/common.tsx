import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import {
  foldText,
  LEAN_LABELS,
  LEANS,
  ownWords,
  SIDE_LABELS,
  SIDES,
  sideOf,
  type Lean,
  type NewsHeadline,
  type ServiceHost,
  type Side,
  type SubjectWords
} from '@marianne/sdk/view'
import { askText } from '../model'
import type { InfosSource, Reading } from '../types'

/** What the screen's parts share: the reading shown, its sources, and the ways out (a subject, an article, Marianne). */

export interface Infos {
  reading: Reading
  /** Every source of the list, by id. */
  source(id: string): InfosSource | undefined
  /** The source's name, by id (the id itself for one Marianne no longer lists). */
  name(id: string): string
  /** The source's editorial line (the centre for one Marianne no longer lists). */
  lean(id: string): Lean
  /** Open a subject over the tab, by id. */
  openSubject(id: string): void
  /** The article at its source. */
  openArticle(h: NewsHeadline): void
  /** A question for Marianne, with these titles and their links only. */
  ask(question: string, items: NewsHeadline[]): void
  /** « toutes », for this visit. */
  setAll(all: boolean): void
  /** Another tab of the screen (« tout le fil › »). */
  openTab(id: string): void
  /** Réglages › Identité, at « sources d’information ». */
  openSources(): void
  /** The search typed in the frame's field. */
  query: string
  /** The last visit (ISO), null the first time: what is NOUVEAU in the fil. */
  since: string | null
}

export const InfosContext = createContext<Infos | null>(null)

/** The screen's parts' view of a reading: its sources by id, and the ways out through the host. */
export function infosOf(
  reading: Reading,
  host: Pick<ServiceHost, 'openUrl' | 'ask' | 'openRoute'>,
  screen: Pick<Infos, 'openSubject' | 'setAll' | 'openTab' | 'query' | 'since'>
): Infos {
  const byId = new Map(reading.sources.map((s) => [s.id, s]))
  const names = new Map(reading.sources.map((s) => [s.id, s.name]))
  return {
    ...screen,
    reading,
    source: (id) => byId.get(id),
    name: (id) => names.get(id) ?? id,
    lean: (id) => byId.get(id)?.lean ?? 'centre',
    openArticle: (h) => host.openUrl(h.url),
    ask: (question, items) => host.ask(askText(question, items, names)),
    openSources: () => host.openRoute('settings/identity#sources')
  }
}

export function useInfos(): Infos {
  const infos = useContext(InfosContext)
  if (!infos) throw new Error('useInfos outside the INFOS screen')
  return infos
}

/** A source's colour and the colour of a text on it, from Marianne's tokens (they follow the theme). */
export const paint = (lean: Lean): CSSProperties => ({ background: `var(--lean-${lean})`, color: `var(--lean-${lean}-ink)` })
export const fill = (lean: Lean): CSSProperties => ({ background: `var(--lean-${lean})` })

/** « Le Monde · centre gauche »: every block and cell says its position, the Minitel 1 theme turning colours into greys. */
export const placeOf = (name: string, lean: Lean, setAside = false) => `${name} · ${LEAN_LABELS[lean]}${setAside ? ' · écartée' : ''}`

/** A source: its name in a block of its editorial line's colour; set aside, an outline. */
export function SourceTag({ id, plain }: { id: string; plain?: boolean }) {
  const { source, name, lean } = useInfos()
  const off = !plain && !!source(id)?.setAside
  return (
    <span className={`infos-src${off ? ' off' : ''}`} style={off ? undefined : paint(lean(id))} title={placeOf(name(id), lean(id), off)}>
      {name(id).toUpperCase()}
    </span>
  )
}

/** Where a source stands, on one line: a square in its colour at its position. */
export function Track({ id }: { id: string }) {
  const { source, name, lean } = useInfos()
  const at = lean(id)
  const off = !!source(id)?.setAside
  return (
    <span className="infos-trk" title={placeOf(name(id), at, off)}>
      {LEANS.map((l) => (
        <span key={l}>{l === at && <i className={off ? 'off' : ''} style={off ? undefined : fill(l)} />}</span>
      ))}
    </span>
  )
}

/** The track's head: « gauche » to « droite ». */
export function TrackAxis() {
  return (
    <span className="infos-trk axis">
      <span className="l">gauche</span>
      <span className="r">droite</span>
    </span>
  )
}

/** The colours' key, from the left to the right. */
export function LeanKey() {
  return (
    <span className="infos-keys">
      {LEANS.map((l) => (
        <span key={l}>
          <i style={fill(l)} />
          {LEAN_LABELS[l]}
        </span>
      ))}
    </span>
  )
}

/** Who tells a subject: one cell per source shown, from the left to the right, lit in its colour when it tells it. */
export function Spectrum({ sources, telling }: { sources: InfosSource[]; telling: Set<string> }) {
  return (
    <span className="infos-spec">
      {sources.map((s) => {
        const on = telling.has(s.id)
        return (
          <i
            key={s.id}
            className={`${on ? 'on' : ''}${s.setAside ? ' off' : ''}`}
            style={on && !s.setAside ? fill(s.lean) : undefined}
            title={`${placeOf(s.name, s.lean, s.setAside)}${on ? '' : ' · n’en parle pas'}`}
          />
        )
      })}
    </span>
  )
}

/** The sources of each side, in the order of their colours; a side none of them belongs to is left out, it would say « 0 sur 0 ». */
export function sidesOf(sources: InfosSource[]): Array<{ side: Side; label: string; sources: InfosSource[] }> {
  return SIDES.map((side) => ({ side, label: SIDE_LABELS[side], sources: sources.filter((s) => sideOf(s.lean) === side) })).filter((s) => s.sources.length > 0)
}

/** A subject's number, as a Minitel sommaire numbers its lines: type it, then ENVOI. The first in accent. */
export function Num({ n, small }: { n: number; small?: boolean }) {
  return <span className={`infos-num${n === 1 ? ' lead' : ''}${small ? ' sm' : ''}`}>{n}</span>
}

/** What a subject's titles say of it: DIRECT, NOUVEAU, ✓ vérifié, ◆ a theme of the user's. */
export function Badges({ live, fresh, checked, themes }: { live?: boolean; fresh?: boolean; checked?: boolean; themes: string[] }) {
  return (
    <>
      {live && <span className="infos-direct">DIRECT</span>}
      {fresh && <span className="infos-new">NOUVEAU</span>}
      {checked && (
        <span className="infos-chk" title="un vérificateur en parle">
          ✓ vérifié
        </span>
      )}
      {themes.map((t) => (
        <span key={t} className="infos-th">
          ◆ {t}
        </span>
      ))}
    </>
  )
}

/** A subject's words, joined by « · ». */
export function Words({ words }: { words: string[] }) {
  return (
    <span className="infos-words">
      {words.map((w, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          <b>{w}</b>
        </span>
      ))}
    </span>
  )
}

const TOKEN = /([\p{L}\p{N}]+)/u

/** A title with what it alone says in its subject highlighted (two words at most), where titles are compared. */
export function Marked({ title, words }: { title: string; words: SubjectWords | null }) {
  const own = new Set(words ? ownWords(title, words) : [])
  if (!own.size) return <>{title}</>
  const parts: ReactNode[] = []
  for (const [i, part] of title.split(TOKEN).entries()) {
    if (own.has(part)) {
      own.delete(part)
      parts.push(
        <mark key={i} className="infos-own">
          {part}
        </mark>
      )
    } else parts.push(part)
  }
  return <>{parts}</>
}

/** A title with the words searched marked, accents and case aside. */
export function QueryMarked({ text, query }: { text: string; query: string }) {
  const q = foldText(query.trim())
  if (!q) return <>{text}</>
  // Each character folded on its own, so that a match in the folded text points back into the title.
  const chars = [...text]
  const folded = chars.map((c) => foldText(c))
  const flat = folded.join('')
  const starts: number[] = []
  let at = 0
  for (const f of folded) {
    starts.push(at)
    at += f.length
  }
  const on = chars.map(() => false)
  for (let i = flat.indexOf(q); i >= 0; i = flat.indexOf(q, i + q.length))
    chars.forEach((_, j) => {
      if (starts[j] >= i && starts[j] < i + q.length) on[j] = true
    })
  const parts: ReactNode[] = []
  let run = ''
  let marked = false
  const flush = (key: number) => {
    if (!run) return
    parts.push(
      marked ? (
        <mark key={key} className="infos-q">
          {run}
        </mark>
      ) : (
        run
      )
    )
    run = ''
  }
  chars.forEach((c, j) => {
    if (on[j] !== marked) {
      flush(j)
      marked = on[j]
    }
    run += c
  })
  flush(chars.length)
  return <>{parts}</>
}

/** Réglages' gear, as the app's title bar draws it. */
export function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M6.31 3.08L6.66 1.13L9.34 1.13L9.69 3.08L11.41 4.08L13.28 3.41L14.62 5.72L13.1 7.01L13.1 8.99L14.62 10.28L13.28 12.59L11.41 11.92L9.69 12.92L9.34 14.87L6.66 14.87L6.31 12.92L4.59 11.92L2.72 12.59L1.38 10.28L2.9 8.99L2.9 7.01L1.38 5.72L2.72 3.41L4.59 4.08z M8 5.8a2.2 2.2 0 1 1 0 4.4a2.2 2.2 0 1 1 0-4.4z" />
    </svg>
  )
}

/** The page's last line: the sources whose feed didn't answer (their last titles still shown). */
export function FailedLine() {
  const { reading } = useInfos()
  if (!reading.failed.length || reading.offline) return null
  return <p className="small dim infos-failed">sans réponse : {reading.failed.join(', ')}</p>
}

/**
 * What a search finds nothing for: among the user's sources, with the way to all of them; among all
 * (« toutes », or sources not shared), plainly. With no search, `none`, the tab's own empty sentence.
 */
export function NoneFound({ none }: { none?: string }) {
  const { reading, query, setAll } = useInfos()
  if (!query) return <p className="infos-empty">{none}</p>
  const mine = reading.filtered && !reading.all
  return (
    <p className="infos-empty">
      {mine ? 'Aucun titre de vos sources n’en parle.' : 'Aucun titre n’en parle.'}
      {mine && (
        <>
          {' '}
          <button className="link" onClick={() => setAll(true)}>
            chercher dans toutes ›
          </button>
        </>
      )}
    </p>
  )
}
