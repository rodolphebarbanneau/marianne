import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DomainId } from '../../shared/dossier'
import type { Demarche, DemarcheStep } from '../../shared/types'
import { log } from '../log'
import { resource } from '../paths'

/**
 * Guided procedures: Markdown files in resources/demarches, one per procedure.
 *
 *   ---
 *   id: declarer-revenus
 *   domaine: impots
 *   titre: Déclarer mes revenus
 *   description: …
 *   quand: chaque printemps
 *   duree: 30 minutes
 *   pieces: avis d'impôt de l'an dernier; bulletins de salaire de décembre
 *   ---
 *   ## Titre de l'étape
 *   Texte de l'étape (Markdown).
 *   > ouvrir: impots | Ouvrir mon espace particulier
 *   > configurer: compte:impots | Renseigner mon numéro fiscal
 *   > document: avis_impot | Ajouter l'avis d'impôt
 *   > demander: Vérifie ma déclaration… | Demander à Marianne
 *   > fiche: F358 | Lire la fiche
 */

const ACTION = /^>\s*(ouvrir|configurer|document|demander|fiche):\s*(.+?)\s*(?:\|\s*(.+))?$/

export function parseDemarche(text: string): Demarche {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!fm) throw new Error('front matter manquant')
  const meta: Record<string, string> = {}
  for (const line of fm[1].split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (m) meta[m[1]] = m[2].trim()
  }
  const steps: DemarcheStep[] = text
    .slice(fm[0].length)
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const [title, ...rest] = chunk.split(/\r?\n/)
      const actions: DemarcheStep['actions'] = []
      const body: string[] = []
      for (const line of rest) {
        const a = line.match(ACTION)
        if (a) actions.push({ kind: a[1] as DemarcheStep['actions'][number]['kind'], target: a[2], label: a[3] ?? a[2] })
        else body.push(line)
      }
      return { title: title.trim(), body: body.join('\n').trim(), actions }
    })
  if (!meta.id || !meta.domaine || !meta.titre || !steps.length) throw new Error('id, domaine, titre et au moins une étape requis')
  return {
    id: meta.id,
    domain: meta.domaine as DomainId,
    title: meta.titre,
    description: meta.description ?? '',
    when: meta.quand ?? '',
    duration: meta.duree ?? '',
    pieces: (meta.pieces ?? '')
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean),
    steps
  }
}

let cache: Demarche[] | null = null

export function demarches(): Demarche[] {
  if (cache) return cache
  const dir = resource('demarches')
  const out: Demarche[] = []
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    try {
      out.push(parseDemarche(readFileSync(join(dir, name), 'utf8')))
    } catch (err) {
      log.warn(`Procedure ${name} skipped:`, (err as Error).message)
    }
  }
  cache = out.sort((a, b) => a.title.localeCompare(b.title, 'fr'))
  return cache
}

export const demarche = (id: string) => demarches().find((x) => x.id === id) ?? null
