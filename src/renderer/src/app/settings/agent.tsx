import { useEffect, useState } from 'react'
import type { AgentConfig, AgentId, AgentModel, AgentStatus, AgentTestResult, Config, Effort, WebAccess } from '@shared/types'
import { Dropdown } from '../../components/dropdown'
import { Action, List, ListRow, Radio, Row, Sep, Spinner, TextInput } from '../../components/ui'
import type { Update } from '../hooks'

const api = window.marianne

const PROVIDERS: Array<{ id: AgentId; label: string; tag: string; hint: string }> = [
  { id: 'claude-code', label: 'claude code', tag: 'votre compte claude', hint: 'le cli claude installé sur cet ordinateur, avec votre propre compte claude' },
  { id: 'codex', label: 'codex', tag: 'votre compte chatgpt', hint: 'le cli codex installé sur cet ordinateur, avec votre propre compte chatgpt / openai' }
]

const AGENTS: Record<AgentId, { name: string; key: 'claudeCode' | 'codex'; install: string; command: string; modelHint: string }> = {
  'claude-code': {
    name: 'claude code',
    key: 'claudeCode',
    install: 'https://claude.com/claude-code',
    command: 'claude',
    modelHint: 'sonnet est un bon équilibre · opus pour les dossiers complexes · haiku est plus rapide'
  },
  codex: {
    name: 'codex',
    key: 'codex',
    install: 'https://developers.openai.com/codex',
    command: 'codex',
    modelHint: 'un modèle intermédiaire suffit le plus souvent ; un plus grand pour les dossiers complexes'
  }
}

const EFFORTS: Array<{ value: Effort; label: string }> = [
  { value: 'low', label: 'faible' },
  { value: 'medium', label: 'moyen' },
  { value: 'high', label: 'élevé' }
]

const WEB: Array<{ value: WebAccess; label: string; hint: string }> = [
  {
    value: 'public',
    label: 'recherche + sites publics',
    hint: 'recherche web, et lecture des seuls sites publics (gouv.fr, organismes, institutions, catalogue des services)'
  },
  { value: 'all', label: 'recherche + tout le web', hint: 'recherche et lecture de n’importe quel site' },
  { value: 'off', label: 'aucun', hint: 'seulement les outils de marianne' }
]

function AgentSection({ id, config, update }: { id: AgentId; config: Config; update: Update }) {
  const agent = AGENTS[id]
  const cfg = config.agent[agent.key]
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [models, setModels] = useState<AgentModel[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = (force = true) => {
    setLoading(true)
    void api
      .getAgentStatus(id, force)
      .then(setStatus)
      .finally(() => setLoading(false))
  }
  useEffect(() => refresh(false), [id, cfg.path]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void api.listAgentModels(id).then(setModels), [id])

  const set = (patch: Partial<AgentConfig>) => void update({ agent: { [agent.key]: patch } })
  const options = (models.some((m) => m.id === cfg.model) ? models : [{ id: cfg.model, label: cfg.model }, ...models]).map((m) => ({
    value: m.id,
    label: m.label
  }))

  return (
    <section>
      <Sep
        tail={
          <Action onClick={() => refresh()} disabled={loading}>
            {loading ? 'vérification' : 'actualiser'}
          </Action>
        }
      >
        {agent.name}
      </Sep>
      <Row label="cli" hint={status?.path} actions={status && !status.found && <Action onClick={() => api.openExternal(agent.install)}>installer</Action>}>
        {!status ? (
          <Spinner />
        ) : status.found ? (
          <span>
            <span className="green">trouvé</span> <span className="dim">· {status.version}</span>
          </span>
        ) : (
          <span className="yellow">introuvable</span>
        )}
      </Row>
      {status?.found && (
        <Row
          label="compte"
          hint={`la connexion se fait dans ${agent.name} lui-même : marianne ne voit ni ne stocke vos identifiants`}
          actions={!status.loggedIn && <Action onClick={() => void api.openAgentLogin(id).then(() => setTimeout(() => refresh(), 1500))}>se connecter</Action>}
        >
          {status.loggedIn ? (
            <span>
              <span className="green">connecté</span>
              {status.account && <span className="dim"> · {status.account}</span>}
            </span>
          ) : (
            <span className="yellow">non connecté</span>
          )}
        </Row>
      )}
      {status?.error && status.found && <p className="under error">✗ {status.error}</p>}
      <Row label="modèle" hint={agent.modelHint}>
        <Dropdown value={cfg.model} onChange={(model) => set({ model })} options={options} disabled={!options.length} />
      </Row>
      <Row label="effort" hint="réflexion avant de répondre · moyen est un bon équilibre">
        <Dropdown<Effort> value={cfg.effort} onChange={(effort) => set({ effort })} options={EFFORTS} />
      </Row>
      <Row label="chemin du cli" hint={`laisser vide pour trouver ${agent.command} automatiquement`}>
        <TextInput value={cfg.path} onCommit={(v) => set({ path: v.trim() })} placeholder="auto" />
      </Row>
      <p className="note">
        marianne lance votre {agent.command} non modifié, avec ses propres outils (sources publiques, navigateur, compétences) et sans accès à vos fichiers ni à
        vos réglages. l’usage compte dans les limites de votre abonnement.
      </p>
    </section>
  )
}

export function AgentSettings({ config, update }: { config: Config; update: Update }) {
  const [test, setTest] = useState<AgentTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const provider = config.agent.provider
  useEffect(() => setTest(null), [provider])

  const runTest = () => {
    setTesting(true)
    setTest(null)
    void api
      .testAgent()
      .then(setTest)
      .finally(() => setTesting(false))
  }

  return (
    <>
      <section>
        <Sep>agent</Sep>
        <List>
          {PROVIDERS.map((p) => (
            <ListRow key={p.id} hint={p.hint} meta={p.tag} selected={provider === p.id}>
              <button className="choice" role="radio" aria-checked={provider === p.id} onClick={() => void update({ agent: { provider: p.id } })}>
                <Radio on={provider === p.id} /> {p.label}
              </button>
            </ListRow>
          ))}
        </List>
        <p className="note">changer d’agent en cours de conversation est possible : le nouvel agent reçoit un résumé des échanges.</p>
      </section>

      <AgentSection key={provider} id={provider} config={config} update={update} />

      <section>
        <Sep>comportement</Sep>
        <Row label="accès web" hint={WEB.find((w) => w.value === config.agent.web)?.hint}>
          <Dropdown<WebAccess> value={config.agent.web} onChange={(web) => void update({ agent: { web } })} options={WEB} />
        </Row>
        {provider === 'codex' && config.agent.web === 'public' && (
          <p className="under dim">avec codex, la recherche web n’est pas limitée aux sites publics.</p>
        )}
        <Row block label="consignes" hint="ajoutées à chaque conversation, ex. « réponds de façon très concise » ou « je suis malvoyant : évite les tableaux »">
          <TextInput
            multiline
            rows={3}
            value={config.agent.customInstructions}
            onCommit={(v) => void update({ agent: { customInstructions: v } })}
            placeholder="facultatif"
          />
        </Row>
        <Row label="durée maximale" hint="arrêter une réponse qui dure plus longtemps">
          <Dropdown
            value={String(config.agent.maxMinutes)}
            onChange={(v) => void update({ agent: { maxMinutes: Number(v) } })}
            options={[3, 5, 10, 20, 30].map((m) => ({ value: String(m), label: `${m} min` }))}
          />
        </Row>
        <Row
          label="test"
          hint="un vrai échange court : l’agent appelle un outil de marianne (jours fériés) et répond"
          actions={
            <Action onClick={runTest} disabled={testing}>
              {testing ? 'test en cours' : test ? 'tester encore' : 'tester'}
            </Action>
          }
        >
          {testing ? (
            <span>
              <Spinner /> <span className="dim">connexion et appel d’un outil…</span>
            </span>
          ) : test?.ok ? (
            <span>
              <span className="green">✓ ok</span>
              <span className="dim">
                {' '}
                · {test.tools} appel{(test.tools ?? 0) > 1 ? 's' : ''} d’outil · {((test.ms ?? 0) / 1000).toFixed(1)} s
              </span>
            </span>
          ) : test ? (
            <span className="red">✗ échec</span>
          ) : (
            <span className="dim">vérifie l’agent et les outils</span>
          )}
        </Row>
        {test?.ok && <p className="under hi selectable">{test.text}</p>}
        {test && !test.ok && <p className="under error selectable">{test.error}</p>}
      </section>
    </>
  )
}
