import { useEffect, useState } from 'react'
import { PROFILE_FIELDS, type ProfileField, type ServiceOption, type ServiceOptionValue, type ServiceState } from '@marianne/sdk'
import { Modal, ServiceIcon, Spinner } from '@marianne/sdk/view'
import { ON_SITES } from '@shared/approvals'
import { api, errorText } from '../../lib/api'
import { when } from '../../lib/format'
import { readSummary } from '../../settings/readers'
import { Code, Community, Official } from './parts'

/**
 * A service's own settings, opened from its row on the Services page (« réglages du service »): never
 * Réglages, which is the application's and the user's. What a service declares of its own comes first;
 * then what Marianne lets it do, drawn by her, the same for every service: on or off, what it reads of the
 * profile (the same choice as Réglages › Accès des services), the sites it reaches and those where Marianne
 * acts with it, its data on this computer, its tile, and the way to remove it.
 */
export function ServiceSettingsDialog({ state, onClose }: { state: ServiceState; onClose: () => void }) {
  const m = state.manifest
  const code = m.id.toUpperCase()
  const [confirming, setConfirming] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState('')
  const act = (p: Promise<unknown>) => void p.then(() => setError('')).catch((err: unknown) => setError(errorText(err)))
  const { asked, granted } = state.access
  const sum = readSummary(asked, granted)
  const grant = (fields: ProfileField[]) => act(api.setServiceAccess(m.id, fields))
  const running = state.sync?.running
  const remove = () => act(api.removeService(m.id).then(onClose))
  return (
    <Modal wide onClose={onClose} label={`réglages de 3615 ${code}`}>
      <div className="mh">
        <span className="t">RÉGLAGES · 3615 {code}</span>
        <button className="btn small" onClick={onClose}>
          fermer ✕
        </button>
      </div>
      <div className="in service-settings">
        <div className="review-head">
          <ServiceIcon icon={m.icon} size="large" />
          <div className="stack" style={{ gap: 4 }}>
            <span className="row-flex">
              <Code code={m.id} />
              {state.builtIn ? <Official /> : <Community />}
            </span>
            <span className="hi" style={{ fontSize: '1.1em' }}>
              {m.name}
            </span>
            <span className="small dim">version {m.version}</span>
          </div>
        </div>
        <div className="svc-part">
          <span className="label">ses réglages</span>
          {m.options.length ? (
            <div className="rows">
              {m.options.map((o) => (
                <div key={o.key} className="row">
                  <span className="stack" style={{ gap: 2 }}>
                    <span>{o.label}</span>
                    {o.hint && <span className="small dim">{o.hint}</span>}
                  </span>
                  <OptionControl option={o} value={state.options[o.key] ?? o.default} onSet={(v) => act(api.setServiceOption(m.id, o.key, v))} />
                  <span />
                </div>
              ))}
            </div>
          ) : (
            <p className="small dim empty">aucun réglage propre</p>
          )}
        </div>
        <div className="svc-part">
          <span className="label">ce que Marianne lui permet</span>
          <div className="rows">
            <div className="row">
              <span>actif</span>
              <span>
                <button
                  className={`switch${state.on ? ' on' : ''}`}
                  role="switch"
                  aria-checked={state.on}
                  aria-label={`activer 3615 ${code}`}
                  disabled={!state.available}
                  onClick={() => act(api.switchService(m.id, !state.on))}
                >
                  <i />
                </button>
                {state.error && <span className="small bad"> n’a pas pu démarrer : {state.error}</span>}
                {!state.available && !state.error && <span className="small bad"> une connexion dont il dépend est désactivée</span>}
              </span>
              <span />
            </div>
            <div className="row">
              <span>votre profil</span>
              <span className="stack" style={{ gap: 2 }}>
                <span>la commune de votre adresse</span>
                {asked.length > 0 && (
                  <span className={sum.on ? '' : 'muted'}>
                    {granted === null ? `demandera ${asked.map((f) => PROFILE_FIELDS[f]).join(', ')}, à sa première ouverture` : sum.text}
                    {sum.on && state.access.readAt && <span className="small muted"> · lu le {state.access.readAt.split('-').reverse().join('/')}</span>}
                  </span>
                )}
              </span>
              {asked.length > 0 && granted !== null ? (
                <span className="perm-acts">
                  <span className="perm-seg">
                    <button className={sum.on ? 'on' : ''} onClick={() => grant(asked)}>
                      accepter
                    </button>
                    <button className={!sum.on ? 'on' : ''} onClick={() => grant([])}>
                      refuser
                    </button>
                  </span>
                  {asked.length > 1 && (
                    <button className={`link small${choosing ? ' accent' : ''}`} onClick={() => setChoosing(!choosing)}>
                      choisir
                    </button>
                  )}
                </span>
              ) : (
                <span />
              )}
            </div>
            {choosing && granted !== null && (
              <div className="perm-cfg">
                {asked.map((f) => {
                  const on = granted.includes(f)
                  return (
                    <label key={f}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => grant(on ? asked.filter((x) => x !== f && granted.includes(x)) : [...asked.filter((x) => granted.includes(x)), f])}
                      />{' '}
                      {PROFILE_FIELDS[f]}
                    </label>
                  )
                })}
              </div>
            )}
            <div className="row">
              <span>se connecter à</span>
              {m.hosts.length ? (
                <span className="hosts">
                  {m.hosts.map((h) => (
                    <span key={h} className="host-chip">
                      {h}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="dim">aucun site</span>
              )}
              <span />
            </div>
            {m.sites.length > 0 && (
              <div className="row">
                <span>Marianne y agit</span>
                <span className="hosts" title={ON_SITES}>
                  {m.sites.map((h) => (
                    <span key={h} className="host-chip">
                      {h}
                    </span>
                  ))}
                </span>
                <span />
              </div>
            )}
            {state.sync && (
              <div className="row">
                <span>ses données</span>
                <span className="small dim">
                  {running
                    ? `${running.phase === 'download' ? 'téléchargement' : 'indexation'} ${running.total ? Math.round((running.done / running.total) * 100) : 0} %`
                    : state.sync.syncedAt
                      ? `${state.sync.summary || 'sur cet ordinateur'} · ${when(state.sync.syncedAt)}`
                      : 'pas encore téléchargées'}
                  {state.sync.error && <span className="bad"> · {state.sync.error}</span>}
                </span>
                {state.on ? (
                  <button className="btn small" disabled={!!running} aria-busy={!!running} onClick={() => act(api.syncService(m.id))}>
                    {running && <Spinner />}
                    mettre à jour
                  </button>
                ) : (
                  <span />
                )}
              </div>
            )}
            <div className="row">
              <span>épinglé</span>
              <span>
                <button
                  className={`star${state.pinned ? ' on' : ''}`}
                  aria-pressed={state.pinned}
                  title={state.pinned ? 'désépingler' : 'épingler en tuile'}
                  onClick={() => act(api.pinService(m.id, !state.pinned))}
                >
                  {state.pinned ? '★' : '☆'}
                </button>{' '}
                <span className="small dim">en tuile sur la page Services</span>
              </span>
              <span />
            </div>
          </div>
        </div>
        {error && <p className="small bad">{error}</p>}
      </div>
      <div className="foot">
        <span>
          {confirming ? (
            <span className="small">
              effacer ses fichiers de cet ordinateur, pour tous ses comptes ?{' '}
              <button className="link bad" onClick={remove}>
                effacer
              </button>{' '}
              <button className="link" onClick={() => setConfirming(false)}>
                non
              </button>
            </span>
          ) : (
            // A community service's files are this computer's: removing it is asked twice.
            <button className="btn danger" onClick={() => (state.builtIn ? remove() : setConfirming(true))}>
              retirer de mes services
            </button>
          )}
        </span>
        <button className="btn" onClick={onClose}>
          fermer
        </button>
      </div>
    </Modal>
  )
}

/**
 * One of the service's own options, as Marianne draws them all: a switch, a choice (its values side by
 * side up to three, else a menu), a number with its unit, a line of text. Kept as soon as it is set; a
 * number or a text when it is left, or with Entrée.
 */
function OptionControl({ option, value, onSet }: { option: ServiceOption; value: ServiceOptionValue; onSet: (value: ServiceOptionValue) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    if (draft === String(value)) return
    if (option.type === 'number') {
      const n = Number(draft.replace(',', '.'))
      // Out of its bounds or off its steps: the value it had, which the main process would keep anyway.
      if (Number.isFinite(n) && n >= option.min && n <= option.max) onSet(n)
      else setDraft(String(value))
    } else onSet(draft)
  }
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape' && draft !== String(value)) {
      e.preventDefault()
      setDraft(String(value))
    }
  }
  switch (option.type) {
    case 'switch':
      return (
        <span>
          <button className={`switch${value ? ' on' : ''}`} role="switch" aria-checked={!!value} aria-label={option.label} onClick={() => onSet(!value)}>
            <i />
          </button>
        </span>
      )
    case 'choice':
      // In a span of their own: the row's cell, not their frame, takes the column's width.
      return (
        <span>
          {option.choices.length <= 3 ? (
            <span className="seg" role="group" aria-label={option.label}>
              {option.choices.map((c) => (
                <button key={c.value} aria-pressed={c.value === value} onClick={() => onSet(c.value)}>
                  {c.label}
                </button>
              ))}
            </span>
          ) : (
            <select value={String(value)} aria-label={option.label} onChange={(e) => onSet(e.target.value)}>
              {option.choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </span>
      )
    case 'number':
      return (
        <span className="row-flex" style={{ gap: 8 }}>
          <input
            type="number"
            min={option.min}
            max={option.max}
            step={option.step ?? 1}
            value={draft}
            aria-label={option.label}
            style={{ width: 110 }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={keys}
          />
          {option.unit && <span className="dim">{option.unit}</span>}
        </span>
      )
    case 'text':
      return (
        <input
          value={draft}
          maxLength={option.maxLength ?? 80}
          placeholder={option.placeholder}
          aria-label={option.label}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={keys}
        />
      )
  }
}
