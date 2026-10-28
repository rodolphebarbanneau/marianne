import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { errorText, formatNumber, useHost } from '@marianne/sdk/view'
import type { AssembleeMethods, DataStatus } from '../types'
import { Loading, megabytes, shortDate } from './common'

/**
 * The state of the open data (deputies, ballots, agenda): whether it is there, and its sync. While
 * a sync runs, the status is asked again every second.
 */

interface Data {
  status: DataStatus | null
  update(): void
}

const DataContext = createContext<Data | null>(null)

export function useData(): Data {
  const data = useContext(DataContext)
  if (!data) throw new Error('useData outside the view')
  return data
}

export function DataProvider({ children }: { children: ReactNode }) {
  const host = useHost<AssembleeMethods>()
  const [status, setStatus] = useState<DataStatus | null>(null)
  const [requested, setRequested] = useState(false)

  const load = useCallback(async () => {
    try {
      const s = await host.call('status')
      setStatus(s)
      if (!s.sync.running) setRequested(false)
    } catch (err) {
      host.toast(errorText(err))
      setRequested(false)
    }
  }, [host])

  useEffect(() => void load(), [load])

  const running = !!status?.sync.running
  useEffect(() => {
    if (!running && !requested) return
    const t = setInterval(() => void load(), 1000)
    return () => clearInterval(t)
  }, [running, requested, load])

  const update = useCallback(() => {
    setRequested(true)
    host
      .call('sync')
      .then(setStatus)
      .catch((err: unknown) => {
        host.toast(errorText(err))
        setRequested(false)
      })
  }, [host])

  return <DataContext.Provider value={{ status, update }}>{children}</DataContext.Provider>
}

/** What a running sync is doing, in French. */
function progressText(status: DataStatus): string {
  const p = status.sync.running
  if (!p) return ''
  if (p.phase === 'download') return `téléchargement… ${megabytes(p.done)}${p.total ? ` sur ${megabytes(p.total)}` : ''}`
  return `indexation… ${p.total ? Math.floor((p.done / p.total) * 100) : 0} %`
}

function Progress({ status }: { status: DataStatus }) {
  const p = status.sync.running
  const share = p?.total ? Math.min(1, p.done / p.total) : 0
  return (
    <div className="assemblee-progress">
      <span className="gauge">
        <i style={{ width: `${share * 100}%` }} />
      </span>
      <span className="small dim">{progressText(status)}</span>
    </div>
  )
}

/** The children once the open data is there; before, a way to download it. */
export function NeedsData({ children }: { children: ReactNode }) {
  const { status, update } = useData()
  if (!status) return <Loading />
  if (status.ready) return <>{children}</>
  return (
    <div className="box-note assemblee-sync">
      <p>
        Les députés, les scrutins et l’agenda viennent des données ouvertes de l’Assemblée nationale, gardées sur cet ordinateur et mises à jour chaque jour.
        Elles ne sont pas encore téléchargées (une quarantaine de Mo).
      </p>
      {status.sync.running ? (
        <Progress status={status} />
      ) : (
        <>
          {status.sync.error && <p className="bad">La dernière mise à jour a échoué : {status.sync.error}</p>}
          <p>
            <button className="btn primary" onClick={update}>
              mettre à jour
            </button>
          </p>
        </>
      )}
    </div>
  )
}

/** One line at the foot of the view: what the index holds, and a way to update it. */
export function DataLine() {
  const { status, update } = useData()
  if (!status?.ready) return null
  const s = status.sync
  return (
    <p className="small dim assemblee-foot">
      données ouvertes de l’Assemblée nationale{s.syncedAt ? ` du ${shortDate(s.syncedAt)}` : ''} · {formatNumber(status.deputies)} députés,{' '}
      {formatNumber(status.ballots)} scrutins, {formatNumber(status.meetings)} réunions ·{' '}
      {s.running ? (
        progressText(status)
      ) : (
        <button className="link" onClick={update}>
          mettre à jour
        </button>
      )}
      {s.error && !s.running && <span className="bad"> · la dernière mise à jour a échoué : {s.error}</span>}
    </p>
  )
}
