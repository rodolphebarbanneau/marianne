import { useEffect, useState, type ReactNode } from 'react'
import { foldText, NEUTRAL_ICON, PROFILE_FIELDS, type PixelArt, type ServiceManifest, type ServiceState, type ServiceTrust } from '@marianne/sdk'
import { Modal, Pixels, ServiceIcon, Spinner } from '@marianne/sdk/view'
import type { CatalogueEntry, ServiceFileReview } from '@shared/catalogue'
import { SearchField } from '../../components/ui'
import { api, errorText } from '../../lib/api'
import { bytes, dayMonth } from '../../lib/format'
import { plainKey } from '../../lib/keys'
import type { Listing } from './model'
import { Code, Community, Official, TrustMark } from './parts'

/** The Services page's dialogs: choosing the pinned services, a .3615 file, and « avant d’ajouter ». */

/** Enter in a dialog: its main button, unless the focus is on another button. Ctrl+Enter stays the app's (a new folder). */
function useEnter(run: (() => void) | null) {
  useEffect(() => {
    if (!run) return
    const key = (e: KeyboardEvent) => {
      if (!plainKey(e, 'Enter') || (e.target as HTMLElement | null)?.closest?.('button, a, textarea')) return
      e.preventDefault()
      run()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [run])
}

function Head({ title, close, closeLabel = 'fermer ✕' }: { title: string; close: () => void; closeLabel?: string }) {
  return (
    <div className="mh">
      <span className="t">{title}</span>
      <button className="btn small" onClick={close}>
        {closeLabel}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- the pinned services

/** Every service of mine, to tick: ticking adds its tile at the end, unticking removes it. No limit. */
export function PinsDialog({
  services,
  pinned,
  onToggle,
  onDiscover,
  onClose
}: {
  services: Listing[]
  pinned: string[]
  onToggle: (code: string) => void
  onDiscover: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  useEnter(onClose)
  const q = foldText(query.trim())
  const shown = services.filter((l) => !q || [l.code, l.name, l.description].some((t) => foldText(t).includes(q))).sort((a, b) => a.code.localeCompare(b.code))
  return (
    <Modal wide onClose={onClose} label="modifier les épingles">
      <Head title="MODIFIER LES ÉPINGLES" close={onClose} />
      <div className="in">
        <div className="row-flex" style={{ flexWrap: 'nowrap' }}>
          <SearchField className="grow" value={query} onChange={setQuery} placeholder="chercher parmi mes services" />
          <span className="small dim" style={{ whiteSpace: 'nowrap' }}>
            {pinned.length} épinglé{pinned.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="pinlist" role="group" aria-label="mes services">
          {shown.map((l) => {
            const on = pinned.includes(l.code)
            return (
              <label key={l.code} className={`pinrow${on ? ' on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => onToggle(l.code)} />
                <ServiceIcon icon={l.icon} size="small" />
                <span className="stack">
                  <span className="row-flex" style={{ gap: 8 }}>
                    <Code code={l.code} />
                    <span className="hi">{l.name}</span>
                  </span>
                  <span className="small dim ell">{l.description}</span>
                </span>
                <span className="row-flex" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  {l.official ? <Official /> : <Community />}
                  {!l.official && l.trust && <TrustMark trust={l.trust} />}
                </span>
              </label>
            )
          })}
          {!shown.length && (
            <p className="dim small" style={{ padding: '8px 6px' }}>
              Aucun de vos services ne correspond.
            </p>
          )}
        </div>
      </div>
      <div className="foot">
        <button className="link small" onClick={onDiscover}>
          découvrir d’autres services ›
        </button>
        <button className="btn primary" onClick={onClose}>
          terminé
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- a .3615 file

/** The file icon of a .3615, as the system shows it. */
const FILE_ICON: PixelArt = {
  palette: { b: 'bleu', w: 'blanc', j: 'jaune' },
  pixels: ['bbbbbbbb', 'b.wwww.b', 'b.wwww.b', 'b......b', 'b.jjjj.b', 'b.j..j.b', 'b.jjjj.b', 'bbbbbbbb']
}

/** Drop a .3615 file, or choose it: Marianne reads and checks it; nothing of it runs before the user agrees. */
export function FileDialog({ onReview, onClose }: { onReview: (review: ServiceFileReview) => void; onClose: () => void }) {
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const read = (job: Promise<ServiceFileReview | null>) => {
    setBusy(true)
    setError('')
    job
      .then((review) => review && onReview(review))
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false))
  }
  const choose = () => !busy && read(api.chooseServiceFile())
  useEnter(choose)
  return (
    <Modal wide onClose={onClose} label="ajouter un fichier .3615">
      <Head title="AJOUTER UN FICHIER .3615" close={onClose} />
      <div className="in">
        <div
          className={`drop${over ? ' over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={choose}
          onKeyDown={(e) => plainKey(e, ' ') && choose()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const file = e.dataTransfer.files[0]
            if (file) read(api.readServiceFile(api.pathOfFile(file)))
          }}
        >
          <Pixels art={FILE_ICON} cell={7} />
          <span className="big">DÉPOSEZ UN FICHIER .3615</span>
          <span className="dim">
            ou <span className="link">choisissez-le sur cet ordinateur</span>
          </span>
          <span className="small muted">{busy ? <Spinner /> : 'rien ne s’exécute avant votre accord'}</span>
        </div>
        {error && <p className="small bad">{error}</p>}
      </div>
      <div className="foot">
        <span />
        <button className="btn" onClick={onClose}>
          annuler
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- before adding

/** What « avant d’ajouter » reviews: a built-in service, a service of the catalogue, a .3615 file. */
export type ReviewSubject = { kind: 'official'; state: ServiceState } | { kind: 'catalogue'; listing: Listing } | { kind: 'file'; review: ServiceFileReview }

/** What the review shows, whatever the subject. */
interface Facts {
  code: string
  name: string
  description: string
  version: string
  icon: PixelArt | null
  official: boolean
  verdict: ServiceTrust | 'official' | 'refused'
  byline: string
  hosts: string[]
  /** The pages it opens in the user's browser itself (a community service's links). */
  links: string[]
  sync: boolean
  tools: string[]
  reads: string[]
  problems: string[]
  sha256?: string
  published?: string
  withdrawnReason?: string
  replaces?: string
}

const fromManifest = (m: ServiceManifest) => ({
  code: m.id,
  name: m.name,
  description: m.description,
  version: m.version,
  icon: m.icon,
  hosts: m.hosts,
  reads: m.permissions.profile.map((f) => PROFILE_FIELDS[f])
})

function factsOf(subject: ReviewSubject): Facts {
  if (subject.kind === 'official') {
    const s = subject.state
    return {
      ...fromManifest(s.manifest),
      official: true,
      verdict: 'official',
      byline: `par Marianne · version ${s.manifest.version}`,
      links: [],
      sync: !!s.sync,
      tools: s.tools.map((t) => t.label),
      problems: []
    }
  }
  if (subject.kind === 'catalogue') {
    const e = subject.listing.entry as CatalogueEntry
    return {
      code: e.code,
      name: e.name,
      description: e.description,
      version: e.version,
      icon: e.icon,
      official: false,
      verdict: e.status,
      byline: `par ${e.author} · version ${e.version} · ${bytes(e.file.size)}`,
      hosts: e.hosts,
      links: e.links,
      sync: e.sync,
      tools: e.tools,
      reads: e.reads.map((f) => PROFILE_FIELDS[f]),
      problems: [],
      sha256: e.file.sha256,
      published: e.published
    }
  }
  const r = subject.review
  const m = r.manifest
  return {
    ...(m ? fromManifest(m) : { code: r.fileName.replace(/\.3615$/i, ''), name: r.fileName, description: '', version: '', icon: null, hosts: [], reads: [] }),
    official: false,
    verdict: r.verdict,
    byline: [m ? `par ${m.author || 'un auteur inconnu'}` : '', m ? `version ${m.version}` : '', bytes(r.size), r.fileName].filter(Boolean).join(' · '),
    sync: r.sync,
    tools: r.tools,
    links: r.links ?? [],
    problems: r.problems,
    sha256: r.sha256,
    ...(r.entry ? { published: r.entry.published } : {}),
    ...(r.withdrawnReason ? { withdrawnReason: r.withdrawnReason } : {}),
    ...(r.installed ? { replaces: r.installed } : {})
  }
}

/** A file's fingerprint, as one reads it aloud: "7f3a 91c0 … c2e1". */
const fingerprint = (sha256: string) => `${sha256.slice(0, 4)} ${sha256.slice(4, 8)} … ${sha256.slice(-4)}`

function Verdict({ facts, ack, onAck }: { facts: Facts; ack: boolean; onAck: (ack: boolean) => void }) {
  const confirm = (text: string) => (
    <label className="small">
      <input type="checkbox" checked={ack} onChange={(e) => onAck(e.target.checked)} /> {text}
    </label>
  )
  switch (facts.verdict) {
    case 'official':
      return (
        <div className="verdict-box">
          <span className="trust-ok">✓</span>
          <span>
            <span className="hi">Officiel : livré avec Marianne</span> · version {facts.version}
            <br />
            <span className="small dim">déjà sur cet ordinateur, signé avec l’application</span>
          </span>
        </div>
      )
    case 'validated':
      return (
        <div className="verdict-box">
          <span className="trust-ok">✓</span>
          <span>
            <span className="hi">Validé par Marianne</span>
            {facts.published ? ` · publié le ${dayMonth(facts.published)}` : ''}, version {facts.version}
            <br />
            <span className="small dim">
              son empreinte{facts.sha256 ? ` (${fingerprint(facts.sha256)})` : ''} est celle que Marianne a signée dans le catalogue
            </span>
          </span>
        </div>
      )
    case 'unvalidated':
      return (
        <div className="verdict-box warn">
          <span className="trust-warn">!</span>
          <span>
            <span className="hi">Non validé : dans le catalogue, pas encore relu par Marianne.</span> Son auteur est connu ; son contenu n’a pas été vérifié.
            <br />
            {confirm('je l’ajoute quand même')}
          </span>
        </div>
      )
    case 'outside':
      return (
        <div className="verdict-box warn strong">
          <span className="trust-warn">⚠</span>
          <span>
            <span className="hi">Hors catalogue : ce fichier n’est pas dans le dépôt de la communauté.</span> Personne ne l’a relu. N’ajoutez que ce que vous
            connaissez (un service que vous écrivez, un test).
            <br />
            {confirm('je sais d’où vient ce fichier')}
          </span>
        </div>
      )
    case 'withdrawn':
      return (
        <div className="verdict-box refused">
          <span className="bad">✕</span>
          <span>
            <span className="hi">Validation retirée : Marianne ne l’ajoute plus.</span>
            {facts.withdrawnReason && (
              <>
                <br />
                <span className="small dim">{facts.withdrawnReason}</span>
              </>
            )}
          </span>
        </div>
      )
    default:
      return (
        <div className="verdict-box refused">
          <span className="bad">✕</span>
          <span>
            <span className="hi">Ce fichier n’est pas un service que Marianne peut ajouter.</span>
            {facts.problems.map((p) => (
              <span key={p} className="small dim" style={{ display: 'block' }}>
                {p}
              </span>
            ))}
          </span>
        </div>
      )
  }
}

/** One line of what it will be able to do: its mark, what, the detail. */
function Can({ mark, what, children }: { mark: PixelArt; what: string; children: ReactNode }) {
  return (
    <div className="r">
      <span className="g">
        <Pixels art={mark} cell={3} />
      </span>
      <span className="k">{what}</span>
      <span>{children}</span>
    </div>
  )
}

const MARKS: Record<'net' | 'place' | 'data' | 'tool' | 'person', PixelArt> = {
  net: { palette: { c: 'cyan' }, pixels: ['.ccc.', 'c.c.c', 'ccccc', 'c.c.c', '.ccc.'] },
  place: { palette: { j: 'jaune' }, pixels: ['.jjj.', 'j...j', 'j...j', '.j.j.', '..j..'] },
  data: { palette: { w: 'blanc' }, pixels: ['wwwww', 'w...w', 'wwwww', 'w...w', 'wwwww'] },
  tool: { palette: { j: 'jaune' }, pixels: ['j.j.j', '.jjj.', 'jj.jj', '.jjj.', 'j.j.j'] },
  person: { palette: { m: 'magenta' }, pixels: ['.mmm.', '.mmm.', '..m..', 'mmmmm', 'm...m'] }
}

/**
 * « Avant d’ajouter »: who the service is, the verdict (official, validated, not validated, outside
 * the catalogue: these two after a confirmation; withdrawn or refused: no way to add), what it will
 * be able to do, what it never can. Adding is the user's click; closing gives the page back as it was.
 */
export function ReviewDialog({ subject, onAdded, onClose }: { subject: ReviewSubject; onAdded: (code: string) => void; onClose: () => void }) {
  const facts = factsOf(subject)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refused = facts.verdict === 'refused' || facts.verdict === 'withdrawn'
  const allowed = !refused && (facts.verdict === 'official' || facts.verdict === 'validated' || ack)
  const add = () => {
    if (!allowed || busy) return
    setBusy(true)
    setError('')
    const job =
      subject.kind === 'official'
        ? api.addService(subject.state.manifest.id)
        : subject.kind === 'catalogue'
          ? api.addCatalogueService(facts.code)
          : api.installServiceFile(subject.review.ticket)
    job
      .then(() => onAdded(facts.code))
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setBusy(false))
  }
  useEnter(allowed && !busy ? add : null)
  const code = facts.code.toUpperCase()
  return (
    <Modal wide onClose={onClose} label={`avant d’ajouter 3615 ${code}`}>
      <Head title="AVANT D’AJOUTER" close={onClose} closeLabel="‹ retour" />
      <div className="in">
        <div className="review-head">
          <ServiceIcon icon={facts.icon ?? (refused ? NEUTRAL_ICON : null)} size="large" />
          <div className="stack" style={{ gap: 4 }}>
            <span className="row-flex">
              <Code code={facts.code} />
              {facts.official ? (
                <Official />
              ) : (
                <>
                  <Community />
                  {facts.verdict !== 'refused' && facts.verdict !== 'official' && <TrustMark trust={facts.verdict} />}
                </>
              )}
            </span>
            <span className="hi" style={{ fontSize: '1.1em' }}>
              {facts.name}
            </span>
            <span className="small dim">
              {facts.byline}
              {facts.replaces && ` · nouvelle version, remplace la version ${facts.replaces}`}
            </span>
            {facts.description && <span className="small">{facts.description}</span>}
          </div>
        </div>
        <Verdict facts={facts} ack={ack} onAck={setAck} />
        {!refused && (
          <>
            <div>
              <span className="label" style={{ display: 'block', marginBottom: 4 }}>
                ce qu’il pourra faire
              </span>
              <div className="can">
                <Can mark={MARKS.net} what="se connecter à">
                  {facts.hosts.length ? (
                    facts.hosts.map((h) => (
                      <span key={h} className="host-chip">
                        {h}
                      </span>
                    ))
                  ) : (
                    <span className="dim">aucun site</span>
                  )}
                </Can>
                {/* Every service knows the commune of the user's address (never the address itself): always said. */}
                <Can mark={MARKS.place} what="connaître">
                  la commune de votre adresse <span className="small dim">(pas votre adresse elle-même)</span>
                </Can>
                {facts.links.length > 0 && (
                  <Can mark={MARKS.net} what="ouvrir dans votre navigateur">
                    {facts.links.map((l) => (
                      <span key={l} className="host-chip">
                        {l}
                      </span>
                    ))}{' '}
                    <span className="small dim">: chaque fois, Marianne vous le demande</span>
                  </Can>
                )}
                {facts.sync && (
                  <Can mark={MARKS.data} what="garder des données">
                    ses données publiques, mises à jour régulièrement <span className="small dim">(sur cet ordinateur)</span>
                  </Can>
                )}
                <Can mark={MARKS.tool} what="outils pour Marianne">
                  {facts.tools.length ? (
                    <>
                      {facts.tools.map((t) => `« ${t} »`).join(', ')}{' '}
                      <span className="small dim">
                        : Marianne peut s’en servir dans vos dossiers,{' '}
                        {facts.verdict === 'official' || facts.verdict === 'validated'
                          ? 'et leur envoie alors ce qu’il faut'
                          : 'et vous demande votre accord avant chaque envoi'}
                      </span>
                    </>
                  ) : (
                    <span className="dim">aucun</span>
                  )}
                </Can>
                <Can mark={MARKS.person} what="votre profil">
                  {facts.reads.length ? (
                    <>
                      {facts.reads.join(', ')} <span className="small dim">: il vous le demandera d’abord</span>
                    </>
                  ) : (
                    <span className="dim">rien</span>
                  )}
                </Can>
              </div>
            </div>
            <div className="never">
              <span className="hi">Il ne pourra jamais</span>, de lui-même, voir vos dossiers, vos documents ou vos identifiants · se connecter à un autre site
              · payer, signer ou remplir un formulaire sans vous.
            </div>
          </>
        )}
        {error && <p className="small bad">{error}</p>}
      </div>
      <div className="foot">
        <button className="btn" onClick={onClose}>
          {refused ? 'fermer' : 'annuler'}
        </button>
        {!refused && (
          <button className="btn primary" disabled={!allowed || busy} aria-busy={busy} onClick={add}>
            {busy && <Spinner />}
            ajouter 3615 {code}
          </button>
        )}
      </div>
    </Modal>
  )
}
