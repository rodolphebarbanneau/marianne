import { SOURCES } from '@shared/constants'
import type { Config, SourceInfo, SourceStatus } from '@shared/types'
import { Dropdown } from '../../components/dropdown'
import { Action, Bar, Check, Row, Sep, TextInput } from '../../components/ui'
import { useSources, when, type Update } from '../hooks'

const api = window.marianne

const mb = (n: number) => `${(n / 1e6).toFixed(1)} Mo`

function SyncState({ s }: { s: SourceStatus }) {
  if (s.syncing) {
    const { phase, done, total } = s.syncing
    return (
      <Bar
        value={done}
        total={total}
        label={phase === 'download' ? `téléchargement ${total ? `${mb(done)} / ${mb(total)}` : mb(done)}` : `indexation ${done} / ${total || '…'}`}
      />
    )
  }
  if (s.error) return <span className="red">✗ {s.error}</span>
  if (!s.syncedAt) return <span className="yellow">pas encore téléchargée</span>
  return (
    <span>
      <span className="green">à jour</span>
      <span className="dim">
        {' '}
        · {s.count?.toLocaleString('fr-FR')} éléments · {when(s.syncedAt)}
      </span>
    </span>
  )
}

function SourceBlock({
  info,
  status,
  config,
  update,
  onPage
}: {
  info: SourceInfo
  status?: SourceStatus
  config: Config
  update: Update
  onPage: (p: string) => void
}) {
  const cfg = config.sources[info.id]
  const set = (patch: Partial<typeof cfg>) => void update({ sources: { [info.id]: patch } })
  return (
    <section>
      <Sep tail={<Check checked={cfg.enabled} onChange={(enabled) => set({ enabled })} />}>{info.label}</Sep>
      <p className="note" style={{ paddingTop: 0, marginBottom: 4 }}>
        {info.description}
      </p>
      {cfg.enabled && info.kind === 'offline' && status && (
        <Row
          label="index local"
          hint="téléchargé puis cherché sur cet ordinateur, sans connexion ; mis à jour automatiquement"
          actions={
            <Action onClick={() => void api.syncSource(info.id)} disabled={!!status.syncing}>
              mettre à jour
            </Action>
          }
        >
          <SyncState s={status} />
        </Row>
      )}
      {cfg.enabled && info.key && (
        <Row
          label="accès api"
          hint="identifiants gratuits de l’api piste (piste.gouv.fr), à ranger dans le trousseau : clé api, adresse piste.gouv.fr"
          actions={
            status?.hasKey ? undefined : (
              <>
                <Action onClick={() => api.openExternal('https://piste.gouv.fr/registration')}>créer un compte</Action>
                <Action onClick={() => onPage('keychain')}>ajouter au trousseau</Action>
              </>
            )
          }
        >
          {status?.hasKey ? <span className="green">configuré</span> : <span className="yellow">à configurer</span>}
        </Row>
      )}
      {cfg.enabled && (
        <Row label={info.kind === 'offline' ? 'adresse du fichier' : 'adresse de l’api'} hint={`laisser vide pour l’adresse officielle : ${info.defaultUrl}`}>
          <TextInput value={cfg.url} onCommit={(url) => set({ url: url.trim() })} placeholder="officielle" />
        </Row>
      )}
      <p className="note muted" style={{ paddingTop: 0 }}>
        {info.license} ·{' '}
        <a className="cyan" style={{ cursor: 'pointer' }} onClick={() => api.openBrowser(info.homepage)}>
          {new URL(info.homepage).hostname}
        </a>
      </p>
    </section>
  )
}

export function Sources({ config, update, onPage }: { config: Config; update: Update; onPage: (p: string) => void }) {
  const statuses = useSources()
  return (
    <>
      <section>
        <Sep>mises à jour</Sep>
        <Row label="automatiques" hint="télécharger les nouvelles versions des sources hors ligne en arrière-plan">
          <Check checked={config.sync.auto} onChange={(auto) => void update({ sync: { auto } })} />
        </Row>
        <Row label="fréquence" hint="âge au-delà duquel une source hors ligne est retéléchargée (le serveur ne renvoie le fichier que s’il a changé)">
          <Dropdown
            value={String(config.sync.everyHours)}
            onChange={(v) => void update({ sync: { everyHours: Number(v) } })}
            options={[
              { value: '12', label: 'deux fois par jour' },
              { value: '24', label: 'chaque jour' },
              { value: '168', label: 'chaque semaine' }
            ]}
          />
        </Row>
        <p className="note">les sources désactivées ne sont plus proposées à l’agent.</p>
      </section>
      {SOURCES.map((s) => (
        <SourceBlock key={s.id} info={s} status={statuses.find((x) => x.id === s.id)} config={config} update={update} onPage={onPage} />
      ))}
    </>
  )
}
