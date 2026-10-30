import { useState } from 'react'
import { THEMES, type ProfileField, type ServiceState } from '@marianne/sdk'
import type { Opinions } from '@marianne/profile'
import type { ParliamentGroup } from '@shared/api'
import { useApp } from '../app/context'
import { GearIcon, SearchIcon } from '../components/icons'
import { useServices } from '../host'
import { api, errorText } from '../lib/api'
import { useParliamentGroups } from '../lib/content'
import { useProfile } from '../lib/profile'
import { ASK_LABELS, OPINION_FIELDS, readSummary } from './readers'
import { SourcesSection } from './sources'

/**
 * What the user may say of their opinions, and who may read it: an optional leaning (real groups
 * of both chambers, never inferred), themes, the news sources they read, and for each service that
 * asks, accepter or refuser (the gear to choose among what it asked for). Engines never receive
 * any of them.
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

export function OpinionsSection() {
  const profile = useProfile()
  const groups = useParliamentGroups()
  const [error, setError] = useState('')
  const [choosing, setChoosing] = useState(false)
  const [senateOpen, setSenateOpen] = useState(false)
  if (!profile) return null
  const { leaning, themes } = profile.opinions
  const save = (change: Partial<Opinions>) =>
    void api
      .updateProfile({ type: 'opinions', opinions: { ...profile.opinions, ...change } })
      .then(() => setError(''))
      .catch((err) => setError(errorText(err)))
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
  const toggleTheme = (id: string) => save({ themes: themes.includes(id) ? themes.filter((t) => t !== id) : [...themes, id] })

  return (
    <>
      <span className="label sub">sensibilité politique · facultatif</span>
      <div className="space opinions">
        <span>
          Si vous le souhaitez, indiquez les groupes dont vous vous sentez proche. Marianne s’en sert seulement pour <span className="hi">comparer</span> («
          votre députée a voté comme vos idées ») : elle ne trie, ne cache et ne recommande rien.
        </span>
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
              les groupes de l’Assemblée, sous leur vrai nom · plusieurs choix possibles · au Sénat, l’équivalent est proposé :{' '}
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
        <span className="small muted">
          Donnée sensible (RGPD, article 9) : chiffrée dans votre archive, jamais déduite de vos dossiers ou de vos lectures, effaçable à tout moment.
        </span>
      </div>
      <span className="label sub">thèmes qui comptent pour vous · facultatif</span>
      <div className="space opinions">
        <div className="chips left">
          {THEMES.map((t) => (
            <button key={t.id} className={`chip${themes.includes(t.id) ? ' on' : ''}`} onClick={() => toggleTheme(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <span className="small dim">sans rien dire d’une opinion : font remonter les scrutins, vidéos et actualités de ces thèmes</span>
      </div>
      <SourcesSection stored={profile.opinions.sources} address={profile.address} onChange={(sources) => save({ sources })} />
      <Readers declared={declared} />
      {error && <p className="bad small">{error}</p>}
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

/** "qui peut les lire": the services that ask for the opinions, accepted or refused, one by one. */
function Readers({ declared }: { declared: boolean }) {
  const services = useServices()
  const { openRoute } = useApp()
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const asking = services.filter((s) => s.access.asked.some((f) => OPINION_FIELDS.includes(f)))
  const others = services.filter((s) => !asking.includes(s))
  const q = query.trim().toLowerCase()
  const shown = asking.filter((s) => !q || `${s.manifest.id} ${s.manifest.name} ${s.manifest.description}`.toLowerCase().includes(q))
  const grant = (s: ServiceState, fields: ProfileField[]) => {
    const kept = (s.access.granted ?? []).filter((f) => !OPINION_FIELDS.includes(f))
    void api.setServiceAccess(s.manifest.id, [...kept, ...fields])
  }
  return (
    <>
      <span className="label sub">qui peut les lire</span>
      <div className="note">Les moteurs ne reçoivent jamais votre sensibilité, vos thèmes ni vos sources.</div>
      <div className="perm-bar">
        {asking.length > 6 && (
          <label className="search-field framed">
            <SearchIcon />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="chercher un service" />
          </label>
        )}
        <span className="small dim">
          {asking.length} service{asking.length > 1 ? 's' : ''} · accepter donne ce que chacun a demandé ; ⚙ pour choisir
        </span>
      </div>
      <div className="perms">
        <div className="perm-row perm-head">
          <span>service</span>
          <span>il lit</span>
          <span />
        </div>
        {shown.map((s) => {
          const asked = s.access.asked.filter((f) => OPINION_FIELDS.includes(f))
          const granted = s.access.granted
          const sum = readSummary(asked, granted)
          const tunable = asked.length > 1
          // Never opened, and asking for other fields too: those are its own consent's, at its first opening.
          const pending = granted === null && s.access.asked.some((f) => !OPINION_FIELDS.includes(f))
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
                {pending ? (
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
                      <button className={granted !== null && !sum.on ? 'on' : ''} onClick={() => grant(s, [])}>
                        refuser
                      </button>
                    </span>
                    <button
                      className={`icon-btn${open === s.manifest.id ? ' accent' : ''}`}
                      disabled={!tunable}
                      onClick={() => setOpen(open === s.manifest.id ? null : s.manifest.id)}
                      title={tunable ? 'choisir ce qu’il peut lire' : `il ne demande que ${ASK_LABELS[asked[0]] ?? asked[0]}`}
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
                        {ASK_LABELS[f] ?? f}
                      </label>
                    )
                  })}
                  <span className="small muted">tout décocher revient à refuser</span>
                </div>
              )}
            </div>
          )
        })}
        {!shown.length && (
          <p className="small dim perm-empty">
            {asking.length ? 'Aucun service ne correspond.' : 'Aucun service ne demande votre sensibilité, vos thèmes ni vos sources.'}
          </p>
        )}
      </div>
      {others.length > 0 && (
        <p className="small dim">
          + {others.length} autre{others.length > 1 ? 's' : ''} service{others.length > 1 ? 's' : ''} ne demande{others.length > 1 ? 'nt' : ''} ni sensibilité,
          ni thèmes, ni sources (
          {others
            .slice(0, 4)
            .map((s) => s.manifest.name)
            .join(', ')}
          {others.length > 4 ? '…' : ''})
        </p>
      )}
      {!declared && <p className="small muted">Aucune sensibilité indiquée : les services n’ont rien à en lire, quoi qu’autorise le tableau.</p>}
    </>
  )
}
