import { useEffect, useState } from 'react'
import type { BrowserState } from '@shared/types'
import { useConfig, useDisplay } from '../app/hooks'
import { Dropdown } from '../components/dropdown'
import { MARK, Mosaic } from '../components/mosaic'
import { FKey, Spinner, TitleBar, useWindowFocus } from '../components/ui'

const api = window.marianne

/**
 * The built-in browser's toolbar. The website itself is a separate, sandboxed view below it,
 * drawn by the main process: this page never sees it, it only drives it.
 */
export function BrowserBar() {
  useWindowFocus()
  const [config] = useConfig()
  useDisplay(config)
  const [state, setState] = useState<BrowserState | null>(null)
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    void api.getBrowserState().then(setState)
    return api.onBrowserState(setState)
  }, [])
  useEffect(() => {
    if (!editing) setAddress(state?.url ?? '')
  }, [state?.url, editing])

  const logins = state?.logins ?? []
  const host = (() => {
    try {
      return new URL(state?.url ?? '').hostname
    } catch {
      return ''
    }
  })()

  return (
    <div className="browser-bar">
      <TitleBar>
        <Mosaic rows={MARK} scale={0.62} title="Marianne" />
        <b>NAVIGATEUR</b>
        <span className="muted">·</span>
        <span>{state?.title || host || 'page vide'}</span>
      </TitleBar>
      <div className="browser-tools">
        <button className="nav-btn" onClick={() => api.browserBack()} disabled={!state?.canGoBack} title="page précédente">
          ←
        </button>
        <button className="nav-btn" onClick={() => api.browserForward()} disabled={!state?.canGoForward} title="page suivante">
          →
        </button>
        <button className="nav-btn" onClick={() => api.browserReload()} title="recharger">
          {state?.loading ? <Spinner /> : '↻'}
        </button>
        <input
          value={address}
          onFocus={(e) => {
            setEditing(true)
            e.currentTarget.select()
          }}
          onBlur={() => setEditing(false)}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              api.browserNavigate(address)
              e.currentTarget.blur()
            }
          }}
          spellCheck={false}
          placeholder="adresse, ou recherche sur service-public"
        />
        {state?.notice && <span className="notice">{state.notice}</span>}
        {logins.length === 1 && (
          <FKey onClick={() => api.browserFill(logins[0].id)} title={`remplir avec ${logins[0].label} (${logins[0].username})`}>
            remplir
          </FKey>
        )}
        {logins.length > 1 && (
          <Dropdown
            value=""
            onChange={(id) => id && api.browserFill(id)}
            options={[{ value: '', label: 'remplir avec…' }, ...logins.map((l) => ({ value: l.id, label: `${l.label} · ${l.username}` }))]}
          />
        )}
        <FKey primary onClick={() => api.browserSendToChat()} disabled={!state?.url} title="envoyer le texte de cette page à la conversation">
          envoyer au dialogue
        </FKey>
        <button className="nav-btn" onClick={() => api.browserOpenExternal()} title="ouvrir dans le navigateur du système">
          ↗
        </button>
      </div>
    </div>
  )
}
