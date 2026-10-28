import { describe, expect, it } from 'vitest'
import { isDocumentFile, kindOf, parseSpDocument } from '../src/main/data/service-public'

const FICHE = `<?xml version="1.0" encoding="UTF-8"?>
<Publication xmlns:dc="http://purl.org/dc/elements/1.1/" ID="F123" type="Fiche d'information conditionnée" dateDerniereModificationImportante="2026-06-01T00:00:00" spUrl="https://www.service-public.gouv.fr/particuliers/vosdroits/F123">
  <dc:title>Aide exemple</dc:title>
  <dc:description>Une aide pour l'exemple.</dc:description>
  <dc:subject>Social - Santé</dc:subject>
  <FilDAriane><Niveau ID="Particuliers">Accueil</Niveau></FilDAriane>
  <DossierPere ID="N1"><Titre>Dossier</Titre><Fiche ID="F9">Voisine</Fiche></DossierPere>
  <Introduction><Texte><Paragraphe>Vous pouvez obtenir l'<LienInterne LienPublication="R1" type="Acronyme">Apa</LienInterne> sous <MiseEnEvidence>conditions</MiseEnEvidence>, voir <LienInterne LienPublication="F1229">la grille</LienInterne>.</Paragraphe></Texte></Introduction>
  <ListeSituations>
    <Situation><Titre>À domicile</Titre><Texte>
      <Chapitre><Titre><Paragraphe>Conditions</Paragraphe></Titre>
        <Liste type="puce"><Item><Paragraphe>Avoir 60 ans</Paragraphe></Item><Item><Paragraphe>Résider en France</Paragraphe></Item></Liste>
        <ASavoir><Titre>À savoir</Titre><Paragraphe>Une note.</Paragraphe></ASavoir>
        <Paragraphe>Utilisez le téléservice suivant :</Paragraphe>
        <ServiceEnLigne ID="R2" URL="https://exemple.gouv.fr/demande" type="Téléservice"><Titre>Demande en ligne</Titre></ServiceEnLigne>
      </Chapitre>
    </Texte></Situation>
  </ListeSituations>
  <Reference URL="https://www.legifrance.gouv.fr/codes/x"><Titre>Code de l'action sociale</Titre></Reference>
</Publication>`

describe('service-public', () => {
  it('converts a fiche to Markdown', () => {
    const doc = parseSpDocument(FICHE)!
    expect(doc).toMatchObject({ id: 'F123', kind: 'fiche', title: 'Aide exemple', theme: 'Social - Santé', updated: '2026-06-01' })
    expect(doc.url).toBe('https://www.service-public.gouv.fr/particuliers/vosdroits/F123')
    // Inline: emphasis, glossary links as text, links to other fiches kept.
    expect(doc.body).toContain(
      "Vous pouvez obtenir l'Apa sous **conditions**, voir [la grille](https://www.service-public.gouv.fr/particuliers/vosdroits/F1229)."
    )
    // Situations and chapters become headings; lists stay lists.
    expect(doc.body).toContain('## À domicile')
    expect(doc.body).toContain('### Conditions')
    expect(doc.body).toContain('- Avoir 60 ans\n- Résider en France')
    // A note's title is not repeated when it is just its label.
    expect(doc.body).toContain('> **À savoir**\n> Une note.')
    // Online services: in place, and listed at the end with the references.
    expect(doc.body).toContain('→ [Demande en ligne](https://exemple.gouv.fr/demande) · téléservice (R2)')
    expect(doc.body).toMatch(/## Services en ligne et formulaires\n\n- \[Demande en ligne\]/)
    expect(doc.body).toContain("## Textes de référence\n\n- [Code de l'action sociale](https://www.legifrance.gouv.fr/codes/x)")
    // Navigation is not content.
    expect(doc.body).not.toContain('Voisine')
    expect(doc.body).not.toContain('Accueil')
  })

  it('skips files that are not documents', () => {
    expect(isDocumentFile('F123.xml')).toBe(true)
    expect(isDocumentFile('R4.xml')).toBe(true)
    expect(isDocumentFile('menu.xml')).toBe(false)
    expect(parseSpDocument('<Publication ID="menu" type="Menu"><dc:title xmlns:dc="x">Menu</dc:title></Publication>')).toBeNull()
  })

  it('classifies document types', () => {
    expect(kindOf('Fiche Question-réponse conditionnée')).toBe('question')
    expect(kindOf('Formulaire')).toBe('formulaire')
    expect(kindOf('Modèle de document')).toBe('modele')
    expect(kindOf('Dossier')).toBe('dossier')
    expect(kindOf('Quelque chose')).toBe('autre')
  })
})
