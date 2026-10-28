import { ageOf, daysUntil, formatAddress, frDate, fullName, mask, today } from '@shared/dossier'
import { DOMAINS, ENTITY_LABELS } from '@shared/domains'
import { serviceReady } from '@shared/setup'
import { Card, DeadlineRow, KV } from '../../components/blocks'
import { Mosaic, mosaicText, tricolor } from '../../components/mosaic'
import { Action } from '../../components/ui'
import { useApp } from '../context'

const LOGO = [...mosaicText('MARIANNE', 'W'), '', ...tricolor(mosaicText('MARIANNE')[0].length, 2)]

const FAMILY: Record<string, string> = {
  celibataire: 'célibataire',
  marie: 'marié(e)',
  pacse: 'pacsé(e)',
  concubinage: 'en concubinage',
  divorce: 'divorcé(e)',
  veuf: 'veuf ou veuve'
}

/** The first steps, until the user marks them done. */
function FirstSteps() {
  const { dossier, apply, go, agent } = useApp()
  const steps = [
    {
      done: !!(dossier.person.nomNaissance || dossier.person.nomUsage),
      label: 'votre identité',
      route: 'dossier#identite',
      hint: 'nom, prénoms, naissance, numéro de sécurité sociale'
    },
    { done: !!dossier.address.codeInsee, label: 'votre adresse', route: 'dossier#adresse', hint: 'services locaux, député, règles de votre commune' },
    {
      done: dossier.household.length > 0 || !!dossier.person.situationFamiliale,
      label: 'votre foyer',
      route: 'dossier#foyer',
      hint: 'facultatif : utile pour les impôts et les aides'
    },
    {
      done: dossier.accounts.length > 0,
      label: 'les services que vous utilisez',
      route: 'domaine/impots',
      hint: 'seulement ceux qui vous intéressent : impôts, caf, ameli…'
    },
    { done: !!agent?.loggedIn, label: 'l’assistant', route: 'reglages/agent', hint: 'claude code ou codex, avec votre propre compte' },
    { done: false, label: 'une sauvegarde chiffrée', route: 'reglages/backup', hint: 'pour ne rien perdre si vous changez d’ordinateur' }
  ]
  return (
    <Card title="premiers pas" color="jaune" actions={<Action onClick={() => void apply({ type: 'onboarded', value: true })}>masquer</Action>}>
      <p className="dim" style={{ marginBottom: 6 }}>
        Renseignez ce qui vous concerne, rien de plus : le reste peut rester vide. Tout reste sur cet ordinateur, chiffré.
      </p>
      {steps.map((s) => (
        <button key={s.label} className="step" onClick={() => go(s.route)} title={s.hint}>
          <span className={s.done ? 'acc' : 'muted'}>[{s.done ? 'x' : ' '}]</span>
          <span className={s.done ? 'dim' : 'hi'}>{s.label}</span>
          <span className="dim">{s.hint}</span>
        </button>
      ))}
    </Card>
  )
}

export function Moi() {
  const { dossier, deadlines, go, services, ask } = useApp()
  const p = dossier.person
  const named = !!(p.nomNaissance || p.nomUsage)
  const age = ageOf(p.dateNaissance)
  const upcoming = deadlines.filter((d) => d.status === 'a_faire' && daysUntil(d.date) >= -30).slice(0, 8)

  return (
    <div className="page-inner wide">
      {!dossier.onboarded && (
        <div className="home-logo">
          <Mosaic rows={mosaicText('3615', 'C')} scale={0.55} title="3615" />
          <Mosaic rows={LOGO} scale={0.95} title="Marianne" />
          <p className="cyan">le service public, en clair</p>
        </div>
      )}
      {!dossier.onboarded && <FirstSteps />}

      <div className="cols">
        <div>
          <Card
            title={named ? fullName(p) : 'votre identité'}
            color="jaune"
            actions={<Action onClick={() => go('dossier')}>{named ? 'modifier' : 'compléter'}</Action>}
          >
            {named ? (
              <KV
                rows={[
                  [
                    'naissance',
                    [p.dateNaissance && `${frDate(p.dateNaissance)}${age !== null ? ` (${age} ans)` : ''}`, p.communeNaissance].filter(Boolean).join(' · ')
                  ],
                  ['n° de sécu', p.nir ? mask(p.nir) : ''],
                  ['adresse', formatAddress(dossier.address)],
                  [
                    'situation',
                    [
                      FAMILY[p.situationFamiliale],
                      dossier.household.map((m) => `${m.prenom}${m.dateNaissance ? `, ${ageOf(m.dateNaissance)} ans` : ''}`).join(' · ')
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  ]
                ]}
              />
            ) : (
              <p className="dim">Votre dossier est vide. Commencez par votre identité et votre adresse.</p>
            )}
          </Card>

          <Card title="à faire" color="cyan" actions={<Action onClick={() => go('agenda')}>agenda</Action>}>
            {upcoming.length ? (
              upcoming.map((d) => <DeadlineRow key={d.key} d={d} />)
            ) : (
              <p className="dim">Aucune échéance. Elles apparaissent quand vous renseignez vos pièces d’identité, entreprises, véhicules et logements.</p>
            )}
          </Card>
        </div>

        <div>
          <Card title="entités liées" color="magenta" actions={<Action onClick={() => go('entites')}>gérer</Action>}>
            <KV
              rows={(['entreprises', 'employeurs', 'vehicules', 'logements'] as const).map((k) => [
                ENTITY_LABELS[k].label,
                dossier[k].length ? (
                  <button className="link" onClick={() => go(`entites#${k}`)}>
                    {dossier[k]
                      .map((e) =>
                        'denomination' in e ? e.denomination : 'nom' in e ? e.nom : 'immatriculation' in e ? e.modele || e.immatriculation : e.adresse
                      )
                      .filter(Boolean)
                      .join(' · ') || dossier[k].length}
                  </button>
                ) : (
                  ''
                )
              ])}
            />
          </Card>

          <Card title="vos domaines" color="bleu">
            <div className="domain-grid">
              {DOMAINS.map((d) => {
                const own = services.filter((s) => s.domain === d.id && (s.fields?.length || s.needsNir))
                const ready = own.filter((s) => serviceReady(dossier, s)).length
                const next = deadlines.find((x) => x.domain === d.id && x.status === 'a_faire' && daysUntil(x.date) >= 0)
                return (
                  <button key={d.id} className={`domain-tile c-${d.color}`} onClick={() => go(`domaine/${d.id}`)}>
                    <span className="num">{d.num}</span>
                    <span className="name">{d.short}</span>
                    <span className="dim">{own.length ? `${ready}/${own.length} compte${own.length > 1 ? 's' : ''}` : ''}</span>
                    {next && <span className="next">{frDate(next.date).slice(0, 5)}</span>}
                  </button>
                )
              })}
            </div>
          </Card>

          {dossier.journal.length > 0 && (
            <Card title="activité récente">
              {dossier.journal.slice(0, 5).map((j) => (
                <p key={j.id} className="journal-line">
                  <span className="dim">{frDate(today(new Date(j.at)))}</span> {j.text}
                </p>
              ))}
            </Card>
          )}

          <Card title="demander à marianne">
            <div className="starters">
              {[
                'Fais le point sur mes échéances et ce que je dois faire ce mois-ci.',
                'Quelles aides et quels droits puis-je demander dans ma situation ?',
                'Qu’est-ce qui manque dans mon dossier pour que tu m’aides au mieux ?'
              ].map((s) => (
                <button key={s} className="starter" onClick={() => ask({ text: s, send: true, fresh: true })}>
                  › {s}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
