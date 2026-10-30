import { PAGES, PAGE_LABELS, useApp, type PageId } from '../app/context'
import { useShortcutLabel } from '../app/commands'

/** The way down to the next page, at the bottom of the Marianne page. */
export function NextArrow({ page }: { page: PageId }) {
  const app = useApp()
  const label = useShortcutLabel()
  const next = PAGES[PAGES.indexOf(page) + 1]
  return (
    <div className="next-row">
      {next && (
        <button className="next" onClick={() => app.goPage(next)}>
          <span className="arrow">▼</span>
          {PAGE_LABELS[next]}
          <span className="sc">{label('next')}</span>
        </button>
      )}
    </div>
  )
}
