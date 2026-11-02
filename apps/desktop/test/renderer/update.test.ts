import { describe, expect, it } from 'vitest'
import { updateNotice } from '../../src/renderer/src/lib/update'
import type { UpdateState } from '../../src/shared/types'

const state = (patch: Partial<UpdateState>): UpdateState => ({ status: 'idle', current: '1.2.0', ...patch })

describe('the bottom bar’s word on a newer Marianne', () => {
  it('says nothing while there is nothing newer', () => {
    expect(updateNotice(null)).toBeNull()
    for (const status of ['idle', 'checking', 'latest', 'disabled'] as const) expect(updateNotice(state({ status }))).toBeNull()
    // Checking again after a version was found: the bar waits for what it finds.
    expect(updateNotice(state({ status: 'checking', latest: '1.3.0' }))).toBeNull()
    expect(updateNotice(state({ status: 'error', error: 'GitHub injoignable.' }))).toBeNull()
  })

  it('offers the one thing to do with it, as it goes', () => {
    expect(updateNotice(state({ status: 'available', latest: '1.3.0' }))).toEqual({
      text: 'Marianne 1.3.0 est disponible',
      action: { do: 'download', label: 'télécharger' }
    })
    expect(updateNotice(state({ status: 'downloading', latest: '1.3.0', percent: 42 }))).toEqual({ text: 'Marianne 1.3.0 : 42 %', action: null })
    expect(updateNotice(state({ status: 'downloaded', latest: '1.3.0' }))).toEqual({
      text: 'Marianne 1.3.0 est prête',
      action: { do: 'install', label: 'redémarrer' }
    })
  })

  it('sends to the page of the versions when it can’t get there by itself', () => {
    const unsigned = state({ status: 'error', latest: '1.3.0', error: 'Cette version n’est pas signée et ne peut pas se mettre à jour seule.' })
    expect(updateNotice(unsigned)?.action).toEqual({ do: 'releases', label: 'page des versions' })
  })
})
