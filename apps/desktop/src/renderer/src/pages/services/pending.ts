import type { ServiceFileReview } from '@shared/catalogue'

/**
 * A .3615 file opened from the system (a double click), waiting for the Services page to show its
 * review: the shell hands it over and opens the page, the page takes it.
 */

let pending: ServiceFileReview | null = null
const listeners = new Set<() => void>()

export function offerFileReview(review: ServiceFileReview): void {
  pending = review
  for (const listener of listeners) listener()
}

export function takeFileReview(): ServiceFileReview | null {
  const review = pending
  pending = null
  return review
}

export function onFileReview(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
