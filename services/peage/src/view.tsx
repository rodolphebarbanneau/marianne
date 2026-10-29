import { useEffect, useRef, useState } from 'react'
import { errorText, Failure, Field, Loading, Notice, useCall, useHost, useNow } from '@marianne/sdk/view'
import { hostOf } from './networks'
import { dueOf, leftText, paid, unpaid } from './schedule'
import { fromParisInput, parisInput, when } from './time'
import type { PeageMethods, TollNetwork, Trip, Vehicle } from './types'
import './view.css'

/**
 * 3615 PEAGE's screen: the trips left to pay with the time left and the ways to pay, a form to
 * record one, the trips paid lately, and the free-flow sections with their official pages.
 * Paying never happens here: the official site opens in the system's browser, or Marianne opens
 * it in hers and the user approves the payment on a card.
 */

const PAID_SHOWN = 10
const URGENT_MS = 24 * 3600_000

const plateOf = (vehicles: Vehicle[], id: string) => vehicles.find((v) => v.id === id)?.plate || ''

export function View() {
  const host = useHost<PeageMethods>()
  // What is left to pay changes by the minute.
  const now = useNow(30_000)
  const networks = useCall<PeageMethods, 'networks'>('networks', [])
  const vehicles = useCall<PeageMethods, 'vehicles'>('vehicles', [])
  const loaded = useCall<PeageMethods, 'trips'>('trips', [])
  // The trips as the last change left them; until then, as loaded.
  const [changed, setChanged] = useState<Trip[] | null>(null)
  const trips = changed ?? loaded.data
  const list = vehicles.data?.list ?? []
  const focus = typeof host.params.trip === 'string' ? host.params.trip : ''

  const change = (run: Promise<Trip[]>, done: string) =>
    run.then(
      (next) => {
        setChanged(next)
        host.toast(done)
      },
      (err: unknown) => host.toast(errorText(err))
    )

  const network = (id: string) => networks.data?.find((n) => n.id === id)
  const sites = [...new Set((networks.data ?? []).map((n) => hostOf(n.payUrl)))].join(', ')

  return (
    <div className="peage">
      <div className="peage-body">
        {vehicles.data && !vehicles.data.granted ? (
          <Notice action={{ label: 'autoriser dans les réglages', onClick: () => host.openRoute('settings/services') }}>
            3615 PEAGE n’a pas accès aux plaques de vos véhicules : il en a besoin pour noter vos trajets et vous rappeler les péages à payer.
          </Notice>
        ) : vehicles.data && !list.length ? (
          <Notice action={{ label: 'ajouter un véhicule', onClick: () => host.openRoute('settings/household') }}>
            Aucun véhicule dans votre profil : ajoutez celui avec lequel vous empruntez l’autoroute.
          </Notice>
        ) : null}

        {/* One wait for the page: the trips and the free-flow sections. */}
        {loaded.error || networks.error ? (
          <Failure
            title="Vos trajets sont indisponibles"
            error={loaded.error || networks.error}
            retry={() => {
              loaded.reload()
              networks.reload()
            }}
          />
        ) : !trips || !networks.data ? (
          <Loading label="vos trajets" />
        ) : (
          <>
            <section className="peage-section">
              <h3 className="label">À payer</h3>
              {unpaid(trips).length ? (
                <div className="rows">
                  {unpaid(trips).map((t) => (
                    <DueRow
                      key={t.id}
                      trip={t}
                      network={network(t.network)}
                      plate={plateOf(list, t.vehicleId)}
                      now={now}
                      focused={t.id === focus}
                      onPaid={() => void change(host.call('markPaid', t.id), 'trajet marqué payé')}
                      onRemove={() => void change(host.call('removeTrip', t.id), 'trajet supprimé')}
                    />
                  ))}
                </div>
              ) : (
                <p className="dim">Aucun trajet à payer.</p>
              )}
              <p className="small dim">
                Marianne ne connaît pas les montants, le site officiel les affiche à partir de la plaque. Si vous avez un badge de télépéage bien fixé au
                pare-brise, vous n’avez rien à noter : le passage est payé automatiquement.
              </p>
            </section>

            <div className="box-note peage-scam">
              <span className="hi">Faux SMS de péage.</span> Aucun lien de paiement officiel n’est envoyé par SMS. Ne payez jamais depuis un lien reçu par SMS
              ou par e-mail : tapez vous-même l’adresse du site officiel{sites ? ` (${sites})` : ''}. Transférez le SMS suspect au 33700, puis supprimez-le.
            </div>

            {list.length > 0 && (
              <AddTrip
                networks={networks.data}
                vehicles={list}
                onAdd={(trip) =>
                  host.call('addTrip', trip).then((next) => {
                    setChanged(next)
                    host.toast('trajet ajouté')
                  })
                }
              />
            )}

            {paid(trips).length > 0 && (
              <section className="peage-section">
                <h3 className="label">Payés</h3>
                <div className="rows">
                  {paid(trips)
                    .slice(0, PAID_SHOWN)
                    .map((t) => (
                      <div key={t.id} className="row peage-done">
                        <span className="peage-what">
                          <span>
                            <span className="plate">{plateOf(list, t.vehicleId) || '—'}</span> {network(t.network)?.name ?? t.network}
                          </span>
                          <span className="small dim">passage {when(new Date(t.at))}</span>
                        </span>
                        <span className="small dim">payé {when(new Date(t.paidAt!))}</span>
                        <span className="peage-acts">
                          <button className="btn small" onClick={() => void change(host.call('markUnpaid', t.id), 'trajet remis à payer')}>
                            annuler
                          </button>
                        </span>
                      </div>
                    ))}
                </div>
              </section>
            )}

            <section className="peage-section">
              <h3 className="label">Les autoroutes en flux libre</h3>
              <div className="peage-networks">
                {networks.data.map((n) => (
                  <NetworkCard key={n.id} network={n} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

/** A trip left to pay: when, how long is left, and the ways to pay it. */
function DueRow(props: { trip: Trip; network: TollNetwork | undefined; plate: string; now: Date; focused: boolean; onPaid: () => void; onRemove: () => void }) {
  const { trip, network, plate, now, focused } = props
  const host = useHost<PeageMethods>()
  const [confirming, setConfirming] = useState(false)
  const row = useRef<HTMLDivElement>(null)
  // Opened from a deadline or the dashboard: that trip, in view.
  useEffect(() => {
    if (focused) row.current?.scrollIntoView({ block: 'center' })
  }, [focused])
  const at = new Date(trip.at)
  const due = dueOf(trip)
  const urgent = !!due && due.getTime() - now.getTime() < URGENT_MS

  const withMarianne = () => {
    if (!network) return
    const vehicle = plate ? `véhicule immatriculé ${plate}` : 'mon véhicule'
    host.ask(
      `Aide-moi à payer mon péage en flux libre ${network.name} : passage ${when(at)}, ${vehicle}. ` +
        `Ouvre la page officielle de paiement de ${network.operator}, ${network.payUrl}, retrouve ce passage avec la plaque et montre-moi le montant avant que je valide le paiement.`
    )
  }

  return (
    <div className={`row peage-trip${focused ? ' peage-focus' : ''}`} ref={row}>
      <span className="peage-what">
        <span>
          <span className="plate">{plate || '—'}</span> <span className="hi">{network?.name ?? trip.network}</span>
          {network && <span className="dim small"> · {network.operator}</span>}
        </span>
        <span className="small dim">
          passage {when(at)}
          {due ? ` · à payer avant ${when(due)}` : ' · autoroute retirée du catalogue'}
        </span>
      </span>
      <span className={`peage-left${urgent ? ' urgent' : ''}`}>{due ? leftText(due, now) : ''}</span>
      <span className="peage-acts">
        {network && (
          <>
            <button className="btn small primary" onClick={() => host.openUrl(network.payUrl)} title={network.payUrl}>
              payer sur le site officiel
            </button>
            <button className="btn small" onClick={withMarianne}>
              payer avec Marianne
            </button>
          </>
        )}
        <button className="btn small" onClick={props.onPaid}>
          c’est payé
        </button>
        {confirming ? (
          <button className="btn small danger" onClick={props.onRemove} onBlur={() => setConfirming(false)} autoFocus>
            confirmer la suppression
          </button>
        ) : (
          <button className="link small" onClick={() => setConfirming(true)}>
            supprimer
          </button>
        )}
      </span>
    </div>
  )
}

/** Record a passage: the vehicle, the section, the date and time (now, by default), in Paris time. */
function AddTrip({
  networks,
  vehicles,
  onAdd
}: {
  networks: TollNetwork[]
  vehicles: Vehicle[]
  onAdd: (trip: Parameters<PeageMethods['addTrip']>[0]) => Promise<void>
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0].id)
  const [networkId, setNetworkId] = useState(networks[0]?.id ?? '')
  const [at, setAt] = useState(() => parisInput(new Date()))
  const [error, setError] = useState('')
  const chosen = networks.find((n) => n.id === networkId)
  // A vehicle removed from the profile meanwhile: back to the first one.
  const vehicle = vehicles.some((v) => v.id === vehicleId) ? vehicleId : vehicles[0].id

  const submit = () => {
    const moment = fromParisInput(at)
    if (!moment) return setError('Indiquez la date et l’heure du passage.')
    setError('')
    onAdd({ vehicleId: vehicle, network: networkId, at: moment.toISOString() }).then(
      () => setAt(parisInput(new Date())),
      (err: unknown) => setError(errorText(err))
    )
  }

  return (
    <section className="peage-section">
      <h3 className="label">Ajouter un trajet</h3>
      <div className="peage-add">
        <Field label="véhicule">
          <select value={vehicle} onChange={(e) => setVehicleId(e.target.value)}>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate || 'plaque non renseignée'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="autoroute" hint={chosen ? `vous avez ${chosen.deadlineHours} h après le passage pour payer · ${chosen.operator}` : undefined}>
          <select value={networkId} onChange={(e) => setNetworkId(e.target.value)}>
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="date du passage (heure de Paris)" error={error}>
          <input type="datetime-local" value={at} max={parisInput(new Date())} onChange={(e) => setAt(e.target.value)} />
        </Field>
        {/* An empty label, so the button lines up with the fields whatever their hint. */}
        <div className="field peage-submit">
          <span aria-hidden="true">&nbsp;</span>
          <button className="btn primary" onClick={submit}>
            ajouter
          </button>
        </div>
      </div>
    </section>
  )
}

/** A free-flow section: its official pages, the time to pay, the other ways to pay, what follows an unpaid toll. */
function NetworkCard({ network: n }: { network: TollNetwork }) {
  const host = useHost<PeageMethods>()
  return (
    <div className="card peage-network">
      <span className="t">{n.name}</span>
      <span className="l dim">
        {n.operator} · {n.deadlineHours} h après le passage pour payer
      </span>
      <span className="peage-acts left">
        <button className="btn small" onClick={() => host.openUrl(n.payUrl)} title={n.payUrl}>
          site de paiement
        </button>
        {n.accountUrl && (
          <button className="btn small" onClick={() => host.openUrl(n.accountUrl!)} title={n.accountUrl}>
            compte client
          </button>
        )}
      </span>
      <ul className="small">
        {n.channels.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <span className="small dim">{n.penalties}</span>
      <span className="foot">
        <span>{n.phone ? `service client ${n.phone}` : ''}</span>
        <span>vérifié le {n.checked.split('-').reverse().join('/')}</span>
      </span>
    </div>
  )
}
