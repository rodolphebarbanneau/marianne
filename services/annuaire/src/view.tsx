import { useState, type FormEvent } from 'react'
import { Failure, formatNumber, Loading, Notice, Spinner, useCall, useHost, useNow, type Loaded } from '@marianne/sdk/view'
import { dayHours, daySlotsLabel, openAt } from './hours'
import type { AnnuaireMethods, NearbyOffices, OfficeAddress, OfficeQuery, OfficeResults, PublicOffice } from './types'
import './view.css'

/** 3615 ANNUAIRE: the usual offices near the user's commune, any office by kind, commune or name. */

/** Offices shown for a search; a kind near the user's commune shows fewer, the nearest. */
const LIMIT = 30
const NEAR_LIMIT = 10

interface Search {
  commune: string
  text: string
}

const services = (n: number) => `${formatNumber(n)} service${n > 1 ? 's' : ''}`
const addressText = (a: OfficeAddress) => [...a.lines, `${a.postalCode} ${a.city}`.trim()].filter(Boolean).join(', ')
const isWeb = (url: string) => /^https?:\/\//i.test(url)
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Offices by kind, in the order they come. */
function byKind(offices: PublicOffice[]): Array<{ label: string; offices: PublicOffice[] }> {
  const groups = new Map<string, PublicOffice[]>()
  for (const o of offices) {
    const label = o.kindLabel || 'Autres services'
    groups.set(label, [...(groups.get(label) ?? []), o])
  }
  return [...groups].map(([label, list]) => ({ label, offices: list }))
}

export function View() {
  const host = useHost<AnnuaireMethods>()
  const home = host.home
  // Whether an office is open changes with the time.
  const now = useNow()
  const kinds = useCall<AnnuaireMethods, 'kinds'>('kinds', [])
  const [kind, setKind] = useState<string | null>(null)
  const [draft, setDraft] = useState<Search>({ commune: '', text: '' })
  const [search, setSearch] = useState<Search | null>(null)

  const query: OfficeQuery | null = search
    ? { kind: kind ?? undefined, commune: search.commune || undefined, text: search.text || undefined, limit: LIMIT }
    : kind
      ? { kind, insee: home?.code, limit: home ? NEAR_LIMIT : LIMIT }
      : null
  const near = useCall<AnnuaireMethods, 'near'>('near', !search && !kind && home ? [home.code] : null)
  const found = useCall<AnnuaireMethods, 'search'>('search', query ? [query] : null)
  const kindLabel = kinds.data?.find((k) => k.id === kind)?.label
  const place = search ? (found.data?.place ?? search.commune) : (home?.name ?? '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = { commune: draft.commune.trim(), text: draft.text.trim() }
    setSearch(next.commune || next.text ? next : null)
  }
  const reset = () => {
    setDraft({ commune: '', text: '' })
    setSearch(null)
  }
  const ask = () =>
    host.ask(
      kindLabel
        ? `Quel service « ${kindLabel} » contacter${place ? ` près de ${place}` : ''}, et comment ?`
        : `Quel service public contacter${place ? ` près de ${place}` : ''} pour ma démarche ?`
    )

  return (
    <div className="annuaire">
      <div className="annuaire-body">
        {!home && (
          <Notice action={{ label: 'renseigner mon adresse', onClick: () => host.openRoute('settings/identity') }}>
            Renseignez votre adresse pour voir les services publics près de chez vous.
          </Notice>
        )}

        <form className="annuaire-search" onSubmit={submit}>
          <input
            value={draft.commune}
            onChange={(e) => setDraft({ ...draft, commune: e.target.value })}
            placeholder="une commune : nom ou code postal"
            aria-label="commune"
          />
          <input
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            placeholder="nom du service (facultatif)"
            aria-label="nom du service"
          />
          <button className="btn" type="submit">
            chercher
          </button>
          {search && (
            <button className="btn" type="button" onClick={reset}>
              {home ? `revenir à ${home.name}` : 'effacer'}
            </button>
          )}
          <button className="btn annuaire-ask" type="button" onClick={ask}>
            demander à Marianne
          </button>
        </form>

        <div className="annuaire-kinds">
          <button className={`chip${kind === null ? ' on' : ''}`} onClick={() => setKind(null)}>
            {search || !home ? 'tous' : 'l’essentiel'}
          </button>
          {kinds.data?.map((k) => (
            <button key={k.id} className={`chip${kind === k.id ? ' on' : ''}`} title={k.label} onClick={() => setKind(kind === k.id ? null : k.id)}>
              {k.short}
            </button>
          ))}
        </div>

        {query ? (
          <Results results={found.data} error={found.error} loading={found.loading} grouped={!kind} now={now} onRetry={found.reload} />
        ) : home ? (
          <Nearby state={near} place={home.name} now={now} />
        ) : (
          <p className="dim">Cherchez une commune, ou choisissez un type de service.</p>
        )}
      </div>
    </div>
  )
}

/** The usual offices near the user's commune; the kinds the directory didn't answer for are said apart from the ones it has none of. */
export function Nearby({ state, place, now }: { state: Loaded<NearbyOffices[]>; place: string; now: Date }) {
  if (state.error) return <Failure title="Annuaire indisponible" error={state.error} retry={state.reload} />
  if (!state.data) return <Loading label={`les services publics de ${place}`} />
  const unanswered = state.data.filter((g) => g.error)
  const empty = state.data.filter((g) => !g.offices.length && !g.error)
  return (
    <div className={`annuaire-results${state.loading ? ' annuaire-stale' : ''}`}>
      <span className="dim">Les services publics de {place} et les plus proches.</span>
      {state.data
        .filter((g) => g.offices.length)
        .map((g) => (
          <Group key={g.kind} label={g.label} offices={g.offices} now={now} />
        ))}
      {empty.length > 0 && <span className="small dim">Rien trouvé pour : {empty.map((g) => g.label).join(', ')}.</span>}
      {unanswered.length > 0 && (
        <Failure
          inline
          title={`L’annuaire n’a pas répondu pour ${unanswered.map((g) => g.label).join(', ')}`}
          error={[...new Set(unanswered.map((g) => g.error))].join(' · ')}
          retry={state.reload}
        />
      )}
    </div>
  )
}

interface ResultsProps {
  results: OfficeResults | null
  error: string
  loading: boolean
  grouped: boolean
  now: Date
  onRetry: () => void
}

function Results({ results, error, loading, grouped, now, onRetry }: ResultsProps) {
  if (error) return <Failure title="Recherche impossible" error={error} retry={onRetry} />
  if (!results) return <Loading label="les services publics" />
  const more = results.total > results.offices.length ? ` · les ${results.offices.length} premiers` : ''
  const head = !results.offices.length
    ? `Aucun service trouvé${results.place ? ` pour ${results.place}` : ''}.`
    : results.scope === 'commune'
      ? `${services(results.total)} à ${results.place}${more}`
      : results.scope === 'department'
        ? `Aucun à ${results.place} même : les plus proches dans le département.`
        : `${services(results.total)} en France${more}`
  return (
    <div className={`annuaire-results${loading ? ' annuaire-stale' : ''}`}>
      <span className="dim">
        {head} {loading && <Spinner />}
      </span>
      {grouped ? (
        byKind(results.offices).map((g) => <Group key={g.label} label={g.label} offices={g.offices} now={now} />)
      ) : (
        <div className="annuaire-offices">
          {results.offices.map((o) => (
            <OfficeCard key={o.id} office={o} now={now} />
          ))}
        </div>
      )}
    </div>
  )
}

function Group({ label, offices, now }: { label: string; offices: PublicOffice[]; now: Date }) {
  return (
    <section className="annuaire-group">
      <span className="annuaire-group-title">{label}</span>
      <div className="annuaire-offices">
        {offices.map((o) => (
          <OfficeCard key={o.id} office={o} now={now} />
        ))}
      </div>
    </section>
  )
}

function OfficeCard({ office, now }: { office: PublicOffice; now: Date }) {
  const host = useHost<AnnuaireMethods>()
  const [allHours, setAllHours] = useState(false)
  const visit = office.addresses.find((a) => !a.postal) ?? office.addresses[0]
  const postal = office.addresses.find((a) => a.postal && (!visit || addressText(a) !== addressText(visit)))
  const today = dayHours(office.hours, now)
  const open = today !== null && openAt(office.hours, now)
  const websites = office.websites.filter(isWeb)

  return (
    <div className="card annuaire-office">
      <span className="t">{office.name}</span>
      <span className="small dim">
        {office.kindLabel}
        {office.distance !== undefined && ` · ${formatNumber(office.distance, 1)} km`}
      </span>
      {visit && <span className="small">{addressText(visit)}</span>}
      <span className="small">
        {today === null ? (
          <span className="dim">horaires non communiqués</span>
        ) : (
          <>
            <span className={open ? 'ok' : 'bad'}>{open ? '● ouvert' : '○ fermé'}</span> · aujourd’hui {today.length ? daySlotsLabel(today) : 'fermé'}
          </>
        )}
      </span>
      {office.hoursNote && <span className="small dim">{office.hoursNote}</span>}
      {allHours && (
        <span className="annuaire-hours small">
          {office.hours.map((p) => (
            <span key={p.label}>
              {p.label}
              {p.note && <span className="dim"> · {p.note}</span>}
            </span>
          ))}
          {postal && <span className="dim">courrier : {addressText(postal)}</span>}
        </span>
      )}
      {office.phones.map((p) => (
        <span key={p.number} className="small">
          ☎{' '}
          <button className="link" onClick={() => host.copy(p.number, 'numéro copié')} title="copier">
            {p.number}
          </button>
          {p.note && <span className="dim"> · {p.note}</span>}
        </span>
      ))}
      {office.emails.map((m) => (
        <span key={m} className="small">
          ✉{' '}
          <button className="link" onClick={() => host.copy(m, 'adresse copiée')} title="copier">
            {m}
          </button>
        </span>
      ))}
      <span className="annuaire-links small">
        {(office.hours.length > 0 || postal) && (
          <button className="link" onClick={() => setAllHours(!allHours)}>
            {allHours ? 'moins' : 'tous les horaires'}
          </button>
        )}
        {websites.map((url) => (
          <button key={url} className="link" onClick={() => host.openUrl(url)}>
            {hostOf(url)} ↗
          </button>
        ))}
        {office.contactForm && isWeb(office.contactForm) && (
          <button className="link" onClick={() => host.openUrl(office.contactForm!)}>
            formulaire de contact ↗
          </button>
        )}
        {isWeb(office.url) && (
          <button className="link" onClick={() => host.openUrl(office.url)}>
            fiche officielle ↗
          </button>
        )}
      </span>
    </div>
  )
}
