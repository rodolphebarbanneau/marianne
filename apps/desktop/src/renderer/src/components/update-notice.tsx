import { projectLinks } from '@shared/project'
import type { UpdateState } from '@shared/types'
import { api, useLive } from '../lib/api'
import { updateNotice } from '../lib/update'

/** A newer Marianne, in the bottom bar of the lock screen and of the app: its version and the one thing to do. */
export function UpdateNotice() {
  const update = useLive<UpdateState>(api.getUpdateState, api.onUpdate)
  const notice = updateNotice(update)
  if (!notice) return null
  const run = () => {
    if (notice.action?.do === 'download') api.downloadUpdate()
    else if (notice.action?.do === 'install') api.installUpdate()
    else if (notice.action?.do === 'releases') api.openExternal(projectLinks().find((l) => l.id === 'releases')!.url)
  }
  return (
    <span className="update-notice" role="status">
      <span className="what">{notice.text}</span>
      {notice.action && (
        <button className="btn small" onClick={run}>
          {notice.action.label}
        </button>
      )}
    </span>
  )
}
