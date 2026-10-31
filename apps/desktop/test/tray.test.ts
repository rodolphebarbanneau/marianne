import { rmSync } from 'node:fs'
import type { Deadline } from '@marianne/profile'
import { afterAll, describe, expect, it, vi } from 'vitest'

/** A notification stays on the screen of whoever is there, a locked one included: it says when or what came of it, never what about. */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-tray-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

vi.mock('electron', () => ({ app: { on: () => undefined, isPackaged: false, getVersion: () => '0' } }))
vi.mock('../src/main/deadlines', () => ({ deadlines: () => [] }))
vi.mock('../src/main/profile/store', () => ({ profile: { on: () => undefined } }))

import { deadlineNotices, runNotice } from '../src/main/tray'

const NOW = new Date(2026, 9, 30, 9, 0)
const PLATE = 'AB-123-CD'
const deadline = (date: string, title: string): Deadline => ({ key: `k-${date}`, domain: 'mobility', title, date, source: 'rule', status: 'todo' })

describe('deadline notifications', () => {
  it('say when, and send the user to Marianne for what: a title may carry a plate', () => {
    const notices = deadlineNotices([deadline('2026-10-31', `contrôle technique du véhicule ${PLATE}`)], NOW)
    expect(notices).toEqual([{ title: 'Échéance demain · 31/10/2026', body: 'Ouvrez Marianne pour la voir.', silent: false }])
  })

  it('more than three in one summary, saying nothing of them either', () => {
    const due = ['2026-11-20', '2026-10-30', '2026-11-05', '2026-12-01'].map((d) => deadline(d, `contrôle technique du véhicule ${PLATE}`))
    const notices = deadlineNotices(due, NOW)
    expect(notices).toEqual([{ title: '4 échéances à venir', body: 'La prochaine aujourd’hui : ouvrez Marianne pour les voir.', silent: false }])
    expect(JSON.stringify(notices)).not.toContain(PLATE)
    expect(deadlineNotices([deadline('2026-11-29', 'x')], NOW)[0].silent).toBe(true)
  })
})

describe('a planned task’s notifications', () => {
  it('say what came of the run, never the task’s title', () => {
    expect(runNotice({ outcome: 'done' })).toEqual({ title: 'Rappel', body: 'Ouvrez Marianne pour le lire.', silent: false })
    expect(runNotice({ outcome: 'found' })).toEqual({ title: 'Une tâche a trouvé quelque chose', body: 'Ouvrez Marianne pour la voir.', silent: false })
    expect(runNotice({ outcome: 'waiting' }).title).toBe('Une tâche attend votre réponse')
    expect(runNotice({ outcome: 'failed' }).title).toBe('Une tâche n’a pas abouti')
    // A check that found nothing doesn't make a sound.
    expect(runNotice({ outcome: 'nothing' })).toMatchObject({ title: 'Rien à signaler', silent: true })
  })
})
