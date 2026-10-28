import { useApp } from '../context'
import { About } from './about'
import { AgentSettings } from './agent'
import { Backup } from './backup'
import { General } from './general'
import { Keychain } from './keychain'
import { Skills } from './skills'
import { Sources } from './sources'

export type SettingsPage = 'general' | 'agent' | 'sources' | 'keychain' | 'skills' | 'backup' | 'about'

export const SETTINGS_PAGES: Array<{ id: SettingsPage; label: string }> = [
  { id: 'general', label: 'général' },
  { id: 'agent', label: 'agent' },
  { id: 'sources', label: 'sources' },
  { id: 'keychain', label: 'trousseau' },
  { id: 'skills', label: 'compétences' },
  { id: 'backup', label: 'sauvegarde' },
  { id: 'about', label: 'à propos' }
]

export function Settings({ page }: { page: SettingsPage }) {
  const { config, update, go } = useApp()
  return (
    <div className="page-inner">
      <div className="tabs">
        {SETTINGS_PAGES.map((p, i) => (
          <button key={p.id} className={page === p.id ? 'on' : ''} onClick={() => go(`reglages/${p.id}`)}>
            <span className="acc">{i + 1}</span> {p.label}
          </button>
        ))}
      </div>
      {page === 'general' && <General config={config} update={update} />}
      {page === 'agent' && <AgentSettings config={config} update={update} />}
      {page === 'sources' && <Sources config={config} update={update} onPage={(p) => go(`reglages/${p}`)} />}
      {page === 'keychain' && <Keychain />}
      {page === 'skills' && <Skills config={config} update={update} />}
      {page === 'backup' && <Backup />}
      {page === 'about' && <About config={config} update={update} />}
    </div>
  )
}
