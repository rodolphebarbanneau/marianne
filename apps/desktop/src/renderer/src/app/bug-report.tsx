import { useEffect, useRef, useState } from 'react'
import { bugReportMarkdown, bugReportUrl, type BugReport } from '@shared/bug-report'
import { ENGINE_LABELS } from '@shared/config'
import { Field, Modal, Spinner } from '../components/ui'
import { api, errorText } from '../lib/api'
import { recentErrors } from '../lib/errors'
import { useDialogEnter } from '../lib/keys'
import { useApp } from './context'
import type { View } from './routes'

/**
 * « signaler un bug », from the bug at the top right: the user says what they saw, their engine
 * reads it with the app's diagnostics and writes the report (main/bug-reporter.ts), the user reads
 * it all and opens it on GitHub's bug form, where they read it again before publishing it. Nothing
 * is sent from here.
 */

type Step = { kind: 'write' } | { kind: 'working'; analyze: boolean } | { kind: 'review'; report: BugReport } | { kind: 'opened'; shortened: boolean }

/** Where the user is, as the diagnostics say it: no address, no name, only the screen. */
function screenOf(view: View, settingsPage: string | null): string {
  if (settingsPage) return `settings ${settingsPage}`
  if (view.kind === 'page') return `page ${view.page}`
  if (view.kind === 'domain') return `domain ${view.id}${view.tab ? `, tab ${view.tab}` : ''}`
  if (view.kind === 'service') return `service ${view.id}`
  return 'folder'
}

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mh">
      <span className="t">{title}</span>
      <button className="btn small" onClick={onClose}>
        fermer ✕
      </button>
    </div>
  )
}

/** Seconds since the analysis began: it can take a minute, and the user sees it moving. */
function Elapsed() {
  const [since] = useState(() => Date.now())
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="muted">{Math.floor((Date.now() - since) / 1000)} s</span>
}

export function BugReportDialog({ onClose }: { onClose: () => void }) {
  const app = useApp()
  const engineId = app.config.engines.default
  const engine = ENGINE_LABELS[engineId]
  const ready = app.config.engines[engineId].enabled && !!app.lights.find((l) => l.id === engineId)?.ok
  const [step, setStep] = useState<Step>({ kind: 'write' })
  const [words, setWords] = useState('')
  const [analyze, setAnalyze] = useState(ready)
  const [copied, setCopied] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // Taken when the dialog opens: what was on screen when the user reached for the bug.
  const [where] = useState(() => ({ screen: screenOf(app.view, app.settingsPage), folderId: app.view.kind === 'folder' ? app.view.id : undefined }))
  const open = useRef(true)
  useEffect(
    () => () => {
      open.current = false
    },
    []
  )

  const prepare = () => {
    if (!words.trim()) return
    const asked = analyze && ready
    setFailure(null)
    setStep({ kind: 'working', analyze: asked })
    api
      .prepareBugReport({ description: words, ...where, errors: recentErrors(), analyze: asked })
      .then((report) => open.current && setStep({ kind: 'review', report }))
      // Never a report the app could not scrub: back to the words, with what went wrong.
      .catch((err: Error) => {
        if (!open.current) return
        setFailure(errorText(err))
        setStep({ kind: 'write' })
      })
  }
  const close = () => {
    // Closed while the engine works: it stops, and what it would have written is lost with the dialog.
    if (step.kind === 'working') api.cancelBugReport()
    onClose()
  }
  const report = step.kind === 'review' ? step.report : null
  const edit = (patch: Partial<BugReport>) => report && setStep({ kind: 'review', report: { ...report, ...patch } })
  const sent = report ? bugReportUrl(report) : null
  const publish = () => {
    if (!report || !sent || !report.title.trim()) return
    api.openExternal(sent.url)
    setStep({ kind: 'opened', shortened: sent.shortened })
  }
  const copy = () => {
    if (!report) return
    void navigator.clipboard.writeText(bugReportMarkdown(report)).then(() => {
      setCopied(true)
      setTimeout(() => open.current && setCopied(false), 2000)
    })
  }
  // Not on the report: Entrée in its title must not open the browser; that is « ouvrir sur GitHub »'s alone.
  useDialogEnter(step.kind === 'write' && words.trim() ? prepare : step.kind === 'opened' ? onClose : null)

  return (
    <Modal wide onClose={close} label="signaler un bug">
      {step.kind === 'write' && (
        <>
          <Head title="SIGNALER UN BUG" onClose={close} />
          <div className="in bug-report">
            <p>
              Dites ce que vous avez vu. {ready ? `${engine} en fera` : 'Marianne en fera'} un rapport pour ceux qui développent Marianne : ce qui s’est passé,
              comment le refaire, d’où cela peut venir.
            </p>
            <Field label="ce qui s’est passé">
              <textarea
                className="words"
                autoFocus
                value={words}
                onChange={(e) => setWords(e.target.value)}
                placeholder="ce que vous faisiez, ce que vous attendiez, ce que Marianne a fait à la place"
              />
            </Field>
            {failure && (
              <p className="state-line bad" role="alert">
                ✗ Le rapport n’a pas pu être préparé : {failure}
              </p>
            )}
            <label className={`check${ready ? '' : ' dim'}`}>
              <input type="checkbox" checked={analyze && ready} disabled={!ready} onChange={(e) => setAnalyze(e.target.checked)} />
              {ready
                ? `faire analyser par ${engine}, sans outil ni web : vos mots, l’écran, les dernières erreurs, le déroulé de ce dossier sans vos messages, la fin du journal`
                : `${engine} n’est pas prêt (Réglages › Moteurs) : le rapport se fera sans analyse`}
            </label>
            <div className="box-note small">
              Rien ne part d’ici. Le rapport s’ouvre sur GitHub, où vous le relisez avant de le publier. Il sera public : Marianne en retire d’abord ce qu’elle
              sait être personnel, et n’écrivez pas de nom, d’adresse ni de numéro.
            </div>
          </div>
          <div className="foot">
            <button className="btn" onClick={close}>
              annuler
            </button>
            <button className="btn primary" disabled={!words.trim()} onClick={prepare}>
              {analyze && ready ? 'analyser' : 'préparer le rapport'}
            </button>
          </div>
        </>
      )}

      {step.kind === 'working' && (
        <>
          <Head title="SIGNALER UN BUG" onClose={close} />
          <div className="in bug-report">
            <p className="state-line" role="status">
              <Spinner /> {step.analyze ? `${engine} lit le journal et écrit le rapport` : 'Marianne prépare le rapport'} <Elapsed />
            </p>
            {step.analyze && <p className="small dim">D’habitude moins d’une minute. Sans outil ni web : il ne lit que ce qu’on lui donne.</p>}
          </div>
          <div className="foot">
            <span />
            {step.analyze && (
              <button className="btn" onClick={() => api.cancelBugReport()}>
                arrêter
              </button>
            )}
          </div>
        </>
      )}

      {report && sent && (
        <>
          <Head title="RAPPORT DE BUG" onClose={close} />
          <div className="in bug-report">
            {report.problem ? (
              <p className="state-line bad" role="alert">
                ✗ {report.problem}
              </p>
            ) : (
              report.analyzedBy && (
                <p className="small dim">Écrit par {report.analyzedBy}, en anglais comme les tickets du projet. Vos mots restent les vôtres.</p>
              )
            )}
            <Field label="titre">
              <input value={report.title} onChange={(e) => edit({ title: e.target.value })} />
            </Field>
            <Field label="ce qui s’est passé">
              <textarea value={report.what} onChange={(e) => edit({ what: e.target.value })} />
            </Field>
            {(report.analyzedBy || report.steps) && (
              <Field label="étapes pour le refaire">
                <textarea value={report.steps} onChange={(e) => edit({ steps: e.target.value })} />
              </Field>
            )}
            {(report.analyzedBy || report.analysis) && (
              <Field label="analyse">
                <textarea className="analysis" value={report.analysis} onChange={(e) => edit({ analysis: e.target.value })} />
              </Field>
            )}
            <Field label="diagnostic" hint={`Marianne ${report.version} · ${report.system} · ${report.engine}`}>
              <textarea className="diagnostics" value={report.diagnostics} onChange={(e) => edit({ diagnostics: e.target.value })} />
            </Field>
            <div className="box-note small">
              Relisez tout : vous pouvez tout modifier, et retirer ce qui vous paraît personnel. « ouvrir sur GitHub » ouvre le formulaire de bug du projet,
              rempli ; il faut un compte GitHub pour le publier.
              {sent.shortened && ' Trop long pour un lien, le rapport y est raccourci : « copier » le garde en entier.'}
            </div>
          </div>
          <div className="foot">
            <button className="link small" onClick={() => setStep({ kind: 'write' })}>
              ‹ reprendre ma description
            </button>
            <span className="row-flex" style={{ gap: 8 }}>
              <button className="btn" onClick={copy}>
                {copied ? 'copié ✓' : 'copier'}
              </button>
              <button className="btn primary" disabled={!report.title.trim()} onClick={publish}>
                ouvrir sur GitHub ↗
              </button>
            </span>
          </div>
        </>
      )}

      {step.kind === 'opened' && (
        <>
          <Head title="SIGNALER UN BUG" onClose={onClose} />
          <div className="in bug-report">
            <p>Le formulaire est ouvert dans votre navigateur. Relisez-le, puis « Create » le publie. Merci : c’est ainsi que Marianne avance.</p>
            {step.shortened && <p className="small dim">Il y est raccourci : collez le rapport copié dans un commentaire pour le donner en entier.</p>}
          </div>
          <div className="foot">
            <span />
            <button className="btn primary" onClick={onClose}>
              fermer
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
