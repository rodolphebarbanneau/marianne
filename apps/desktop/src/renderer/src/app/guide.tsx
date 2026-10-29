import { useEffect, useState } from 'react'
import { ENGINE_LABELS } from '@shared/config'
import { CONTRIBUTORS, projectLinks, type ProjectLinkId } from '@shared/project'
import type { AppInfo } from '@shared/types'
import { BookIcon, BugIcon, CodeIcon, SparkIcon, TagIcon } from '../components/icons'
import { Logo } from '../components/logo'
import { Modal } from '../components/ui'
import { api } from '../lib/api'
import { useShortcutLabel } from './commands'
import { useApp } from './context'

const LINK_ICONS: Record<ProjectLinkId, typeof CodeIcon> = {
  source: CodeIcon,
  problem: BugIcon,
  idea: SparkIcon,
  releases: TagIcon,
  guide: BookIcon
}

const engines = Object.values(ENGINE_LABELS)
const ENGINES = `${engines.slice(0, -1).join(', ')} ou ${engines[engines.length - 1]}`

/**
 * GUIDE (F1): what Marianne is, its main keys, where it is made and by whom. The lock screen shows
 * it too, without the keys, which are those of an open account.
 */
export function Guide({ keys, onAllKeys, onClose }: { keys?: [string, string][]; onAllKeys?: () => void; onClose: () => void }) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => void api.getInfo().then(setInfo), [])
  // Échap closes the guide alone: caught before the settings under it, which leave a handled key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Every list the same way: a row per entry, what it is on the left, its key or its link on the right.
  return (
    <Modal>
      <div className="in roomy guide">
        <span className="label">Guide</span>
        <div className="guide-head">
          <Logo size={48} />
          <span className="grow">
            <span className="wordmark">MARIANNE</span>
            <span className="small dim">{info ? `version ${info.version}` : '\u00a0'}</span>
          </span>
        </div>
        <p className="dim">
          Marianne vous aide à comprendre vos droits et à préparer vos démarches, avec l’assistant de votre choix : {ENGINES}. Ce que vous lui confiez reste sur
          cet ordinateur, dans une archive chiffrée.
        </p>
        <div className="guide-cols">
          {keys && (
            <section>
              <span className="label">Les touches</span>
              <div className="guide-list">
                {keys.map(([what, key]) => (
                  <span key={what}>
                    <span>{what}</span>
                    <span className="kbd">{key}</span>
                  </span>
                ))}
              </div>
              {onAllKeys && (
                <button className="link small" onClick={onAllKeys}>
                  tous les raccourcis, à changer à votre goût…
                </button>
              )}
            </section>
          )}
          <section>
            <span className="label">Liens</span>
            <div className="guide-list">
              {projectLinks(info?.version).map((l) => {
                const Icon = LINK_ICONS[l.id]
                return (
                  <button key={l.id} title={l.url} onClick={() => api.openExternal(l.url)}>
                    <span className="to">
                      <Icon />
                      {l.label}
                    </span>
                    <span className="dim">↗</span>
                  </button>
                )
              })}
            </div>
            <span className="label">Auteurs</span>
            <div className="guide-list">
              {CONTRIBUTORS.map((c) => (
                <button key={c.login} title={c.url} onClick={() => api.openExternal(c.url)}>
                  <span>{c.name}</span>
                  <span className="to">@{c.login} ↗</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
      <div className="foot">
        <span className="small dim">projet indépendant, sans lien avec l’État · licence MIT</span>
        <button className="btn primary" autoFocus onClick={onClose}>
          fermer
        </button>
      </div>
    </Modal>
  )
}

/** The authors, in the repository's order on GitHub: each name, and their GitHub page. */
export function Authors() {
  return (
    <span className="authors">
      {CONTRIBUTORS.map((c) => (
        <span key={c.login}>
          {c.name}{' '}
          <button className="link" title={c.url} onClick={() => api.openExternal(c.url)}>
            @{c.login} ↗
          </button>
        </span>
      ))}
    </span>
  )
}

/** The guide of an open account: with the keys as the user set them, and a way to all of them. */
export function AppGuide() {
  const app = useApp()
  const label = useShortcutLabel()
  const keys: [string, string][] = [
    ['parler à Marianne', label('marianne')],
    ['commandes', label('commands')],
    ['menu', label('menu')],
    ['chercher partout', label('search')],
    ['page suivante, précédente', `${label('next')} ${label('prev')}`],
    ['réglages', label('settings')],
    ['verrouiller', label('lock')],
    ['recharger la fenêtre', label('reload')]
  ]
  return (
    <Guide
      keys={keys}
      onAllKeys={() => {
        app.openGuide(false)
        app.openSettings('shortcuts')
      }}
      onClose={() => app.openGuide(false)}
    />
  )
}
