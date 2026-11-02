import { useState } from 'react'
import { THEMES, type ProfileField, type ServiceState } from '@marianne/sdk'
import type { Opinions } from '@marianne/profile'
import type { ParliamentGroup } from '@shared/api'
import { useApp } from '../app/context'
import { GearIcon } from '../components/icons'
import { SearchField } from '../components/ui'
import { useServices } from '../host'
import { api, errorText } from '../lib/api'
import { useParliamentGroups } from '../lib/content'
import { useProfile } from '../lib/profile'
import { ListHead, ReadBy } from './parts'
import { accessReaders, ASK_LABELS, readSummary } from './readers'

/**
 * MES IDÉES and who may read them: an optional leaning (real groups of both chambers, never inferred),
 * themes, and, for each service that asks to read part of the profile, accepter or refuser (the gear to
 * choose among what it asked for). Engines never receive the opinions.
 */

/** A group: its colour as a block, its acronym. */
function GroupMark({ group }: { group: ParliamentGroup }) {
  return (
    <span className="lean-grp" title={group.name}>
      <i style={{ background: group.color }} />
      {group.acronym}
    </span>
  )
}

/** Only what changed: the rest stays as Marianne has it, even if this page hasn't seen it yet. */
function useOpinions() {
  const [error, setError] = useState('')
  const save = (change: Partial<Opinions>) =>
    void api
      .updateProfile({ type: 'opinions', opinions: change })
      .then(() => setError(''))
      .catch((err) => setError(errorText(err)))
  return { save, error }
}

/** Réglages › Sensibilité: the groups of the Assemblée the user feels close to, and their Sénat counterparts. */
export function LeaningPane() {
  const profile = useProfile()
  const groups = useParliamentGroups()
  const { save, error } = useOpinions()
  const [choosing, setChoosing] = useState(false)
  const [senateOpen, setSenateOpen] = useState(false)
  if (!profile) return null
  const { leaning } = profile.opinions
  const an = groups.filter((g) => g.chamber === 'an')
  const se = groups.filter((g) => g.chamber === 'se')
  const declared = leaning.assembly.length > 0 || leaning.senate.length > 0
  const counterpart = (acronym: string) => an.find((g) => g.acronym === acronym)?.senate

  // Picking an Assemblée group proposes its Sénat counterpart; leaving it takes the counterpart back, unless another choice still proposes it.
  const toggleAssembly = (acronym: string) => {
    const on = leaning.assembly.includes(acronym)
    const assembly = on ? leaning.assembly.filter((a) => a !== acronym) : [...leaning.assembly, acronym]
    const proposed = counterpart(acronym)
    let senate = leaning.senate
    if (proposed && !on && !senate.includes(proposed)) senate = [...senate, proposed]
    if (proposed && on && !assembly.some((a) => counterpart(a) === proposed)) senate = senate.filter((s) => s !== proposed)
    save({ leaning: { assembly, senate } })
  }
  const toggleSenate = (acronym: string) =>
    save({ leaning: { ...leaning, senate: leaning.senate.includes(acronym) ? leaning.senate.filter((s) => s !== acronym) : [...leaning.senate, acronym] } })

  return (
    <>
      <div className="space opinions">
        <label>
          <input
            type="radio"
            name="leaning"
            checked={!declared && !choosing}
            onChange={() => {
              setChoosing(false)
              setSenateOpen(false)
              if (declared) save({ leaning: { assembly: [], senate: [] } })
            }}
          />{' '}
          je préfère ne pas le dire <span className="small dim">(par défaut)</span>
        </label>
        <label>
          <input type="radio" name="leaning" checked={declared || choosing} onChange={() => setChoosing(true)} /> je me sens proche de :
        </label>
        {(declared || choosing) && (
          <>
            <div className="chips left lean-groups">
              {an.map((g) => (
                <button key={g.acronym} className={`chip${leaning.assembly.includes(g.acronym) ? ' on' : ''}`} onClick={() => toggleAssembly(g.acronym)}>
                  <GroupMark group={g} />
                </button>
              ))}
            </div>
            <span className="small dim lean-indent">
              au Sénat :{' '}
              {leaning.senate.length ? (
                leaning.senate.map((s) => {
                  const g = se.find((x) => x.acronym === s)
                  return g ? <GroupMark key={s} group={g} /> : <span key={s}>{s} </span>
                })
              ) : (
                <span className="muted">{leaning.assembly.length ? 'aucun groupe équivalent' : '—'}</span>
              )}{' '}
              <button className="link" onClick={() => setSenateOpen(!senateOpen)}>
                {senateOpen ? 'fermer' : 'changer'}
              </button>
            </span>
            {senateOpen && (
              <div className="chips left lean-groups">
                {se.map((g) => (
                  <button key={g.acronym} className={`chip${leaning.senate.includes(g.acronym) ? ' on' : ''}`} onClick={() => toggleSenate(g.acronym)}>
                    <GroupMark group={g} />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {error && <p className="bad small">{error}</p>}
      <ReadBy field="opinions.leaning" what={{ some: 'lue par', none: 'aucun service ne la lit' }} />
    </>
  )
}

/** Réglages › Thèmes: what matters to the user, without saying anything of an opinion. */
export function ThemesPane() {
  const profile = useProfile()
  const { save, error } = useOpinions()
  if (!profile) return null
  const { themes } = profile.opinions
  const toggle = (id: string) => save({ themes: themes.includes(id) ? themes.filter((t) => t !== id) : [...themes, id] })
  return (
    <>
      <div className="space opinions">
        <div className="chips left">
          {THEMES.map((t) => (
            <button key={t.id} className={`chip${themes.includes(t.id) ? ' on' : ''}`} onClick={() => toggle(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="bad small">{error}</p>}
      <ReadBy field="opinions.themes" what={{ some: 'lus par', none: 'aucun service ne les lit' }} />
    </>
  )
}

/** Today in Paris (YYYY-MM-DD), as the reads are kept. */
const parisDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/** "lu aujourd'hui", "lu hier", "lu il y a 3 jours", "lu le 2 oct.", "jamais lu". */
function readText(day: string | undefined): string {
  if (!day) return 'jamais lu'
  const days = Math.round((Date.parse(parisDay()) - Date.parse(day)) / 86_400_000)
  if (days <= 0) return 'lu aujourd’hui'
  if (days === 1) return 'lu hier'
  if (days < 7) return `lu il y a ${days} jours`
  return `lu le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))}`
}

/**
 * Réglages › Accès des services: each of the user's services that asks to read part of the profile, what
 * it reads, accepter or refuser, the gear to choose among what it asked for. The same choice as in the
 * service's own settings (its « réglages du service », on the Services page).
 */
export function AccessPane() {
  const services = useServices()
  const { openRoute } = useApp()
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const { asking, others } = accessReaders(services)
  const q = query.trim().toLowerCase()
  const shown = asking.filter((s) => !q || `${s.manifest.id} ${s.manifest.name} ${s.manifest.description}`.toLowerCase().includes(q))
  const grant = (s: ServiceState, fields: ProfileField[]) => void api.setServiceAccess(s.manifest.id, fields)
  return (
    <>
      <ListHead label="services qui lisent votre profil" count={asking.length}>
        {asking.length > 6 && <SearchField className="framed" value={query} onChange={setQuery} placeholder="chercher un service" />}
      </ListHead>
      {asking.length > 0 && (
        <div className="perms">
          <div className="perm-row perm-head">
            <span>service</span>
            <span>il lit</span>
            <span />
          </div>
          {shown.map((s) => {
            const asked = s.access.asked
            const granted = s.access.granted
            const sum = readSummary(asked, granted)
            const code = s.manifest.id.toUpperCase()
            const purpose = s.manifest.permissions.purpose
            return (
              <div key={s.manifest.id}>
                <div className={`perm-row${sum.on ? '' : ' off'}`}>
                  <span className="perm-stack">
                    <span className="perm-name">
                      <span className="hi">{code}</span>
                      <span
                        className={`origin${s.builtIn ? '' : ' community'}`}
                        title={s.builtIn ? 'livré avec Marianne' : 'publié par la communauté, pas par Marianne'}
                      >
                        {s.builtIn ? 'intégré' : 'communauté'}
                      </span>
                    </span>
                    <span className="small dim perm-ell" title={purpose}>
                      {s.manifest.name}
                      {purpose ? ` · ${purpose}` : ''}
                    </span>
                  </span>
                  <span className="perm-stack small">
                    <span className={sum.on ? '' : 'muted'}>{sum.text}</span>
                    <span className="muted">{sum.on ? readText(s.access.readAt) : ''}</span>
                  </span>
                  {granted === null ? (
                    // Never opened: what it asks is its own consent's, at its first opening.
                    <span className="perm-acts small dim">
                      à sa première ouverture ·{' '}
                      <button className="link" onClick={() => openRoute(`service:${s.manifest.id}`)}>
                        l’ouvrir
                      </button>
                    </span>
                  ) : (
                    <span className="perm-acts">
                      <span className="perm-seg">
                        <button className={sum.on ? 'on' : ''} onClick={() => grant(s, asked)}>
                          accepter
                        </button>
                        <button className={!sum.on ? 'on' : ''} onClick={() => grant(s, [])}>
                          refuser
                        </button>
                      </span>
                      <button
                        className={`icon-btn${open === s.manifest.id ? ' accent' : ''}`}
                        disabled={asked.length < 2}
                        onClick={() => setOpen(open === s.manifest.id ? null : s.manifest.id)}
                        title={asked.length > 1 ? 'choisir ce qu’il peut lire' : `il ne demande que ${ASK_LABELS[asked[0]]}`}
                      >
                        <GearIcon />
                      </button>
                    </span>
                  )}
                </div>
                {open === s.manifest.id && (
                  <div className="perm-cfg">
                    <span className="small dim">{code} peut lire :</span>
                    {asked.map((f) => {
                      const on = !!granted?.includes(f)
                      return (
                        <label key={f}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              grant(s, on ? asked.filter((x) => x !== f && granted?.includes(x)) : [...asked.filter((x) => granted?.includes(x)), f])
                            }
                          />{' '}
                          {ASK_LABELS[f]}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {!shown.length && <p className="small dim perm-empty">Aucun service ne correspond.</p>}
        </div>
      )}
      {!asking.length && <p className="small dim empty">aucun de vos services ne demande à lire votre profil</p>}
      {others.length > 0 && (
        <p className="small dim list-foot">
          + {others.length} autre{others.length > 1 ? 's' : ''} service{others.length > 1 ? 's' : ''} ne li{others.length > 1 ? 'sent' : 't'} que la commune de
          votre adresse (
          {others
            .slice(0, 4)
            .map((s) => s.manifest.name)
            .join(', ')}
          {others.length > 4 ? '…' : ''})
        </p>
      )}
    </>
  )
}
