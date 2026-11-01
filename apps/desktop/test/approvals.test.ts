import { rmSync } from 'node:fs'
import type { Archive } from '@marianne/archive'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alwaysLabel, covers, decide, givenLabel, LEVELS, offerFor, ruleLabel, type ApprovalRequest } from '../src/shared/approvals'
import type { ApprovalLevel, ApprovalPart, ApprovalRule } from '../src/shared/types'

/**
 * The approval policy: what waits for a card, what the user allowed ahead (their level, the standing
 * permissions they gave with « toujours… »), and the floor nobody lowers; then the cards' answers
 * reaching the main process, and the line of what went without a card.
 */

// ~/.marianne points at a temporary folder, before paths.ts reads it.
const root = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const dir = mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'marianne-approvals-'))
  process.env.MARIANNE_HOME = dir
  return dir
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

import { accounts } from '../src/main/account'
import { approvals } from '../src/main/approvals'
import { session } from '../src/main/session'

const SITE = 'sanef.com'
const LEVEL_IDS: ApprovalLevel[] = ['ask', 'balanced', 'autonomous']
const rule = (action: ApprovalRule['action'], site?: string): ApprovalRule => ({ id: `${action}:${site ?? ''}`, action, site, at: '2026-10-30T08:00:00.000Z' })

const online = (more: { site?: string; known?: boolean; consented?: { site: boolean; folder: boolean }; followUp?: string } = {}): ApprovalRequest => ({
  action: 'online',
  site: SITE,
  known: false,
  consented: { site: false, folder: false },
  ...more
})
const form = (known = false, site = SITE, followUp?: string): ApprovalRequest => ({ action: 'form', site, known, ...(followUp ? { followUp } : {}) })
const profile = (deadline: boolean): ApprovalRequest => ({ action: 'profile', deadline })
const by = (request: ApprovalRequest, level: ApprovalLevel, rules: ApprovalRule[] = [], run = false) => decide(request, { level, rules }, run).by

/** Every standing permission there could be for SITE, and some that no card gives. */
const EVERY_RULE = [rule('online', SITE), rule('form', SITE), rule('profile'), { ...rule('online', SITE), action: 'commit' } as unknown as ApprovalRule]

describe('the floor', () => {
  it('a step that commits the user takes a card at every level, whatever is stored', () => {
    for (const level of LEVEL_IDS) expect(by({ action: 'commit' }, level, EVERY_RULE)).toBe('card')
    expect(offerFor({ action: 'commit' })).toBeNull()
  })

  it('planning a task, a community service’s call and adding a service too', () => {
    for (const level of LEVEL_IDS)
      for (const action of ['task', 'service', 'add'] as const) {
        expect(by({ action }, level, EVERY_RULE)).toBe('card')
        expect(offerFor({ action })).toBeNull()
      }
  })

  it('any change to the profile but a deadline added or updated, at every level, whatever is stored', () => {
    for (const level of LEVEL_IDS) expect(by(profile(false), level, EVERY_RULE)).toBe('card')
    expect(offerFor(profile(false))).toBeNull()
  })

  it('a rule of a kind no card gives covers nothing', () => {
    const forged = { ...rule('online', SITE), action: 'commit' } as unknown as ApprovalRule
    for (const request of [online(), form(), profile(true), { action: 'commit' } as const]) expect(covers(forged, request)).toBe(false)
  })

  it('a follow-up’s go-ahead lowers none of it, even said of a step that commits', () => {
    for (const level of LEVEL_IDS)
      for (const action of ['commit', 'task', 'service', 'add'] as const)
        expect(by({ action, followUp: 'payer maintenant' } as unknown as ApprovalRequest, level)).toBe('card')
    for (const level of LEVEL_IDS)
      expect(by({ action: 'profile', deadline: false, followUp: 'payer maintenant' } as unknown as ApprovalRequest, level)).toBe('card')
  })
})

describe('a planned task’s follow-up the user started', () => {
  const GO = 'payer maintenant'

  it('goes to its task’s sites and fills its service’s forms for that turn, but at « tout demander »', () => {
    expect(LEVEL_IDS.map((level) => by(online({ followUp: GO }), level))).toEqual(['card', 'followUp', 'followUp'])
    expect(LEVEL_IDS.map((level) => by(form(false, SITE, GO), level))).toEqual(['card', 'followUp', 'followUp'])
    // Its line names it, even where « autonomie » would have let it through.
    expect(decide(online({ known: true, followUp: GO }), { level: 'autonomous', rules: [] }, false)).toEqual({ by: 'followUp', label: GO })
    expect(givenLabel({ by: 'followUp', label: GO })).toBe(GO)
  })

  it('leaves a yes already given and a standing permission as they were, and is nothing in a run', () => {
    expect(by(online({ followUp: GO, consented: { site: true, folder: true } }), 'balanced')).toBe('folder')
    expect(by(online({ followUp: GO }), 'balanced', [rule('online', SITE)])).toBe('rule')
    for (const level of LEVEL_IDS) expect(by(online({ followUp: GO }), level, [], true)).toBe('run')
  })
})

describe('a planned task’s run', () => {
  it('gets nothing allowed ahead and no card: whatever the level, the rules, the folder’s consents', () => {
    const requests = [
      online({ known: true, consented: { site: true, folder: true } }),
      form(true),
      profile(true),
      { action: 'commit' as const },
      { action: 'task' as const }
    ]
    for (const level of LEVEL_IDS) for (const request of requests) expect(by(request, level, EVERY_RULE, true)).toBe('run')
  })
})

describe('going online', () => {
  it('asks for a new site, at every level, unless Marianne knows it and the level is « autonomie »', () => {
    expect(LEVEL_IDS.map((level) => by(online(), level))).toEqual(['card', 'card', 'card'])
    expect(LEVEL_IDS.map((level) => by(online({ known: true }), level))).toEqual(['card', 'card', 'level'])
  })

  it('keeps the yes given in the folder for that site, at every level', () => {
    expect(LEVEL_IDS.map((level) => by(online({ consented: { site: true, folder: true } }), level))).toEqual(['folder', 'folder', 'folder'])
  })

  it('takes the folder’s yes for another site, but at « tout demander »', () => {
    const other = { consented: { site: false, folder: true } }
    expect(LEVEL_IDS.map((level) => by(online(other), level))).toEqual(['card', 'folder', 'folder'])
    expect(LEVEL_IDS.map((level) => by(online({ ...other, known: true }), level))).toEqual(['card', 'folder', 'level'])
  })

  it('goes where a standing permission says, at every level, and only there', () => {
    expect(LEVEL_IDS.map((level) => by(online(), level, [rule('online', SITE)]))).toEqual(['rule', 'rule', 'rule'])
    expect(by(online({ site: 'evil.example' }), 'balanced', [rule('online', SITE)])).toBe('card')
    // Filling forms on a site isn't going there.
    expect(by(online(), 'balanced', [rule('form', SITE)])).toBe('card')
  })
})

describe('filling forms', () => {
  it('asks at every level, but on a site Marianne knows at « autonomie »', () => {
    expect(LEVEL_IDS.map((level) => by(form(), level))).toEqual(['card', 'card', 'card'])
    expect(LEVEL_IDS.map((level) => by(form(true), level))).toEqual(['card', 'card', 'level'])
  })

  it('goes where a standing permission says, at every level, and only there', () => {
    expect(LEVEL_IDS.map((level) => by(form(), level, [rule('form', SITE)]))).toEqual(['rule', 'rule', 'rule'])
    expect(by(form(false, 'evil.example'), 'autonomous', [rule('form', SITE)])).toBe('card')
    expect(by(form(), 'balanced', [rule('online', SITE)])).toBe('card')
  })
})

describe('saving deadlines', () => {
  it('asks, but at « autonomie », or with the standing permission', () => {
    expect(LEVEL_IDS.map((level) => by(profile(true), level))).toEqual(['card', 'card', 'level'])
    expect(LEVEL_IDS.map((level) => by(profile(true), level, [rule('profile')]))).toEqual(['rule', 'rule', 'rule'])
  })
})

describe('what a card offers', () => {
  it('« toujours » for a site, its forms, or the deadlines: the standing permission that would cover it', () => {
    expect(offerFor(online())).toEqual({ action: 'online', site: SITE })
    expect(offerFor(form())).toEqual({ action: 'form', site: SITE })
    expect(offerFor(profile(true))).toEqual({ action: 'profile' })
    // No site, nothing to offer.
    expect(offerFor(online({ site: '' }))).toBeNull()
    for (const request of [online(), form(), profile(true)]) expect(covers({ id: 'x', at: '', ...offerFor(request)! }, request)).toBe(true)
  })

  it('says so in French, on the card, the line and Réglages › Autorisations', () => {
    expect(alwaysLabel({ action: 'online', site: SITE })).toBe('toujours pour sanef.com')
    expect(alwaysLabel({ action: 'form', site: SITE })).toBe('toujours pour les formulaires de sanef.com')
    expect(alwaysLabel({ action: 'profile' })).toBe('toujours pour les échéances')
    expect(ruleLabel(rule('form', SITE))).toBe('remplir les formulaires de sanef.com sans demander')
    expect(givenLabel({ by: 'rule', rule: rule('online', SITE) })).toBe('toujours pour sanef.com')
    expect(givenLabel({ by: 'level' })).toBe('autonomie')
    expect(LEVELS.map((l) => l.label)).toEqual(['tout demander', 'équilibré', 'autonomie'])
  })
})

/** A fake archive: the account's settings only need keyed records. */
function memoryArchive(): Archive {
  const records = new Map<string, Map<string, unknown>>()
  const of = (kind: string) => records.get(kind) ?? records.set(kind, new Map()).get(kind)!
  return {
    get: (kind: string, id: string) => structuredClone(of(kind).get(id) ?? null),
    put: (kind: string, id: string, value: unknown) => void of(kind).set(id, structuredClone(value)),
    remove: (kind: string, id: string) => void of(kind).delete(id),
    list: (kind: string) => [...of(kind).values()].map((v) => structuredClone(v)),
    close: () => undefined
  } as unknown as Archive
}

describe('the cards and the lines, in the main process', () => {
  let parts: ApprovalPart[] = []
  const onPart = (_folderId: string, part: ApprovalPart) => void parts.push(part)
  const CARD = { kind: 'online' as const, title: `Aller sur ${SITE}`, fields: [{ label: 'site', value: SITE }] }
  /** Asks, and answers the card that shows, if one does. */
  async function answer(folderId: string, request: ApprovalRequest, reply?: Parameters<typeof approvals.respond>[1]) {
    const asked = approvals.ask(folderId, request, CARD)
    const card = parts.find((p) => p.status === 'pending')
    if (card && reply) approvals.respond(card.id, reply)
    return { ...(await asked), card }
  }

  beforeEach(() => {
    session.open(memoryArchive())
    parts = []
    approvals.on('part', onPart)
    approvals.canShow = () => true
  })
  afterEach(() => {
    approvals.off('part', onPart)
    approvals.canShow = () => false
    session.lock()
  })

  it('a card’s « toujours » keeps the standing permission it offered, which lets the next time through with a line', async () => {
    const first = await answer('f1', online(), 'always')
    expect(first.card).toMatchObject({ action: 'online', always: 'toujours pour sanef.com', status: 'accepted' })
    expect(first).toMatchObject({ decision: 'accepted', ahead: false })
    expect(accounts.settings().approvals.rules).toMatchObject([{ action: 'online', site: SITE }])

    parts = []
    const next = await answer('f2', online())
    expect(next).toMatchObject({ decision: 'accepted', ahead: true, card: undefined })
    expect(parts).toMatchObject([{ status: 'accepted', action: 'online', given: 'toujours pour sanef.com', title: `Aller sur ${SITE}` }])
    // The same site in the same folder: no line at every page.
    await answer('f2', online())
    expect(parts).toHaveLength(1)

    // Taken back in Réglages › Autorisations: a card again.
    approvals.removeRule(accounts.settings().approvals.rules[0].id)
    parts = []
    expect(await answer('f3', online(), 'refuse')).toMatchObject({ decision: 'refused', card: { status: 'refused' } })
  })

  it('« approuver » keeps nothing, and the card no longer says « toujours »', async () => {
    const { decision, card } = await answer('f1', form(), 'approve')
    expect(decision).toBe('accepted')
    expect(card?.always).toBeUndefined()
    expect(accounts.settings().approvals.rules).toEqual([])
  })

  it('« toujours » on a card of the floor keeps nothing: it offers none', async () => {
    const { decision, card } = await answer('f1', { action: 'commit' }, 'always')
    expect(card?.always).toBeUndefined()
    expect(decision).toBe('accepted')
    expect(accounts.settings().approvals.rules).toEqual([])
  })

  it('an answer the window can’t name is a no', async () => {
    expect((await answer('f1', online(), 'perhaps' as never)).decision).toBe('refused')
  })

  it('a follow-up’s go-ahead shows as a line naming it; whether an action would go without a card is said without asking', async () => {
    expect(approvals.covered('f1', online())).toBe(false)
    expect(approvals.covered('f1', online({ consented: { site: true, folder: true } }))).toBe(true)
    expect(approvals.covered('f1', online({ followUp: 'payer maintenant' }))).toBe(true)
    expect(approvals.covered('f1', { action: 'commit' })).toBe(false)
    expect(parts).toEqual([])
    expect(await approvals.ask('f1', online({ followUp: 'payer maintenant' }), CARD)).toEqual({ decision: 'accepted', ahead: true })
    expect(parts).toMatchObject([{ status: 'accepted', action: 'online', given: 'payer maintenant', title: `Aller sur ${SITE}` }])
  })

  it('« autonomie » saves a deadline with a line that shows its values', async () => {
    accounts.updateSettings({ approvals: { level: 'autonomous' } })
    const fields = [
      { label: 'intitulé', value: 'Péage A14' },
      { label: 'date', value: '12 novembre 2026' }
    ]
    expect(await approvals.ask('f1', profile(true), { kind: 'proposal', title: 'Ajouter une échéance', fields })).toEqual({ decision: 'accepted', ahead: true })
    expect(parts).toMatchObject([{ action: 'profile', given: 'autonomie', fields }])
  })

  it('nothing goes out of the user’s sight: no conversation, no line, and no card', async () => {
    accounts.updateSettings({ approvals: { level: 'autonomous' } })
    approvals.canShow = () => false
    expect(await approvals.ask('f1', profile(true), { kind: 'proposal', title: 'Ajouter une échéance', fields: [] })).toEqual({
      decision: 'expired',
      ahead: true
    })
    expect(await approvals.ask('f1', online(), CARD)).toEqual({ decision: 'expired', ahead: false })
    expect(parts).toEqual([])
  })

  it('a card settled by what the user does elsewhere (the service it proposes, added): once, whichever comes first', async () => {
    let added!: (d: 'accepted') => void
    const until = new Promise<'accepted'>((resolve) => (added = resolve))
    const asked = approvals.ask('f1', { action: 'add' }, { kind: 'add', title: 'Ajouter 3615 VIGNETTE', fields: [] }, { until })
    expect(parts).toMatchObject([{ status: 'pending', action: 'add' }])
    expect(parts[0].always).toBeUndefined()
    added('accepted')
    expect(await asked).toEqual({ decision: 'accepted', ahead: false })
    expect(parts[0].status).toBe('accepted')

    // Answered first, the card stays answered.
    parts = []
    const later = approvals.ask('f1', { action: 'add' }, { kind: 'add', title: 'Ajouter 3615 VIGNETTE', fields: [] }, { until: Promise.resolve('accepted') })
    approvals.respond(parts[0].id, 'refuse')
    expect((await later).decision).toBe('refused')
    await Promise.resolve()
    expect(parts[0].status).toBe('refused')
  })

  it('a payment card’s security code goes with the yes to the tool that asked, and nowhere else', async () => {
    const PAYMENT = {
      kind: 'payment' as const,
      title: 'Payer par carte sur sanef.com',
      fields: [{ label: 'carte', value: 'Visa •••• 4242 · perso · 09/38' }],
      askCvv: true
    }
    const given: string[] = []
    const onCvv = (cvv: string) => void given.push(cvv)
    const asked = approvals.ask('f1', { action: 'commit' }, PAYMENT, { onCvv })
    expect(parts).toMatchObject([{ status: 'pending', kind: 'payment', action: 'commit', askCvv: true }])
    expect(parts[0].always).toBeUndefined()
    approvals.respond(parts[0].id, 'approve', '737')
    expect(await asked).toEqual({ decision: 'accepted', ahead: false })
    expect(given).toEqual(['737'])
    expect(JSON.stringify(parts)).not.toContain('737')

    // Refused, it goes nowhere; nor on a card that asks for none.
    parts = []
    const refused = approvals.ask('f1', { action: 'commit' }, PAYMENT, { onCvv })
    approvals.respond(parts[0].id, 'refuse', '738')
    expect((await refused).decision).toBe('refused')
    parts = []
    const other = approvals.ask('f1', { action: 'commit' }, { ...PAYMENT, askCvv: undefined }, { onCvv })
    approvals.respond(parts[0].id, 'approve', '739')
    await other
    expect(given).toEqual(['737'])
  })

  it('a run gets neither', async () => {
    accounts.updateSettings({ approvals: { level: 'autonomous', rules: [rule('form', SITE)] } })
    expect(await approvals.ask('f1', form(true), CARD, { run: true })).toEqual({ decision: 'expired', ahead: false })
    expect(parts).toEqual([])
  })
})
