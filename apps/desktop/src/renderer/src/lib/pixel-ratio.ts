import { useEffect, useState } from 'react'

/**
 * Screen pixels per CSS pixel, kept current (another display, a zoom). What is drawn in whole
 * screen pixels (the logo, the accounts' mosaics) lays itself out with it: at 125 %, edges laid out
 * in CSS pixels fall between two screen pixels, and round unevenly.
 */
export function usePixelRatio(): number {
  const [ratio, setRatio] = useState(window.devicePixelRatio)
  useEffect(() => {
    const query = matchMedia(`(resolution: ${ratio}dppx)`)
    const update = () => setRatio(window.devicePixelRatio)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [ratio])
  return ratio
}
