import type { ReactNode } from 'react'
import { useApp } from './context'

/** The Minitel status row: connection, help or info, then function keys. */
export function Status({ info, keys, busy }: { info?: ReactNode; keys?: ReactNode; busy?: boolean }) {
  const { help, agent } = useApp()
  const ready = !!agent?.found && !!agent.loggedIn
  return (
    <div className="statusline">
      <span className={`conn ${busy ? 'busy' : ready ? 'on' : ''}`} title={ready ? 'agent connecté' : 'agent non connecté : réglages → agent'}>
        {ready || busy ? 'C' : 'F'}
      </span>
      <span className="help">{help || info}</span>
      {keys && <span className="keys">{keys}</span>}
    </div>
  )
}
