import { readFileSync } from 'node:fs'
import type { TokenDef } from '@marianne/profile'
import { describe, expect, it } from 'vitest'
import { analysisMessage, ANALYSIS_PROMPT, conversationCourse, diagnosticsText, logTail, parseAnalysis, scrub, titleFrom } from '../src/main/bug-report'
import { BUG_FORM_FIELDS, bugReportMarkdown, bugReportUrl, MAX_URL_LENGTH, type BugReport } from '../src/shared/bug-report'
import { REPO_URL } from '../src/shared/project'
import type { ChatMessage } from '../src/shared/types'

// An invented person and computer.
const tokens: TokenDef[] = [
  { token: 'last_name', label: 'nom', value: 'Martinot', kind: 'text' },
  { token: 'first_names', label: 'prénoms', value: 'Jeanne Lucie', kind: 'text' },
  { token: 'tax_number', label: 'numéro fiscal', value: '3012345678901', kind: 'id' }
]
const windows = { home: 'C:\\Users\\jmartinot', user: 'jmartinot' }
const mac = { home: '/Users/jmartinot', user: 'jmartinot' }

describe('a bug report’s scrubbing', () => {
  it('turns the profile’s identifiers into their tokens', () => {
    expect(scrub('Mme Jeanne Lucie Martinot, numéro fiscal 30 12 34 56 78 901', tokens, windows)).toBe(
      'Mme [[first_names]] [[last_name]], numéro fiscal [[tax_number]]'
    )
  })

  it('writes the home folder as ~, however a path spells it, and the account’s name as <user>', () => {
    expect(scrub('open C:\\Users\\jmartinot\\AppData\\Roaming\\x.json failed', [], windows)).toBe('open ~\\AppData\\Roaming\\x.json failed')
    expect(scrub('file:///C:/Users/jmartinot/.marianne/logs', [], windows)).toBe('file:///~/.marianne/logs')
    expect(scrub('{"path":"c:\\\\users\\\\JMartinot\\\\Documents"}', [], windows)).toBe('{"path":"~\\\\Documents"}')
    expect(scrub('/Users/jmartinot/Library/Logs', [], mac)).toBe('~/Library/Logs')
    expect(scrub('signed in as jmartinot on this computer', [], mac)).toBe('signed in as <user> on this computer')
  })

  it('takes out what may be someone’s even when the profile doesn’t know it', () => {
    const text = [
      'mail jeanne.m@exemple.fr',
      'tel 06 12 34 56 78 or +33 6 12 34 56 78',
      'iban FR76 3000 6000 0112 3456 7890 189',
      'plate AB-123-CD',
      'case 123456789012'
    ].join('\n')
    expect(scrub(text, [], windows)).toBe(['mail <email>', 'tel <phone> or <phone>', 'iban <iban>', 'plate <plate>', 'case <number>'].join('\n'))
  })

  it('takes out card numbers: those stored, however written, and any in groups', () => {
    const stored = ['4242424242424242']
    expect(scrub('paid with 4242.4242.4242.4242 then 4242424242424242', [], windows, stored)).toBe('paid with <card> then <card>')
    expect(scrub('card 5555-5555-5555-4444 refused', [], windows)).toBe('card <card> refused')
    expect(scrub('card 5555 5555 5555 4444 refused', [], windows)).toBe('card <number> refused')
  })

  it('keeps an address’s site, not its path or its query', () => {
    expect(scrub('GET https://www.impots.gouv.fr/dossier/4567?id=12 failed', [], windows)).toBe('GET https://www.impots.gouv.fr/… failed')
    expect(scrub('see https://www.service-public.fr', [], windows)).toBe('see https://www.service-public.fr')
  })

  it('leaves what the developers need: times, durations, versions, counts, tokens', () => {
    const line = '2026-10-30T08:00:00.000Z [warn] Service call parlement.live took 6907 ms; Marianne 0.1.0-alpha.2, Electron 45.1.0, 5563 items, [[nir]]'
    expect(scrub(line, tokens, windows)).toBe(line)
  })
})

describe('the diagnostics', () => {
  it('keep the log’s last lines, each cut to a width', () => {
    const log = ['a', '', 'b', 'c'.repeat(300), 'd'].join('\r\n')
    expect(logTail(log, 2, 10)).toBe(`${'c'.repeat(10)}…\nd`)
    expect(logTail(log).split('\n')).toHaveLength(4)
  })

  it('give a conversation’s course, never what was said nor what a tool found', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', at: '', parts: [{ type: 'text', text: 'Ma question sur mon dossier' }] },
      {
        id: '2',
        role: 'assistant',
        at: '',
        status: 'error',
        engine: 'claude',
        model: 'sonnet',
        ms: 12_345,
        error: 'Claude Code: process exited with code 1',
        parts: [
          { type: 'text', text: 'Je regarde votre avis d’impôt' },
          { type: 'tool', id: 't1', name: 'profile', input: { field: 'address' }, output: '12 rue des Lilas', status: 'done' },
          { type: 'tool', id: 't2', name: 'read_page', input: {}, output: 'No answer from www.exemple.fr\nmore', isError: true, status: 'done' }
        ]
      }
    ]
    const course = conversationCourse(messages)
    expect(course).toBe(
      [
        '2 messages:',
        '- user · text',
        '- assistant · error · claude/sonnet · 12.3 s · text, tool',
        '  tool profile: done',
        '  tool read_page: done, failed: No answer from www.exemple.fr more',
        '  error: Claude Code: process exited with code 1'
      ].join('\n')
    )
    for (const said of ['Ma question', 'avis d’impôt', 'rue des Lilas', 'address']) expect(course).not.toContain(said)
    expect(conversationCourse(messages, 1).split('\n')[0]).toBe('2 messages, the last 1:')
  })

  it('come with the environment first and the log’s latest last, as the report’s address shortens them', () => {
    const text = diagnosticsText({
      app: 'Marianne 0.1.0',
      system: 'Windows 10.0.26300 (x64)',
      engine: 'Claude Code',
      settings: 'web access public',
      screen: 'page services',
      errors: [],
      conversation: null,
      log: 'one\ntwo'
    })
    expect(text.split('\n')[0]).toBe('App: Marianne 0.1.0')
    expect(text).toContain('Window errors:\nnone')
    expect(text).not.toContain('Conversation')
    expect(text.endsWith('one\ntwo')).toBe(true)
  })
})

describe('the engine’s analysis', () => {
  it('is asked in English, the report public and the engine without tools', () => {
    expect(ANALYSIS_PROMPT).toMatch(/Write in English/)
    expect(ANALYSIS_PROMPT).toMatch(/public/)
    expect(ANALYSIS_PROMPT).toMatch(/no tools/)
    expect(analysisMessage('  rien ne marche ', 'App: x')).toBe("What the user saw, in their words:\n\nrien ne marche\n\nThe app's diagnostics:\n\nApp: x")
  })

  it('is read from its JSON, fenced or not', () => {
    const json = { title: 'INFOS: the wire stays empty', steps: '1. Open INFOS', analysis: '#### Expected\nHeadlines' }
    expect(parseAnalysis(JSON.stringify(json))).toEqual(json)
    expect(parseAnalysis(`Here it is:\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\``)).toEqual(json)
  })

  it('keeps an answer that isn’t its JSON as the analysis', () => {
    expect(parseAnalysis('The log shows a timeout in INFOS.')).toEqual({ title: '', steps: '', analysis: 'The log shows a timeout in INFOS.' })
    expect(parseAnalysis('{"other": 1}')).toEqual({ title: '', steps: '', analysis: '{"other": 1}' })
  })

  it('takes a title from the user’s first line when the engine gave none', () => {
    expect(titleFrom('\n  Le fil reste vide  \nensuite…')).toBe('Le fil reste vide')
    expect(titleFrom('   ')).toBe('Bug report')
  })
})

const report = (patch: Partial<BugReport> = {}): BugReport => ({
  title: 'INFOS: the wire stays empty',
  what: 'Le fil reste vide.',
  steps: '1. Open INFOS',
  analysis: '#### Expected\nHeadlines',
  version: '0.1.0',
  system: 'Windows 10.0.26300 (x64)',
  engine: 'Claude Code',
  diagnostics: 'App: Marianne 0.1.0',
  analyzedBy: 'Claude Code',
  ...patch
})

describe('the report on GitHub', () => {
  it('fills only text fields of the bug form, which GitHub fills from an address', () => {
    const form = readFileSync(new URL('../../../.github/ISSUE_TEMPLATE/bug.yml', import.meta.url), 'utf8')
    for (const field of BUG_FORM_FIELDS) expect(form).toMatch(new RegExp(`- type: (input|textarea)\\n\\s+id: ${field}\\n`))
  })

  it('opens the bug form with each field filled in', () => {
    const { url, shortened } = bugReportUrl(report())
    expect(shortened).toBe(false)
    const parsed = new URL(url)
    expect(`${parsed.origin}${parsed.pathname}`).toBe(`${REPO_URL}/issues/new`)
    expect(parsed.searchParams.get('template')).toBe('bug.yml')
    expect(parsed.searchParams.get('title')).toBe('INFOS: the wire stays empty')
    expect(parsed.searchParams.get('what')).toBe('Le fil reste vide.')
    expect(parsed.searchParams.get('engine')).toBe('Claude Code')
    // An empty field is left to the form.
    expect(new URL(bugReportUrl(report({ steps: '' })).url).searchParams.has('steps')).toBe(false)
  })

  it('shortens a report too long for an address: the log’s middle first, its start and latest lines kept', () => {
    const log = Array.from({ length: 400 }, (_, i) => `2026-10-30T08:00:00.000Z [info] line ${i} ${'é'.repeat(30)}`)
    const diagnostics = ['App: Marianne 0.1.0', ...log].join('\n')
    const { url, shortened } = bugReportUrl(report({ diagnostics }))
    expect(shortened).toBe(true)
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH)
    const kept = new URL(url).searchParams.get('diagnostics') ?? ''
    expect(kept.startsWith('App: Marianne 0.1.0')).toBe(true)
    expect(kept).toMatch(/\[… \d+ lines left out …\]/)
    expect(kept.endsWith(log[log.length - 1])).toBe(true)
    expect(new URL(url).searchParams.get('what')).toBe('Le fil reste vide.')
  })

  it('cuts the analysis too when the diagnostics alone aren’t enough', () => {
    const { url, shortened } = bugReportUrl(report({ analysis: 'x '.repeat(6000) }))
    expect(shortened).toBe(true)
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH)
    expect(new URL(url).searchParams.get('analysis')?.endsWith('[…]')).toBe(true)
  })

  it('copies whole, under the form’s headings', () => {
    const text = bugReportMarkdown(report({ steps: '' }))
    expect(text.startsWith('# INFOS: the wire stays empty\n\n### What happened\n\nLe fil reste vide.')).toBe(true)
    expect(text).not.toContain('### Steps to reproduce')
    expect(text).toContain('### Diagnostics\n\n```text\nApp: Marianne 0.1.0\n```')
  })
})
