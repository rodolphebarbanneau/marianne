import { useEffect, useMemo, useRef, useState } from 'react'
import type { Procedure } from '@marianne/content'
import { DOMAINS } from '@marianne/profile'
import { foldText, serviceCode, serviceMatches } from '@marianne/sdk'
import { api } from '../lib/api'
import { plainKey } from '../lib/keys'
import { useServices } from '../host'
import { SETTINGS_PAGES } from '../settings/pages'
import { useShortcutLabel, type Actions } from './commands'
import { useApp, type PaletteMode } from './context'

/**
 * The three keyboard dialogs, after Omarchy: commands (ctrl+k, each with its shortcut), the
 * application menu (ctrl+space, the Minitel's SOMMAIRE, in levels), and search everywhere
 * (ctrl+shift+enter, the magnifier). A search bar on top; arrows, Entrée, Échap.
 */

interface Row {
  label: string
  right?: string
  /** Shown as a key ("ctrl+k"). */
  kbd?: string
  badge?: string
  group?: string
  ask?: boolean
  always?: boolean
  /** Found by more than its label (a service by its keywords). */
  match?: (query: string) => boolean
  children?: () => Node[]
  run?: () => void
}

interface Node {
  label: string
  key?: string
  children?: () => Node[]
  run?: () => void
}

const TITLES: Record<PaletteMode, { tag: string; placeholder: string }> = {
  commands: { tag: 'COMMANDES', placeholder: 'tapez une commande…' },
  menu: { tag: 'MENU', placeholder: 'tapez pour filtrer…' },
  search: { tag: 'RECHERCHE', placeholder: 'dossiers, démarches, services, réglages… ou un code : METEO' }
}

export function Palette({ actions }: { actions: Actions }) {
  const app = useApp()
  const mode = app.palette!
  const label = useShortcutLabel()
  const [query, setQuery] = useState('')
  const [path, setPath] = useState<Node[]>([])
  const [sel, setSel] = useState(0)
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const allServices = useServices()
  const services = useMemo(() => allServices.filter((s) => s.on), [allServices])
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => void api.listProcedures().then(setProcedures), [])
  useEffect(() => {
    setQuery('')
    setPath([])
    setSel(0)
    input.current?.focus()
  }, [mode])

  const close = () => app.openPalette(null)
  const run = (fn?: () => void) => () => {
    close()
    fn?.()
  }

  const menu = useMemo<Node[]>(
    () => [
      { label: 'Marianne · nouvelle conversation', key: 'marianne', run: actions.marianne },
      {
        label: 'Démarches',
        children: () =>
          DOMAINS.map((d) => ({
            label: d.label,
            children: () => [
              { label: `Tous les dossiers ${d.label.toLowerCase()}`, run: actions.procedures },
              ...procedures.filter((p) => p.domain === d.id).map((p) => ({ label: p.title, run: () => startProcedure(p) }))
            ]
          }))
      },
      {
        label: 'Services',
        children: () => services.map(({ manifest: m }) => ({ label: `${serviceCode(m)} · ${m.name}`, run: () => app.go({ kind: 'service', id: m.id }) }))
      },
      {
        label: 'Dossiers',
        children: () => app.folders.filter((f) => !f.settledAt).map((f) => ({ label: f.title, run: () => app.go({ kind: 'folder', id: f.id }) }))
      },
      { label: 'Réglages', key: 'settings', children: () => SETTINGS_PAGES.map((p) => ({ label: p.label, run: () => app.openSettings(p.id) })) },
      { label: 'Mises à jour', run: actions.updates },
      {
        label: 'Compte',
        children: () => [
          { label: 'Changer de compte', run: actions.account },
          { label: 'Verrouiller la session', key: 'lock', run: actions.lock }
        ]
      },
      { label: 'Commandes', key: 'commands', run: () => app.openPalette('commands') },
      { label: 'À propos de Marianne', run: actions.updates }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions, procedures, services, app.folders]
  )

  function startProcedure(p: Procedure) {
    app.setSeed({ text: '', attachments: [], procedure: p.id })
    app.goPage('home')
  }

  const rows = useMemo<Row[]>(() => {
    if (mode === 'commands') {
      const cmd = (id: keyof Actions, text: string, shortcut = id as string): Row => ({
        label: text,
        kbd: shortcut ? label(shortcut) : undefined,
        run: actions[id]
      })
      return [
        cmd('marianne', 'Parler à Marianne : nouveau dossier'),
        cmd('procedures', 'Aller aux Démarches'),
        cmd('services', 'Aller aux Services'),
        cmd('next', 'Page suivante'),
        cmd('prev', 'Page précédente'),
        cmd('search', 'Chercher partout'),
        cmd('menu', 'Ouvrir le menu'),
        cmd('settings', 'Ouvrir les réglages'),
        cmd('shortcuts', 'Modifier les raccourcis clavier', ''),
        cmd('sidebar', 'Replier ou déplier la barre latérale'),
        cmd('browser', 'Ouvrir ou fermer le navigateur du dossier', ''),
        cmd('lock', 'Verrouiller la session'),
        cmd('account', 'Changer de compte', ''),
        cmd('fullscreen', 'Plein écran'),
        cmd('reload', 'Recharger la fenêtre'),
        cmd('guide', 'Aide et à propos de Marianne'),
        cmd('updates', 'Vérifier les mises à jour', '')
      ]
    }
    if (mode === 'menu') {
      const level = path.length ? path[path.length - 1].children!() : menu
      return level.map((n) => ({
        label: n.label,
        right: n.children ? '▸' : undefined,
        kbd: !n.children && n.key ? label(n.key) : undefined,
        children: n.children,
        run: n.run
      }))
    }
    const q = query.trim()
    return [
      ...app.folders.map((f) => ({
        group: 'dossiers',
        badge: DOMAINS.find((d) => d.id === f.domain)?.badge ?? '··',
        label: f.title,
        right: f.settledAt ? 'classé' : f.status === 'approval' ? 'votre accord' : '',
        run: () => app.go({ kind: 'folder', id: f.id })
      })),
      ...procedures.map((p) => ({
        group: 'démarches',
        badge: DOMAINS.find((d) => d.id === p.domain)?.badge,
        label: p.title,
        right: 'démarche',
        run: () => startProcedure(p)
      })),
      ...services.map(({ manifest: m }) => ({
        group: 'services',
        badge: '··',
        label: `${serviceCode(m)} · ${m.name}`,
        right: 'service',
        match: (q: string) => serviceMatches(m, q),
        run: () => app.go({ kind: 'service', id: m.id })
      })),
      ...SETTINGS_PAGES.map((p) => ({ group: 'réglages', badge: '⚙', label: p.label, right: 'réglages', run: () => app.openSettings(p.id) })),
      {
        badge: 'M',
        label: `demander à Marianne : « ${q || '…'} »`,
        right: 'entrée',
        ask: true,
        always: true,
        run: () => {
          app.setSeed({ text: q, attachments: [] })
          app.goPage('home')
        }
      }
    ]
  }, [mode, path, menu, query, app, procedures, services, actions, label])

  const q = foldText(query.trim())
  const shown = rows.filter((r) => r.always || !q || foldText(r.label).includes(q) || foldText(r.group ?? '').includes(q) || !!r.match?.(q))
  const at = Math.min(sel, Math.max(0, shown.length - 1))

  const open = (r: Row) => {
    if (r.children) {
      setPath([...path, { label: r.label, children: r.children }])
      setQuery('')
      setSel(0)
      return input.current?.focus()
    }
    run(r.run)()
  }

  useEffect(() => {
    list.current?.querySelector('.pr.on')?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return (e.preventDefault(), e.stopPropagation(), close())
    if (e.key === 'ArrowDown') return (e.preventDefault(), setSel(Math.min(at + 1, shown.length - 1)))
    if (e.key === 'ArrowUp') return (e.preventDefault(), setSel(Math.max(at - 1, 0)))
    if (plainKey(e, 'Enter')) return (e.preventDefault(), shown[at] && open(shown[at]))
    if (e.key === 'Backspace' && mode === 'menu' && !query && path.length) return (e.preventDefault(), setPath(path.slice(0, -1)), setSel(0))
  }

  let group: string | undefined
  return (
    <>
      <div className="palette-backdrop" onMouseDown={close} />
      <div className="palette" onKeyDown={onKey}>
        <div className="phead">
          <span className="code">{TITLES[mode].tag}</span>
          <input ref={input} value={query} placeholder={TITLES[mode].placeholder} spellCheck={false} onChange={(e) => (setQuery(e.target.value), setSel(0))} />
        </div>
        {mode === 'menu' && <div className="crumbs">{['Menu', ...path.map((n) => n.label)].join(' › ')}</div>}
        <div className="plist" ref={list}>
          {shown.map((r, i) => {
            const head = r.group && r.group !== group ? (group = r.group) : null
            return (
              <div key={`${r.group ?? ''}${r.label}${i}`}>
                {head && <span className="label group">{head}</span>}
                <button
                  className={`pr${mode === 'search' ? ' with-badge' : ''}${i === at ? ' on' : ''}${r.ask ? ' ask' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => open(r)}
                >
                  {mode === 'search' && <span className={`badge${r.badge && r.badge !== '··' ? '' : ' none'}`}>{r.badge ?? '··'}</span>}
                  <span>{r.label}</span>
                  <span className="right">{r.kbd ? <span className="kbd">{r.kbd}</span> : r.right}</span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="pfoot">↑↓ choisir · entrée ouvrir · échap fermer{mode === 'menu' ? ' · retour arrière : niveau précédent' : ''}</div>
      </div>
    </>
  )
}
