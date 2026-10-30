import type { ServiceFileReview } from '@shared/catalogue'

/**
 * .3615 files opened from the system (a double click, several at once), waiting for the Services
 * page to show their reviews: the shell hands them over and opens the page, the page takes them
 * one at a time, the next once the review before is closed.
 */

const pending: ServiceFileReview[] = []
const listeners = new Set<() => void>()

export function offerFileReview(review: ServiceFileReview): void {
  pending.push(review)
  for (const listener of listeners) listener()
}

export function takeFileReview(): ServiceFileReview | null {
  return pending.shift() ?? null
}

export function onFileReview(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
