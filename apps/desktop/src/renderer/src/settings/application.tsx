import { useEffect, useState } from 'react'
import { accelOf, pressedAccel, SHORTCUTS, shortcutLabel } from '@shared/shortcuts'
import type { AppInfo, UpdateState } from '@shared/types'
import { useApp } from '../app/context'
import { api, isMac, useLive } from '../lib/api'

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
        <span>police</span>
        <label>
          <input type="checkbox" checked={ui.pixelFont} onChange={(e) => void setConfig({ ui: { pixelFont: e.target.checked } })} />
          police à pixels partout
        </label>
        <span />
      </div>
      <div className="row">
        <span>écran</span>
        <label>
          <input type="checkbox" checked={ui.crt} onChange={(e) => void setConfig({ ui: { crt: e.target.checked } })} />
          effets écran (lignes, lueur)
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
      <div className="note">
        Cliquez sur un raccourci, puis appuyez sur la nouvelle combinaison (échap pour annuler). ctrl devient cmd sur macOS. Ils ne marchent que dans Marianne.
      </div>
      {groups.map((g) => (
        <div key={g}>
          <span className="label sub">{g}</span>
          <div className="rows">
            {SHORTCUTS.filter((s) => s.group === g).map((s) => {
              const accel = accelOf(s.id, isMac, config.shortcuts)
              const clash = SHORTCUTS.find((o) => o.id !== s.id && accelOf(o.id, isMac, config.shortcuts) === accel)
              return (
                <div key={s.id} className="row">
                  <span>{s.label}</span>
                  <span>
                    <button className={`btn small${recording === s.id ? ' primary' : ''}`} onClick={() => setRecording(recording === s.id ? null : s.id)}>
                      {recording === s.id ? 'appuyez sur les touches… (échap pour annuler)' : shortcutLabel(accel, isMac)}
                    </button>
                    {clash && <span className="small accent"> déjà pour « {clash.label} »</span>}
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
      <button className="btn" onClick={() => reset()}>
        tout remettre par défaut
      </button>
    </>
  )
}

export function SkillsPane() {
  const skills = useLive(api.listSkills, () => () => undefined) ?? []
  return (
    <>
      <div className="note">
        Les compétences sont des fiches que Marianne consulte quand le sujet s’y prête (impôts, délais et recours, droit du travail…). Vous pouvez en ajouter
        les vôtres.
      </div>
      <div className="rows">
        {skills.map((s) => (
          <div key={s.name} className="row">
            <span className="hi">{s.title}</span>
            <span className="small dim">{s.description}</span>
            <span className="small muted">{s.builtin ? 'intégrée' : 'la vôtre'}</span>
          </div>
        ))}
      </div>
      <button className="btn" onClick={() => api.openSkillsDir()}>
        ouvrir le dossier des compétences
      </button>
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
        checking: 'recherche…',
        available: `version ${update.latest} disponible`,
        downloading: `téléchargement ${update.percent ?? 0} %`,
        downloaded: `version ${update.latest} prête : redémarrer pour l’installer`,
        latest: 'à jour',
        error: update.error ?? 'erreur',
        disabled: 'pas de mise à jour automatique pour cette version de développement'
      }[update.status]
    : ''
  return (
    <div className="rows">
      <div className="row">
        <span>version</span>
        <span>
          {info?.version} <span className="dim small">{status}</span>
        </span>
        {update?.status === 'available' ? (
          <button className="btn small primary" onClick={() => api.downloadUpdate()}>
            télécharger
          </button>
        ) : update?.status === 'downloaded' ? (
          <button className="btn small primary" onClick={() => api.installUpdate()}>
            redémarrer
          </button>
        ) : (
          <button className="btn small" onClick={() => api.checkForUpdates()}>
            vérifier
          </button>
        )}
      </div>
      <div className="row">
        <span>données de cet ordinateur</span>
        <span className="path">{info?.dataDir}</span>
        <span />
      </div>
      <div className="row">
        <span>licence</span>
        <span className="dim">MIT</span>
        <span />
      </div>
      <div className="row">
        <span>statut</span>
        <span className="dim">
          Marianne est un projet indépendant, sans lien avec l’État ni avec aucune administration. Elle aide à comprendre et à préparer ; elle ne remplace ni
          l’administration, ni un conseil juridique.
        </span>
        <span />
      </div>
    </div>
  )
}
