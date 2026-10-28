import { useState } from 'react'
import { daysUntil, newKey, today, type DomainId, type ManualDeadline } from '@shared/dossier'
import { DOMAINS } from '@shared/domains'
import { Card, DeadlineRow, PageHead } from '../../components/blocks'
import { Field, FormGrid, Input, Select } from '../../components/form'
import { Action } from '../../components/ui'
import { useApp } from '../context'

function AddDeadline({ onDone }: { onDone: () => void }) {
  const { apply } = useApp()
  const [d, setD] = useState<ManualDeadline>({ id: newKey(), title: '', date: today(), domain: 'identite', note: '', source: 'utilisateur' })
  const set = (patch: Partial<ManualDeadline>) => setD((x) => ({ ...x, ...patch }))
  return (
    <div className="editor">
      <FormGrid>
        <Field label="à faire" wide>
          <Input value={d.title} onChange={(title) => set({ title })} autoFocus placeholder="ex. répondre au courrier de la caf" />
        </Field>
        <Field label="avant le">
          <Input type="date" value={d.date} onChange={(date) => set({ date })} />
        </Field>
        <Field label="domaine">
          <Select<DomainId> value={d.domain} onChange={(domain) => set({ domain })} options={DOMAINS.map((x) => ({ value: x.id, label: x.label }))} />
        </Field>
        <Field label="note" wide>
          <Input value={d.note} onChange={(note) => set({ note })} placeholder="facultatif" />
        </Field>
      </FormGrid>
      <p className="line">
        <Action onClick={onDone}>annuler</Action>{' '}
        <Action onClick={() => void apply({ type: 'deadline', deadline: d }).then(onDone)} disabled={!d.title.trim() || !d.date}>
          ajouter
        </Action>
      </p>
    </div>
  )
}

export function Agenda() {
  const { deadlines, ask } = useApp()
  const [all, setAll] = useState(false)
  const [domain, setDomain] = useState<DomainId | ''>('')
  const [adding, setAdding] = useState(false)
  const shown = deadlines.filter((d) => (all || d.status === 'a_faire') && (!domain || d.domain === domain) && (all || daysUntil(d.date) >= -60))
  const months = new Map<string, typeof shown>()
  for (const d of shown) months.set(d.date.slice(0, 7), [...(months.get(d.date.slice(0, 7)) ?? []), d])

  return (
    <div className="page-inner">
      <PageHead
        code="3615 AGENDA"
        color="cyan"
        title="agenda"
        description="Vos échéances : calculées depuis votre dossier, tirées du calendrier officiel, ou ajoutées par vous et par Marianne. Rappels par notification 30 jours, 7 jours et la veille."
        right={
          <>
            <button className={`chip-toggle ${!all ? 'on' : ''}`} onClick={() => setAll(false)}>
              à faire
            </button>
            <button className={`chip-toggle ${all ? 'on' : ''}`} onClick={() => setAll(true)}>
              tout
            </button>
          </>
        }
      />
      <div className="filters">
        <Select<DomainId | ''>
          value={domain}
          onChange={setDomain}
          options={[{ value: '', label: 'tous les domaines' }, ...DOMAINS.map((d) => ({ value: d.id, label: d.label }))]}
        />
        <span className="sp" />
        <Action onClick={() => ask({ text: 'Fais le point sur mes échéances : qu’est-ce qui est urgent, et qu’ai-je pu oublier ?', send: true, fresh: true })}>
          faire le point avec marianne
        </Action>
        {!adding && <Action onClick={() => setAdding(true)}>ajouter</Action>}
      </div>
      {adding && (
        <Card title="nouvelle échéance" color="cyan">
          <AddDeadline onDone={() => setAdding(false)} />
        </Card>
      )}
      {!shown.length && (
        <p className="empty">Aucune échéance. Renseignez vos pièces d’identité, entreprises, véhicules et logements pour qu’elles apparaissent.</p>
      )}
      {[...months].map(([month, list]) => (
        <Card key={month} title={new Date(`${month}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}>
          {list.map((d) => (
            <DeadlineRow key={d.key} d={d} />
          ))}
        </Card>
      ))}
    </div>
  )
}
