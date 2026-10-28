import { useState } from 'react'
import {
  ageOf,
  formatNir,
  frDate,
  newKey,
  nirValid,
  type FamilyStatus,
  type HouseholdMember,
  type IdDocument,
  type Person,
  type PieceType,
  type WorkStatus
} from '@shared/dossier'
import { AddressSearch } from '../../components/address'
import { Card, PageHead } from '../../components/blocks'
import { Field, FormGrid, Input, Select, useDraft } from '../../components/form'
import { Action, Check, TextInput } from '../../components/ui'
import { useApp, useScrollToAnchor } from '../context'

const FAMILY: Array<{ value: FamilyStatus; label: string }> = [
  { value: '', label: 'non renseignée' },
  { value: 'celibataire', label: 'célibataire' },
  { value: 'marie', label: 'marié(e)' },
  { value: 'pacse', label: 'pacsé(e)' },
  { value: 'concubinage', label: 'en concubinage' },
  { value: 'divorce', label: 'divorcé(e)' },
  { value: 'veuf', label: 'veuf, veuve' }
]
const WORK: Array<{ value: WorkStatus; label: string }> = [
  { value: '', label: 'non renseignée' },
  { value: 'salarie', label: 'salarié(e) du privé' },
  { value: 'fonctionnaire', label: 'agent public' },
  { value: 'independant', label: 'indépendant(e)' },
  { value: 'demandeur_emploi', label: 'demandeur d’emploi' },
  { value: 'etudiant', label: 'étudiant(e)' },
  { value: 'retraite', label: 'retraité(e)' },
  { value: 'sans_activite', label: 'sans activité' }
]
export const PIECES: Array<{ value: PieceType; label: string }> = [
  { value: 'cni', label: 'carte d’identité' },
  { value: 'passeport', label: 'passeport' },
  { value: 'permis', label: 'permis de conduire' },
  { value: 'titre_sejour', label: 'titre de séjour' },
  { value: 'carte_vitale', label: 'carte vitale' }
]

function Identity() {
  const { dossier, apply } = useApp()
  const [p, set, dirty, reset] = useDraft<Person>(dossier.person)
  const nir = p.nir.replace(/\s+/g, '')
  const nirError = nir && !nirValid(nir) ? 'numéro ou clé invalide (15 caractères, clé de contrôle comprise)' : ''
  return (
    <Card
      id="identite"
      title="identité"
      color="jaune"
      actions={
        dirty && (
          <>
            <Action onClick={reset}>annuler</Action>
            <Action onClick={() => void apply({ type: 'person', patch: p })} disabled={!!nirError}>
              enregistrer
            </Action>
          </>
        )
      }
    >
      <FormGrid>
        <Field label="civilité">
          <Select<Person['civilite']>
            value={p.civilite}
            onChange={(civilite) => set({ civilite })}
            options={[
              { value: '', label: '—' },
              { value: 'Mme', label: 'Madame' },
              { value: 'M.', label: 'Monsieur' }
            ]}
          />
        </Field>
        <Field label="prénoms" hint="dans l’ordre de l’état civil">
          <Input value={p.prenoms} onChange={(prenoms) => set({ prenoms })} />
        </Field>
        <Field label="nom de naissance">
          <Input value={p.nomNaissance} onChange={(nomNaissance) => set({ nomNaissance })} />
        </Field>
        <Field label="nom d’usage" hint="si différent (nom marital…)">
          <Input value={p.nomUsage} onChange={(nomUsage) => set({ nomUsage })} />
        </Field>
        <Field label="date de naissance">
          <Input type="date" value={p.dateNaissance} onChange={(dateNaissance) => set({ dateNaissance })} />
        </Field>
        <Field label="commune de naissance">
          <Input value={p.communeNaissance} onChange={(communeNaissance) => set({ communeNaissance })} />
        </Field>
        <Field label="pays de naissance">
          <Input value={p.paysNaissance} onChange={(paysNaissance) => set({ paysNaissance })} />
        </Field>
        <Field label="nationalité">
          <Input value={p.nationalite} onChange={(nationalite) => set({ nationalite })} />
        </Field>
        <Field label="numéro de sécurité sociale" error={nirError} hint={nir && !nirError ? formatNir(nir) : 'sur votre carte vitale : 15 caractères'}>
          <Input value={p.nir} onChange={(v) => set({ nir: v })} mono placeholder="1 23 45 67 890 123 45" />
        </Field>
        <Field label="situation familiale">
          <Select<FamilyStatus> value={p.situationFamiliale} onChange={(situationFamiliale) => set({ situationFamiliale })} options={FAMILY} />
        </Field>
        <Field label="situation professionnelle">
          <Select<WorkStatus> value={p.situationPro} onChange={(situationPro) => set({ situationPro })} options={WORK} />
        </Field>
        <Field label="téléphone">
          <Input type="tel" value={p.telephone} onChange={(telephone) => set({ telephone })} mono />
        </Field>
        <Field label="courriel" wide>
          <Input type="email" value={p.email} onChange={(email) => set({ email })} mono />
        </Field>
      </FormGrid>
    </Card>
  )
}

function AddressCard() {
  const { dossier, apply } = useApp()
  const [a, set, dirty, reset] = useDraft(dossier.address)
  return (
    <Card
      id="adresse"
      title="adresse"
      color="cyan"
      actions={
        dirty && (
          <>
            <Action onClick={reset}>annuler</Action>
            <Action onClick={() => void apply({ type: 'address', address: a })}>enregistrer</Action>
          </>
        )
      }
    >
      <AddressSearch onPick={(s) => set({ rue: s.rue, codePostal: s.codePostal, commune: s.commune, codeInsee: s.codeInsee, lat: s.lat, lon: s.lon })} />
      <FormGrid>
        <Field label="numéro et rue">
          <Input value={a.rue} onChange={(rue) => set({ rue })} />
        </Field>
        <Field label="complément">
          <Input value={a.complement} onChange={(complement) => set({ complement })} placeholder="bâtiment, étage…" />
        </Field>
        <Field label="code postal">
          {/* Another commune: the insee code comes with a suggestion again. */}
          <Input value={a.codePostal} onChange={(codePostal) => set({ codePostal, codeInsee: '', lat: undefined, lon: undefined })} mono />
        </Field>
        <Field label="commune" hint={a.codeInsee ? `code insee ${a.codeInsee}` : 'choisissez une suggestion pour le code insee'}>
          <Input value={a.commune} onChange={(commune) => set({ commune, codeInsee: '', lat: undefined, lon: undefined })} />
        </Field>
        <Field label="depuis le">
          <Input type="date" value={a.depuis} onChange={(depuis) => set({ depuis })} />
        </Field>
      </FormGrid>
    </Card>
  )
}

function MemberEditor({ member, onDone }: { member: HouseholdMember; onDone: () => void }) {
  const { apply } = useApp()
  const [m, set] = useDraft(member)
  return (
    <div className="editor">
      <FormGrid>
        <Field label="lien">
          <Select<HouseholdMember['lien']>
            value={m.lien}
            onChange={(lien) => set({ lien })}
            options={[
              { value: 'conjoint', label: 'conjoint(e)' },
              { value: 'enfant', label: 'enfant' },
              { value: 'autre', label: 'autre' }
            ]}
          />
        </Field>
        <Field label="prénom">
          <Input value={m.prenom} onChange={(prenom) => set({ prenom })} autoFocus />
        </Field>
        <Field label="nom" hint="si différent du vôtre">
          <Input value={m.nom} onChange={(nom) => set({ nom })} />
        </Field>
        <Field label="date de naissance">
          <Input type="date" value={m.dateNaissance} onChange={(dateNaissance) => set({ dateNaissance })} />
        </Field>
        <Field label="à charge" hint="pour les impôts et les aides">
          <Check checked={m.aCharge} onChange={(aCharge) => set({ aCharge })} />
        </Field>
      </FormGrid>
      <p className="line">
        <Action onClick={onDone}>annuler</Action>{' '}
        <Action onClick={() => void apply({ type: 'member', member: m }).then(onDone)} disabled={!m.prenom.trim()}>
          enregistrer
        </Action>
      </p>
    </div>
  )
}

function Household() {
  const { dossier, apply } = useApp()
  const [editing, setEditing] = useState<HouseholdMember | null>(null)
  return (
    <Card
      id="foyer"
      title="foyer"
      color="magenta"
      actions={
        !editing && <Action onClick={() => setEditing({ id: newKey(), lien: 'enfant', prenom: '', nom: '', dateNaissance: '', aCharge: true })}>ajouter</Action>
      }
    >
      {!dossier.household.length && !editing && <p className="dim">Conjoint, enfants : utiles pour les impôts, les aides et les démarches de la famille.</p>}
      {dossier.household.map((m) =>
        editing?.id === m.id ? (
          <MemberEditor key={m.id} member={editing} onDone={() => setEditing(null)} />
        ) : (
          <div key={m.id} className="item-row">
            <span>
              <span className="magenta">{m.lien}</span> <span className="hi">{m.prenom}</span> {m.nom}
              {m.dateNaissance && (
                <span className="dim">
                  {' '}
                  · {frDate(m.dateNaissance)} ({ageOf(m.dateNaissance)} ans)
                </span>
              )}
              {m.aCharge && <span className="dim"> · à charge</span>}
            </span>
            <span>
              <Action onClick={() => setEditing(m)}>modifier</Action>{' '}
              <Action danger onClick={() => void apply({ type: 'deleteMember', id: m.id })}>
                retirer
              </Action>
            </span>
          </div>
        )
      )}
      {editing && !dossier.household.some((m) => m.id === editing.id) && <MemberEditor member={editing} onDone={() => setEditing(null)} />}
    </Card>
  )
}

function PieceEditor({ piece, onDone }: { piece: IdDocument; onDone: () => void }) {
  const { apply, dossier } = useApp()
  const [x, set] = useDraft(piece)
  return (
    <div className="editor">
      <FormGrid>
        <Field label="type">
          <Select<PieceType> value={x.type} onChange={(type) => set({ type })} options={PIECES} />
        </Field>
        <Field label="titulaire">
          <Select
            value={x.titulaire}
            onChange={(titulaire) => set({ titulaire })}
            options={[{ value: 'moi', label: 'moi' }, ...dossier.household.map((m) => ({ value: m.id, label: m.prenom }))]}
          />
        </Field>
        <Field label="numéro">
          <Input value={x.numero} onChange={(numero) => set({ numero })} mono />
        </Field>
        <Field label="délivré le">
          <Input type="date" value={x.delivrance} onChange={(delivrance) => set({ delivrance })} />
        </Field>
        <Field label="expire le" hint="Marianne vous préviendra à l’avance">
          <Input type="date" value={x.expiration} onChange={(expiration) => set({ expiration })} />
        </Field>
      </FormGrid>
      <p className="line">
        <Action onClick={onDone}>annuler</Action> <Action onClick={() => void apply({ type: 'piece', piece: x }).then(onDone)}>enregistrer</Action>
      </p>
    </div>
  )
}

function Pieces() {
  const { dossier, apply } = useApp()
  const [editing, setEditing] = useState<IdDocument | null>(null)
  const holder = (id: string) => (id === 'moi' ? 'moi' : (dossier.household.find((m) => m.id === id)?.prenom ?? '?'))
  return (
    <Card
      id="pieces"
      title="pièces d’identité"
      color="vert"
      actions={
        !editing && (
          <Action onClick={() => setEditing({ id: newKey(), type: 'cni', numero: '', delivrance: '', expiration: '', titulaire: 'moi' })}>ajouter</Action>
        )
      }
    >
      {!dossier.pieces.length && !editing && (
        <p className="dim">
          Carte d’identité, passeport, permis, titre de séjour : avec leur date d’expiration, Marianne vous prévient à temps pour les renouveler.
        </p>
      )}
      {dossier.pieces.map((x) =>
        editing?.id === x.id ? (
          <PieceEditor key={x.id} piece={editing} onDone={() => setEditing(null)} />
        ) : (
          <div key={x.id} className="item-row">
            <span>
              <span className="vert">{PIECES.find((t) => t.value === x.type)?.label}</span> <span className="dim">· {holder(x.titulaire)}</span>
              {x.expiration && <span className="dim"> · expire le {frDate(x.expiration)}</span>}
            </span>
            <span>
              <Action onClick={() => setEditing(x)}>modifier</Action>{' '}
              <Action danger onClick={() => void apply({ type: 'deletePiece', id: x.id })}>
                retirer
              </Action>
            </span>
          </div>
        )
      )}
      {editing && !dossier.pieces.some((x) => x.id === editing.id) && <PieceEditor piece={editing} onDone={() => setEditing(null)} />}
    </Card>
  )
}

function Notes() {
  const { dossier, apply } = useApp()
  return (
    <Card id="notes" title="précisions pour l’assistant">
      <p className="dim" style={{ marginBottom: 6 }}>
        Ce que vous voulez que Marianne sache à chaque conversation : « je suis malvoyant, évite les tableaux », « je travaille de nuit »… Vos identifiants y
        sont remplacés par des jetons avant envoi.
      </p>
      <TextInput multiline rows={3} value={dossier.notes} onCommit={(notes) => void apply({ type: 'notes', notes })} placeholder="facultatif" />
    </Card>
  )
}

export function DossierPage() {
  useScrollToAnchor()
  return (
    <div className="page-inner">
      <PageHead
        code="3615 DOSSIER"
        color="jaune"
        title="mon dossier"
        description="Chiffré sur cet ordinateur. L’assistant n’en voit que le contexte (âge, commune, situation) : vos identifiants restent ici et sont remplacés par des jetons."
      />
      <Identity />
      <AddressCard />
      <Household />
      <Pieces />
      <Notes />
    </div>
  )
}
