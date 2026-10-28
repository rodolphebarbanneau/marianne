import { useApp } from '../app/context'
import { Composer } from '../folder/composer'
import { useProfile } from '../lib/profile'
import { NextArrow } from './next'

const STARTERS = ['préparer ma déclaration de revenus', 'mes échéances du mois', 'vérifier une information', 'renouveler ma carte d’identité']

/** Marianne: a new, empty folder. The pages below are reached with the arrow, SUITE or the title bar. */
export function HomePage() {
  const app = useApp()
  const profile = useProfile()
  const firstName = profile?.person.firstNames.split(/[\s,]+/)[0] ?? ''
  return (
    <div className="page">
      <div className="page-body">
        <div className="hero">
          <h2>Bonjour{firstName ? ` ${firstName}` : ''}, que faisons-nous ?</h2>
          <Composer autoFocus placeholder="Écrivez à Marianne : une démarche, une question, un document…" />
          <div className="chips">
            {STARTERS.map((s) => (
              <button key={s} className="chip" onClick={() => app.setSeed({ text: s, attachments: [] })}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <NextArrow page="home" />
    </div>
  )
}
