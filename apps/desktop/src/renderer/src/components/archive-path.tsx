import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon } from './icons'

/**
 * Where an archive is (its file, the folder of the archives) or Marianne's data, offered to copy
 * on hover. Written in full, wrapping after its separators when it doesn't fit; `truncate` keeps
 * it on one line instead, capped in length and cut at its start behind "…" to keep the file's
 * name, the whole of it under the pointer.
 */
export function ArchivePath({ path, boxed = false, truncate = false, className }: { path: string; boxed?: boolean; truncate?: boolean; className?: string }) {
  const text = useRef<HTMLSpanElement>(null)
  const [cut, setCut] = useState(false)
  const [copied, setCopied] = useState(false)

  useLayoutEffect(() => {
    const el = text.current
    if (!el || !truncate) return setCut(false)
    const measure = () => setCut(el.scrollWidth > el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [path, truncate])

  const copy = () =>
    void navigator.clipboard.writeText(path).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })

  return (
    <span className={['archive-path', boxed && 'path', truncate && 'truncate', className].filter(Boolean).join(' ')} title={cut ? path : undefined}>
      <span ref={text} className="text">
        <bdi>{truncate ? path : breakable(path)}</bdi>
      </span>
      <button type="button" className="copy" title={copied ? 'chemin copié' : 'copier le chemin'} onClick={copy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </span>
  )
}

/** The path with a break allowed after each separator: a long one wraps between folders, not inside their names. */
const breakable = (path: string) =>
  path.split(/(?<=[\\/])/).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {part}
    </Fragment>
  ))
