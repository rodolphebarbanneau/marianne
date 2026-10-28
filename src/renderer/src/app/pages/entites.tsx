import { useEffect, useState, type ReactNode } from 'react'
import { frDate, monthDay, newKey, sirenValid, type Company, type Employer, type EntityKind, type Property, type Vehicle } from '@shared/dossier'
import { ENTITY_LABELS } from '@shared/domains'
import { AddressSearch } from '../../components/address'
import { Card, PageHead } from '../../components/blocks'
import { Field, FormGrid, Input, Select, useDraft } from '../../components/form'
import { Action, Spinner } from '../../components/ui'
import { useAnchor, useApp } from '../context'
import { ipcError } from '../hooks'

const api = window.marianne

const KINDS: EntityKind[] = ['entreprises', 'employeurs', 'vehicules', 'logements']

const REGIMES: Array<{ value: Company['regime']; label: string }> = [
  { value: 'micro', label: 'micro-entreprise' },
  { value: 'ei_reel', label: 'entreprise individuelle au réel' },
  { value: 'societe_is', label: 'société à l’impôt sur les sociétés' },
  { value: 'societe_ir', label: 'société à l’impôt sur le revenu' },
  { value: 'association', label: 'association' }
]

function Actions({ onCancel, onSave, disabled }: { onCancel: () => void; onSave: () => void; disabled?: boolean }) {
  return (
    <p className="line">
      <Action onClick={onCancel}>annuler</Action>{' '}
      <Action onClick={onSave} disabled={disabled}>
        enregistrer
      </Action>
    </p>
  )
}

function CompanyEditor({ item, onDone }: { item: Company; onDone: () => void }) {
  const { apply } = useApp()
  const [c, set] = useDraft(item)
  const [looking, setLooking] = useState(false)
  const [note, setNote] = useState('')
  const siren = c.siren.replace(/\s+/g, '')
  const society = c.regime === 'societe_is' || c.regime === 'societe_ir'
  const yearEnd = monthDay(c.cloture || '12-31')
  const valid = sirenValid(siren)
  const lookup = () => {
    setLooking(true)
    setNote('')
    void api
      .lookupSiren(siren)
      .then((r) => {
        if (!r) return setNote('aucune entreprise publique avec ce siren')
        set({
          denomination: r.denomination,
          forme: r.forme,
          activite: r.activite,
          creation: r.creation,
          adresse: r.adresse,
          ...(r.association ? { regime: 'association' as const } : r.individual ? { regime: 'micro' as const, role: 'entrepreneur' as const } : {})
        })
        setNote('complété depuis l’annuaire des entreprises : vérifiez le régime et la périodicité')
      })
      .catch((e: Error) => setNote(ipcError(e)))
      .finally(() => setLooking(false))
  }
  return (
    <div className="editor">
      <FormGrid>
        <Field label="siren" error={siren && !valid ? '9 chiffres, clé de contrôle invalide' : ''} hint={note || 'sur votre extrait kbis ou avis de situation'}>
          <span className="inline">
            <Input value={c.siren} onChange={(v) => set({ siren: v })} mono autoFocus />
            {looking ? (
              <Spinner />
            ) : (
              <Action onClick={lookup} disabled={!valid}>
                compléter
              </Action>
            )}
          </span>
        </Field>
        <Field label="nom">
          <Input value={c.denomination} onChange={(denomination) => set({ denomination })} />
        </Field>
        <Field label="régime">
          <Select<Company['regime']> value={c.regime} onChange={(regime) => set({ regime })} options={REGIMES} />
        </Field>
        <Field label="votre rôle">
          <Select<Company['role']>
            value={c.role}
            onChange={(role) => set({ role })}
            options={[
              { value: 'dirigeant', label: 'dirigeant' },
              { value: 'associe', label: 'associé' },
              { value: 'entrepreneur', label: 'entrepreneur individuel' },
              { value: 'autre', label: 'autre' }
            ]}
          />
        </Field>
        {c.regime === 'micro' && (
          <Field label="déclarations urssaf" hint="les échéances en découlent">
            <Select<Company['periodicite']>
              value={c.periodicite}
              onChange={(periodicite) => set({ periodicite })}
              options={[
                { value: '', label: 'non renseignée' },
                { value: 'mensuelle', label: 'mensuelles' },
                { value: 'trimestrielle', label: 'trimestrielles' }
              ]}
            />
          </Field>
        )}
        <Field label="tva">
          <Select<Company['tva']>
            value={c.tva}
            onChange={(tva) => set({ tva })}
            options={[
              { value: '', label: 'non renseignée' },
              { value: 'franchise', label: 'franchise en base' },
              { value: 'reel_simplifie', label: 'réel simplifié' },
              { value: 'reel_normal', label: 'réel normal' }
            ]}
          />
        </Field>
        {(c.regime === 'societe_is' || c.regime === 'societe_ir') && (
          <Field label="clôture de l’exercice" hint={yearEnd ? 'mois-jour : 12-31 pour le 31 décembre' : 'date invalide : mois-jour, ex. 12-31 ou 06-30'}>
            <Input value={c.cloture} onChange={(cloture) => set({ cloture })} mono placeholder="12-31" />
          </Field>
        )}
        <Field label="forme">
          <Input value={c.forme} onChange={(forme) => set({ forme })} />
        </Field>
        <Field label="activité">
          <Input value={c.activite} onChange={(activite) => set({ activite })} />
        </Field>
        <Field label="création">
          <Input type="date" value={c.creation} onChange={(creation) => set({ creation })} />
        </Field>
        <Field label="adresse du siège" wide>
          <Input value={c.adresse} onChange={(adresse) => set({ adresse })} />
        </Field>
      </FormGrid>
      <Actions
        onCancel={onDone}
        onSave={() => {
          // Stored as MM-DD whatever was typed ("31/12" → "12-31").
          const cloture = yearEnd ? `${String(yearEnd[0]).padStart(2, '0')}-${String(yearEnd[1]).padStart(2, '0')}` : '12-31'
          void apply({ type: 'entity', kind: 'entreprises', item: { ...c, cloture } }).then(onDone)
        }}
        disabled={!valid || (society && !yearEnd)}
      />
    </div>
  )
}

function EmployerEditor({ item, onDone }: { item: Employer; onDone: () => void }) {
  const { apply } = useApp()
  const [e, set] = useDraft(item)
  return (
    <div className="editor">
      <FormGrid>
        <Field label="employeur">
          <Input value={e.nom} onChange={(nom) => set({ nom })} autoFocus />
        </Field>
        <Field label="siren" hint="facultatif">
          <Input value={e.siren} onChange={(siren) => set({ siren })} mono />
        </Field>
        <Field label="poste">
          <Input value={e.poste} onChange={(poste) => set({ poste })} />
        </Field>
        <Field label="contrat">
          <Select<Employer['contrat']>
            value={e.contrat}
            onChange={(contrat) => set({ contrat })}
            options={[
              { value: 'cdi', label: 'cdi' },
              { value: 'cdd', label: 'cdd' },
              { value: 'interim', label: 'intérim' },
              { value: 'apprentissage', label: 'apprentissage' },
              { value: 'fonction_publique', label: 'fonction publique' },
              { value: 'autre', label: 'autre' }
            ]}
          />
        </Field>
        <Field label="début">
          <Input type="date" value={e.debut} onChange={(debut) => set({ debut })} />
        </Field>
        <Field label="fin" hint="vide si en cours">
          <Input type="date" value={e.fin} onChange={(fin) => set({ fin })} />
        </Field>
        <Field label="convention collective (idcc)" hint="numéro à 4 chiffres sur la fiche de paie">
          <Input value={e.idcc} onChange={(idcc) => set({ idcc })} mono />
        </Field>
      </FormGrid>
      <Actions onCancel={onDone} onSave={() => void apply({ type: 'entity', kind: 'employeurs', item: e }).then(onDone)} disabled={!e.nom.trim()} />
    </div>
  )
}

function VehicleEditor({ item, onDone }: { item: Vehicle; onDone: () => void }) {
  const { apply } = useApp()
  const [v, set] = useDraft(item)
  return (
    <div className="editor">
      <FormGrid>
        <Field label="immatriculation">
          <Input value={v.immatriculation} onChange={(immatriculation) => set({ immatriculation })} mono autoFocus placeholder="AB-123-CD" />
        </Field>
        <Field label="modèle">
          <Input value={v.modele} onChange={(modele) => set({ modele })} />
        </Field>
        <Field label="1re immatriculation" hint="carte grise, case B">
          <Input type="date" value={v.premiereImmatriculation} onChange={(premiereImmatriculation) => set({ premiereImmatriculation })} />
        </Field>
        <Field label="dernier contrôle technique" hint="le prochain en découle">
          <Input type="date" value={v.dernierControle} onChange={(dernierControle) => set({ dernierControle })} />
        </Field>
        <Field label="crit’air">
          <Input value={v.critair} onChange={(critair) => set({ critair })} />
        </Field>
      </FormGrid>
      <Actions onCancel={onDone} onSave={() => void apply({ type: 'entity', kind: 'vehicules', item: v }).then(onDone)} disabled={!v.immatriculation.trim()} />
    </div>
  )
}

function PropertyEditor({ item, onDone }: { item: Property; onDone: () => void }) {
  const { apply, dossier } = useApp()
  const [l, set] = useDraft(item)
  const home = [dossier.address.rue, `${dossier.address.codePostal} ${dossier.address.commune}`].filter((x) => x.trim()).join(', ')
  return (
    <div className="editor">
      <AddressSearch onPick={(a) => set({ adresse: a.label, codeInsee: a.codeInsee })} />
      <FormGrid>
        <Field label="adresse" hint={home && !l.adresse ? undefined : ''}>
          <span className="inline">
            <Input value={l.adresse} onChange={(adresse) => set({ adresse })} />
            {home && !l.adresse && <Action onClick={() => set({ adresse: home, codeInsee: dossier.address.codeInsee })}>mon adresse</Action>}
          </span>
        </Field>
        <Field label="usage">
          <Select<Property['usage']>
            value={l.usage}
            onChange={(usage) => set({ usage })}
            options={[
              { value: 'residence_principale', label: 'résidence principale' },
              { value: 'residence_secondaire', label: 'résidence secondaire' },
              { value: 'locatif', label: 'mis en location' }
            ]}
          />
        </Field>
        <Field label="statut">
          <Select<Property['statut']>
            value={l.statut}
            onChange={(statut) => set({ statut })}
            options={[
              { value: 'locataire', label: 'locataire' },
              { value: 'proprietaire', label: 'propriétaire' },
              { value: 'heberge', label: 'hébergé' }
            ]}
          />
        </Field>
        {l.statut === 'locataire' && (
          <>
            <Field label="loyer hors charges (€)">
              <Input value={l.loyer} onChange={(loyer) => set({ loyer })} mono />
            </Field>
            <Field label="début du bail">
              <Input type="date" value={l.debutBail} onChange={(debutBail) => set({ debutBail })} />
            </Field>
            <Field label="bailleur">
              <Input value={l.bailleur} onChange={(bailleur) => set({ bailleur })} />
            </Field>
          </>
        )}
      </FormGrid>
      <Actions onCancel={onDone} onSave={() => void apply({ type: 'entity', kind: 'logements', item: l }).then(onDone)} disabled={!l.adresse.trim()} />
    </div>
  )
}

const EMPTY: { [K in EntityKind]: () => object } = {
  entreprises: (): Company => ({
    id: newKey(),
    siren: '',
    denomination: '',
    forme: '',
    activite: '',
    creation: '',
    adresse: '',
    role: 'dirigeant',
    regime: 'micro',
    periodicite: '',
    tva: '',
    cloture: '12-31'
  }),
  employeurs: (): Employer => ({ id: newKey(), nom: '', siren: '', poste: '', contrat: 'cdi', debut: '', fin: '', idcc: '' }),
  vehicules: (): Vehicle => ({ id: newKey(), immatriculation: '', modele: '', premiereImmatriculation: '', dernierControle: '', critair: '' }),
  logements: (): Property => ({
    id: newKey(),
    adresse: '',
    codeInsee: '',
    usage: 'residence_principale',
    statut: 'locataire',
    loyer: '',
    debutBail: '',
    bailleur: ''
  })
}

function summary(kind: EntityKind, e: object): ReactNode {
  switch (kind) {
    case 'entreprises': {
      const c = e as Company
      return (
        <>
          <span className="hi">{c.denomination || c.siren}</span>
          <span className="dim">
            {' '}
            · siren {c.siren} · {REGIMES.find((r) => r.value === c.regime)?.label}
            {c.periodicite && ` · déclarations ${c.periodicite}s`}
          </span>
        </>
      )
    }
    case 'employeurs': {
      const x = e as Employer
      return (
        <>
          <span className="hi">{x.nom}</span>
          <span className="dim">
            {' '}
            · {x.contrat}
            {x.poste && ` · ${x.poste}`}
            {x.debut && ` · depuis le ${frDate(x.debut)}`}
            {x.fin && ` jusqu’au ${frDate(x.fin)}`}
          </span>
        </>
      )
    }
    case 'vehicules': {
      const v = e as Vehicle
      return (
        <>
          <span className="hi">{v.modele || 'véhicule'}</span> <span className="dim">· {v.immatriculation}</span>
        </>
      )
    }
    case 'logements': {
      const l = e as Property
      return (
        <>
          <span className="hi">{l.adresse}</span>
          <span className="dim">
            {' '}
            · {l.statut}
            {l.loyer && ` · ${l.loyer} €`}
          </span>
        </>
      )
    }
  }
}

function editorFor(kind: EntityKind, item: object, onDone: () => void): ReactNode {
  if (kind === 'entreprises') return <CompanyEditor item={item as Company} onDone={onDone} />
  if (kind === 'employeurs') return <EmployerEditor item={item as Employer} onDone={onDone} />
  if (kind === 'vehicules') return <VehicleEditor item={item as Vehicle} onDone={onDone} />
  return <PropertyEditor item={item as Property} onDone={onDone} />
}

const INTRO: Record<EntityKind, string> = {
  entreprises: 'Vos entreprises : avec le régime et la périodicité, Marianne calcule vos déclarations urssaf, la CFE et les comptes annuels.',
  employeurs: 'Vos employeurs, actuels et passés : utiles pour les droits au chômage, la retraite et les questions de droit du travail.',
  vehicules: 'Vos véhicules : le prochain contrôle technique est calculé à partir des dates.',
  logements: 'Votre logement et vos biens : bail, loyer, et les obligations qui vont avec.'
}

export function Entites() {
  const { dossier, apply } = useApp()
  const anchor = useAnchor()
  const [kind, setKind] = useState<EntityKind>(KINDS.includes(anchor as EntityKind) ? (anchor as EntityKind) : 'entreprises')
  const [editing, setEditing] = useState<{ id: string; item: object } | null>(null)
  // A card or the agent may point to another tab while the page is open.
  useEffect(() => {
    if (KINDS.includes(anchor as EntityKind)) {
      setKind(anchor as EntityKind)
      setEditing(null)
    }
  }, [anchor])
  const list = dossier[kind] as Array<{ id: string }>
  return (
    <div className="page-inner">
      <PageHead
        code="3615 ENTITES"
        color="magenta"
        title="entités liées"
        description="Ce qui vous est rattaché : entreprises, employeurs, véhicules, logements."
      />
      <div className="tabs">
        {KINDS.map((k) => (
          <button
            key={k}
            className={k === kind ? 'on' : ''}
            onClick={() => {
              setKind(k)
              setEditing(null)
            }}
          >
            {ENTITY_LABELS[k].label} <span className="dim">{dossier[k].length || ''}</span>
          </button>
        ))}
      </div>
      <Card
        id={kind}
        title={ENTITY_LABELS[kind].label}
        color="magenta"
        actions={!editing && <Action onClick={() => setEditing({ id: '', item: EMPTY[kind]() })}>ajouter</Action>}
      >
        <p className="dim" style={{ marginBottom: 6 }}>
          {INTRO[kind]}
        </p>
        {list.map((e) =>
          editing?.id === e.id ? (
            <div key={e.id}>{editorFor(kind, editing.item, () => setEditing(null))}</div>
          ) : (
            <div key={e.id} className="item-row">
              <span>{summary(kind, e)}</span>
              <span>
                <Action onClick={() => setEditing({ id: e.id, item: e })}>modifier</Action>{' '}
                <Action danger onClick={() => void apply({ type: 'deleteEntity', kind, id: e.id })}>
                  retirer
                </Action>
              </span>
            </div>
          )
        )}
        {editing && editing.id === '' && editorFor(kind, editing.item, () => setEditing(null))}
      </Card>
    </div>
  )
}
