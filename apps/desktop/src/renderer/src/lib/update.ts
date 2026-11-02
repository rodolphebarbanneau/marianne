import type { UpdateState } from '@shared/types'

/** What the bottom bar says of a newer Marianne, and what its button does. */
export interface UpdateNotice {
  text: string
  action: { do: 'download' | 'install' | 'releases'; label: string } | null
}

/**
 * The bottom bar's word on a newer Marianne, the archive open or not: nothing while there is
 * nothing newer, so a user who never opens Réglages › À propos still sees it, signed in or not.
 */
export function updateNotice(u: UpdateState | null): UpdateNotice | null {
  if (!u?.latest || u.latest === u.current) return null
  switch (u.status) {
    case 'available':
      return { text: `Marianne ${u.latest} est disponible`, action: { do: 'download', label: 'télécharger' } }
    case 'downloading':
      return { text: `Marianne ${u.latest} : ${u.percent ?? 0} %`, action: null }
    case 'downloaded':
      return { text: `Marianne ${u.latest} est prête`, action: { do: 'install', label: 'redémarrer' } }
    // It can't get there by itself (a version not signed, GitHub out of reach midway): the page where it can be downloaded.
    case 'error':
      return { text: `Marianne ${u.latest} est disponible`, action: { do: 'releases', label: 'page des versions' } }
    default:
      return null
  }
}
