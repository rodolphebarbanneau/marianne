import { fakeContext } from '@marianne/sdk/testing'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { service } from '../src/main'
import { tollTasks } from '../src/tasks'
import { CLIO, GRANTED, KANGOO } from './fixtures'

describe('the tasks 3615 PEAGE proposes', () => {
  it('proposes one per vehicle whose plate it was given', () => {
    const { ctx } = fakeContext(pkg, { profile: GRANTED })
    const list = service.activate(ctx).tasks?.() ?? []
    expect(list.map((t) => [t.id, t.entity])).toEqual([
      ['tolls:v1', { id: 'v1', label: 'AB-123-CD' }],
      ['tolls:v2', { id: 'v2', label: 'EF-456-GH' }]
    ])
  })

  it('proposes nothing without a plate: there is nothing to look for', () => {
    expect(tollTasks([{ id: 'v1' }])).toEqual([])
    const { ctx } = fakeContext(pkg, { profile: { granted: [], vehicles: [] } })
    expect(service.activate(ctx).tasks?.()).toEqual([])
  })

  it('reaches only the operators’ payment pages', () => {
    expect(tollTasks([CLIO])[0].sites).toEqual(['www.sanef.com', 'paiement.aliae.com'])
  })

  it('checks every 2 days by default, and warns that a week lets the 72 hours pass', () => {
    const [task] = tollTasks([CLIO])
    expect(task.rhythms[task.rhythm].label).toBe('tous les 2 jours')
    expect(task.rhythms[task.rhythm].note).toContain('si vous ouvrez Marianne')
    expect(task.rhythms.filter((r) => r.warn).map((r) => r.label)).toEqual(['chaque semaine'])
  })

  it('never pays, and names the vehicle by its id, never its plate, to the engine', () => {
    const [task] = tollTasks([KANGOO])
    expect(task.never).toContain('ne paie jamais')
    expect(task.instruction).toContain('vehicle v2')
    expect(task.instruction).not.toContain(KANGOO.plate!)
    expect(task.instruction).toMatch(/without paying/)
  })
})
