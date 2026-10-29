import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createArchive, LockedError, openArchive } from '@marianne/archive'
import type { Profile } from '@marianne/profile'
import { afterAll, describe, expect, it } from 'vitest'
import { documents, guessType } from '../src/main/profile/documents'
import { normalize, profile } from '../src/main/profile/store'
import { session } from '../src/main/session'

/**
 * The app's side of the profile: its store and documents in the archive. The profile itself (the
 * model, tokens, deadlines, context) is @marianne/profile's, tested there.
 */

const PASSWORD = 'Kq7#-mZ2!-pR4w-Tx9%-bN3e'

/** A one-page PDF with a text layer. */
function pdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

describe('setup', () => {
  it('fills in fields added since a profile was written', () => {
    const p = normalize({ person: { firstNames: 'A' } } as Partial<Profile>)
    expect(p.person.firstNames).toBe('A')
    expect(p.person.nir).toBe('')
    expect(p.deadlineStatus).toEqual({})
    expect(p.properties).toEqual([])
  })
})

describe('documents', () => {
  it('guesses the type from the file name', () => {
    expect(guessType('avis-impot-2026.pdf')).toBe('tax_notice')
    expect(guessType('Avis_d’imposition 2025.pdf')).toBe('tax_notice')
    expect(guessType('Bulletin de salaire mars.pdf')).toBe('payslip')
    expect(guessType('attestation-droits-ameli.pdf')).toBe('certificate')
    expect(guessType('Relevé de carrière.pdf')).toBe('statement')
    expect(guessType('scan0042.jpg')).toBe('other')
  })
})

// Creating an archive derives its keys on purpose slowly (scrypt): seconds on a slow runner.
describe('in the archive', { timeout: 30_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'marianne-profile-'))
  afterAll(() => {
    session.lock()
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps the profile in the archive, normalized, and forgets it on lock', async () => {
    const file = join(dir, 'a.marianne')
    const { archive } = await createArchive(file, { id: 'a', display: '', password: PASSWORD })
    const dek = archive.dataKey()
    session.open(archive)
    let changes = 0
    const onChange = () => changes++
    profile.on('change', onChange)
    profile.apply({ type: 'person', patch: { birthName: ' Martin ', nir: '2 88 03 44 109 123 76' } })
    profile.apply({
      type: 'entity',
      kind: 'vehicles',
      item: { id: '', plate: 'gh-482-kx', model: 'Clio', firstRegistration: '', lastInspection: '', critair: '' }
    })
    profile.apply({ type: 'procedureStep', id: 'declare-income', step: 2, done: true })
    profile.apply({ type: 'procedureStep', id: 'declare-income', step: 0, done: true })
    profile.off('change', onChange)
    expect(changes).toBe(4)
    const p = profile.get()
    expect(p.person).toMatchObject({ birthName: 'Martin', nir: '288034410912376' })
    expect(p.vehicles[0].plate).toBe('GH-482-KX')
    expect(p.vehicles[0].id).not.toBe('')
    expect(p.procedures['declare-income']).toEqual([0, 2])
    expect(archive.get<Profile>('profile', 'main')?.person.nir).toBe('288034410912376')

    session.lock()
    expect(() => profile.get()).toThrow(LockedError)
    session.open(openArchive(file, dek))
    expect(profile.get().person.birthName).toBe('Martin')

    // Another account sees its own profile only.
    const other = await createArchive(join(dir, 'b.marianne'), { id: 'b', display: '', password: PASSWORD })
    session.open(other.archive)
    expect(profile.get().person.birthName).toBe('')
  })

  it('seals documents in the archive and gives engines their text masked', async () => {
    const { archive } = await createArchive(join(dir, 'c.marianne'), { id: 'c', display: '', password: PASSWORD })
    session.open(archive)
    profile.apply({ type: 'person', patch: { birthName: 'Martin', firstNames: 'Camille', nir: '288034410912376' } })

    const note = await documents.add(
      { name: 'avis-impot-2026.txt', data: Buffer.from('Avis pour Camille MARTIN, NIR 2 88 03 44 109 123 76') },
      { domain: 'taxes', folderId: 'f1' }
    )
    expect(note).toMatchObject({ title: 'avis impot 2026', type: 'tax_notice', mime: 'text/plain', folderId: 'f1', entity: '' })
    expect(await documents.text(note.id)).toBe('Avis pour [[first_names]] [[last_name]], NIR [[nir]]')
    expect(await documents.rawText(note.id)).toContain('2 88 03 44 109 123 76')
    expect(documents.update(note.id, { title: ' Avis 2026 ', type: 'letter' })).toMatchObject({ id: note.id, title: 'Avis 2026', type: 'letter' })

    const scan = await documents.add({ name: 'notice.pdf', data: pdf('Avis d impot de Camille MARTIN, NIR 2 88 03 44 109 123 76') }, { domain: 'taxes' })
    expect(await documents.text(scan.id)).toContain('NIR [[nir]]')
    // Extracted once, kept in the archive.
    expect(archive.get<{ text: string }>('doctext', scan.id)?.text).toContain('MARTIN')
    expect(documents.list().map((x) => x.id)).toEqual([note.id, scan.id])
    expect(documents.bytes(scan.id).subarray(0, 5).toString()).toBe('%PDF-')

    documents.remove(scan.id)
    expect(documents.list().map((x) => x.id)).toEqual([note.id])
    expect(archive.get('doctext', scan.id)).toBeNull()
  })
})
