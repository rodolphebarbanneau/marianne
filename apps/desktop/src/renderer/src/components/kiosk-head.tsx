import { forwardRef, type KeyboardEvent, type ReactNode } from 'react'

/**
 * The head of a top-level page: a double frame, a line above the bar, the bar with its block and
 * ENVOI, a pixel art on the right. The Services page's, in the first place; Démarches and the
 * domains take it too, so that the pages read as one app. While one types, the block and the bar's
 * frame light up together.
 */
export const KioskHead = forwardRef<
  HTMLInputElement,
  {
    /** What stands above the bar: a question, or a domain's way back and name. */
    line: ReactNode
    /** The bar's block: 3615, GUICHET. */
    block: string
    placeholder: string
    query: string
    onQuery: (query: string) => void
    onEnvoi: () => void
    onKey: (e: KeyboardEvent<HTMLInputElement>) => void
    art: ReactNode
    /** The bar takes a sentence: what one writes keeps the normal font. */
    sentence?: boolean
    labelledBy?: string
    /** Said to a screen reader: how the bar works. */
    hint?: string
  }
>(function KioskHead({ line, block, placeholder, query, onQuery, onEnvoi, onKey, art, sentence, labelledBy, hint }, ref) {
  return (
    <div className="kiosk-head">
      <div>
        {line}
        <div className={`codebar${sentence ? ' q' : ''}`}>
          <span className="pre" aria-hidden>
            {block}
          </span>
          <label className="cfield">
            <input
              ref={ref}
              value={query}
              maxLength={sentence ? 2000 : 40}
              spellCheck={false}
              autoComplete="off"
              placeholder={placeholder}
              aria-labelledby={labelledBy}
              aria-describedby={hint ? 'kiosk-hint' : undefined}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={onKey}
            />
            <span className="cursor" aria-hidden />
          </label>
          {hint && (
            <span id="kiosk-hint" hidden>
              {hint}
            </span>
          )}
          <button className="envoi" onClick={onEnvoi}>
            ENVOI ↵
          </button>
        </div>
      </div>
      {art}
    </div>
  )
})
