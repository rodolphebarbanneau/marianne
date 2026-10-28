import { useEffect, useState } from 'react'
import type { AppInfo, Config, Theme } from '@shared/types'
import { Dropdown } from '../../components/dropdown'
import { Action, Check, Row, Sep } from '../../components/ui'
import type { Update } from '../hooks'

const api = window.marianne

const THEMES: Array<{ value: Theme; label: string }> = [
  { value: 'minitel', label: 'minitel couleur' },
  { value: 'monochrome', label: 'minitel 1 (monochrome)' }
]

export function General({ config, update }: { config: Config; update: Update }) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => void api.getInfo().then(setInfo), [])
  const ui = config.ui
  return (
    <>
      <section>
        <Sep>écran</Sep>
        <Row label="thème" hint="minitel 1 : les huit couleurs en niveaux de gris, comme sur les premiers terminaux">
          <Dropdown<Theme> value={ui.theme} onChange={(theme) => void update({ ui: { theme } })} options={THEMES} />
        </Row>
        <Row label="police rétro" hint="police à pixels partout ; décochez pour une police plus nette sur les longs textes">
          <Check checked={ui.retroFont} onChange={(retroFont) => void update({ ui: { retroFont } })} />
        </Row>
        <Row label="effets écran" hint="lignes de balayage et lueur du phosphore, au-dessus de la trame à points">
          <Check checked={ui.crt} onChange={(crt) => void update({ ui: { crt } })} />
        </Row>
        <Row label="taille du texte" hint="taille de base de tout le texte">
          <Dropdown
            value={String(ui.textSize)}
            onChange={(v) => void update({ ui: { textSize: Number(v) } })}
            options={[16, 17, 18, 19, 20, 22, 24, 26].map((n) => ({ value: String(n), label: `${n} px` }))}
          />
        </Row>
      </section>

      <section>
        <Sep>arrière-plan</Sep>
        <Row
          label="démarrer avec le système"
          hint="marianne se lance à l’ouverture de session, dans la zone de notification, pour vous rappeler vos échéances (versions installées)"
        >
          <Check checked={config.background.launchAtLogin} onChange={(launchAtLogin) => void update({ background: { launchAtLogin } })} />
        </Row>
        <Row label="rappels d’échéances" hint="une notification 30 jours, 7 jours et la veille de chaque échéance de votre agenda">
          <Check checked={config.background.reminders} onChange={(reminders) => void update({ background: { reminders } })} />
        </Row>
        <p className="note">tant que l’une des deux est cochée, fermer la fenêtre garde marianne dans la zone de notification.</p>
      </section>

      <section>
        <Sep>données</Sep>
        <Row
          label="dossier"
          hint="dossier, documents et conversations chiffrés, trousseau, réglages, index des sources · modifiable avec la variable d’environnement MARIANNE_HOME"
          actions={<Action onClick={() => api.openDataDir()}>ouvrir</Action>}
        >
          <span className="dim">{info?.dataDir}</span>
        </Row>
      </section>
    </>
  )
}
