import { useEffect, useState } from 'react'
import { foldText } from '@marianne/sdk'
import { accelOf, pressedAccel, SHORTCUTS, shortcutLabel } from '@shared/shortcuts'
import { REPO_URL } from '@shared/project'
import type { AppInfo, UpdateState } from '@shared/types'
import { useApp } from '../app/context'
import { Authors } from '../app/guide'
import { ArchivePath } from '../components/archive-path'
import { Logo } from '../components/logo'
import { SearchField, Spinner } from '../components/ui'
import { api, isMac, useLive } from '../lib/api'
import { ListHead } from './parts'

export function DisplayPane() {
  const { config, setConfig } = useApp()
  const ui = config.ui
  return (
    <div className="rows">
      <div className="row">
        <span>taille du texte</span>
        <select value={ui.fontSize} onChange={(e) => void setConfig({ ui: { fontSize: Number(e.target.value) } })}>
          {[12, 13, 14, 15, 16, 18].map((n) => (
            <option key={n} value={n}>
              {n} px
            </option>
          ))}
        </select>
        <span />
      </div>
      <div className="row">
        <span>thème</span>
        <select value={ui.theme} onChange={(e) => void setConfig({ ui: { theme: e.target.value as 'minitel' | 'monochrome' } })}>
          <option value="minitel">Minitel couleur</option>
          <option value="monochrome">Minitel 1 (monochrome)</option>
        </select>
        <span />
      </div>
      <div className="row">
        <span>écran</span>
        <label>
          <input type="checkbox" checked={ui.crt} onChange={(e) => void setConfig({ ui: { crt: e.target.checked } })} />
          imiter un vieil écran, avec ses lignes et sa lueur
        </label>
        <span />
      </div>
    </div>
  )
}

/** Every shortcut, as in speak: click it, press the new combination; Échap cancels. */
export function ShortcutsPane() {
  const { config, setConfig } = useApp()
  const [recording, setRecording] = useState<string | null>(null)

  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return setRecording(null)
      const accel = pressedAccel(e, isMac)
      if (!accel) return
      void setConfig({ shortcuts: { ...config.shortcuts, [recording]: accel } })
      setRecording(null)
    }
    // Capture phase on the window: before the application's own shortcuts.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, config.shortcuts, setConfig])

  const reset = (id?: string) => {
    const next = { ...config.shortcuts }
    if (id) delete next[id]
    void setConfig({ shortcuts: id ? next : {} })
  }
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))]
  return (
    <>
      {groups.map((g, i) => (
        <div key={g}>
          <ListHead label={g}>
            {i === 0 && (
              <button className="btn small" onClick={() => reset()}>
                tout remettre par défaut
              </button>
            )}
          </ListHead>
          <div className="rows">
            {SHORTCUTS.filter((s) => s.group === g).map((s) => {
              const accel = accelOf(s.id, isMac, config.shortcuts)
              const clash = SHORTCUTS.find((o) => o.id !== s.id && accelOf(o.id, isMac, config.shortcuts) === accel)
              return (
                <div key={s.id} className="row">
                  <span>{s.label}</span>
                  <span>
                    <button
                      className={`btn small${recording === s.id ? ' primary' : ''}`}
                      title="cliquez, puis appuyez sur la nouvelle combinaison"
                      onClick={() => setRecording(recording === s.id ? null : s.id)}
                    >
                      {recording === s.id ? 'appuyez sur les touches… (échap pour annuler)' : shortcutLabel(accel, isMac)}
                    </button>
                    {clash && <span className="small accent"> déjà utilisé pour « {clash.label} »</span>}
                  </span>
                  {config.shortcuts[s.id] ? (
                    <button className="btn small" onClick={() => reset(s.id)}>
                      par défaut
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

/** The skills Marianne reads when the subject calls for them: hers, and those the user adds to their folder. */
export function SkillsPane() {
  const skills = useLive(api.listSkills, () => () => undefined) ?? []
  const [query, setQuery] = useState('')
  const q = foldText(query.trim())
  const shown = skills.filter((s) => !q || foldText(`${s.title} ${s.description}`).includes(q))
  return (
    <>
      <ListHead label="compétences" count={skills.length}>
        <button className="btn small" onClick={() => api.openSkillsDir()}>
          ouvrir le dossier des compétences
        </button>
      </ListHead>
      <div className="list-tools">
        <SearchField className="framed" value={query} onChange={setQuery} placeholder="chercher une compétence" />
      </div>
      {shown.length ? (
        <div className="table-wrap">
          <table className="stable fixed">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>compétence</th>
                <th>ce qu’elle couvre</th>
                <th style={{ width: 90 }}>
                  <span className="sr-only">origine</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.name}>
                  <td>
                    <span className="hi ell">{s.title}</span>
                  </td>
                  <td className="small dim" title={s.description}>
                    <span className="ell">{s.description}</span>
                  </td>
                  <td className="small muted">{s.builtin ? 'intégrée' : 'la vôtre'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small dim empty">{skills.length ? 'Aucune compétence ne correspond.' : 'aucune compétence'}</p>
      )}
    </>
  )
}

export function AboutPane() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const update = useLive<UpdateState>(api.getUpdateState, api.onUpdate)
  useEffect(() => void api.getInfo().then(setInfo), [])
  const status = update
    ? {
        idle: '',
        checking: 'recherche d’une nouvelle version…',
        available: `la version ${update.latest} est disponible`,
        downloading: `téléchargement de la version ${update.latest} : ${update.percent ?? 0} %`,
        downloaded: `la version ${update.latest} est prête, redémarrez pour l’installer`,
        latest: 'c’est la dernière version',
        error: update.error ?? 'la recherche a échoué',
        disabled: 'pas de mise à jour automatique pour cette version de développement'
      }[update.status]
    : ''
  const working = update?.status === 'checking' || update?.status === 'downloading'
  return (
    <>
      <p className="psub">
        Marianne est un projet indépendant, sans lien avec l’État ni avec aucune administration. Elle vous aide à comprendre et à préparer vos démarches, sans
        remplacer l’administration ni un conseil juridique.
      </p>
      <div className="about-version">
        <Logo size={40} />
        <span className="grow">
          <span className="big">Marianne {info?.version}</span>
          {status && <span className={`small ${update?.status === 'error' ? 'bad' : 'dim'}`}>{status}</span>}
        </span>
        {update?.status === 'available' ? (
          <button className="btn primary" onClick={() => api.downloadUpdate()}>
            télécharger
          </button>
        ) : update?.status === 'downloaded' ? (
          <button className="btn primary" onClick={() => api.installUpdate()}>
            redémarrer
          </button>
        ) : (
          <button className="btn" disabled={working || update?.status === 'disabled'} aria-busy={working} onClick={() => api.checkForUpdates()}>
            {working && <Spinner />}
            vérifier les mises à jour
          </button>
        )}
      </div>
      <div className="rows">
        <div className="row">
          <span>données de cet ordinateur</span>
          {info ? <ArchivePath path={info.dataDir} boxed /> : <span />}
          <span />
        </div>
        <div className="row">
          <span>code source</span>
          <button className="link" title={REPO_URL} onClick={() => api.openExternal(REPO_URL)}>
            {REPO_URL.replace(/^https:\/\//, '')} ↗
          </button>
          <span />
        </div>
        <div className="row">
          <span>auteurs</span>
          <Authors />
          <span />
        </div>
        <div className="row">
          <span>licence</span>
          <span className="dim">MIT</span>
          <span />
        </div>
      </div>
    </>
  )
}
