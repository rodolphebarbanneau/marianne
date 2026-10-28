import * as z from 'zod'
import { fold } from '../data/assemblee'
import { getSpDoc, searchSp } from '../data/sp-query'
import { sync } from '../data/sync'
import { clip, plural, tool, ToolError } from './tool'

const KINDS = ['fiche', 'question', 'dossier', 'formulaire', 'teleservice', 'simulateur', 'modele', 'outil', 'definition'] as const

const MAX = 24_000

function ensureIndexed(): void {
  if (!sync.ready('service-public'))
    throw new ToolError(
      "L'index Service-Public n'est pas encore prêt (premier téléchargement en cours ou désactivé). Utilise la recherche web sur service-public.gouv.fr en attendant, ou propose à l'utilisateur de lancer la mise à jour dans réglages → sources."
    )
}

export const servicePublicTools = [
  tool({
    name: 'recherche_service_public',
    title: 'Service-Public · recherche',
    source: 'service-public',
    readOnly: true,
    description:
      'Recherche dans les fiches officielles de Service-Public (droits, démarches, aides, formulaires cerfa, téléservices, simulateurs), indexées localement et à jour du jour. À utiliser en premier pour toute question sur les droits et démarches des particuliers. Renvoie les identifiants (F…, R…, N…) à lire ensuite avec fiche_service_public.',
    input: {
      requete: z.string().min(2).describe('Mots-clés en français, ex. "aide personnalisée au logement étudiant"'),
      type: z
        .enum(KINDS)
        .optional()
        .describe('Restreindre à un type : fiche, question (questions-réponses), formulaire (cerfa), teleservice, simulateur, modele (modèle de lettre)…'),
      limite: z.number().int().min(1).max(25).default(8)
    },
    run: async ({ requete, type, limite }) => {
      ensureIndexed()
      const { hits, loose } = searchSp(requete, limite, type)
      if (!hits.length) return `Aucun document Service-Public pour « ${requete} ». Essaie d'autres mots (synonymes, nom officiel de l'aide).`
      const lines = hits.map(
        (h) => `- **${h.title}** (${h.id} · ${h.kind} · mis à jour le ${h.updated})\n  ${h.description}\n  ${h.extrait.replace(/\s+/g, ' ')}\n  ${h.url}`
      )
      return `${plural(hits.length, 'document')} pour « ${requete} »${loose ? ' (correspondance partielle)' : ''} :\n\n${lines.join('\n')}`
    }
  }),

  tool({
    name: 'fiche_service_public',
    title: 'Service-Public · fiche',
    source: 'service-public',
    readOnly: true,
    description:
      'Lit une fiche Service-Public complète par son identifiant (F1234, R12345, N123) : conditions, montants, démarches, cas particuliers, formulaires, textes de référence. Les fiches longues sont découpées : demande alors une partie par son titre.',
    input: {
      id: z.string().regex(/^[FNRfnr]\d+$/, 'identifiant F…, N… ou R…'),
      partie: z.string().optional().describe('Titre (ou début de titre) d’une partie, pour les fiches longues')
    },
    run: async ({ id, partie }) => {
      ensureIndexed()
      const doc = getSpDoc(id) as
        { id: string; kind: string; title: string; description: string; theme: string; url: string; updated: string; body: string } | undefined
      if (!doc) throw new ToolError(`Aucun document ${id} dans l'index Service-Public.`)
      const head = `# ${doc.title}\n\n${doc.id} · ${doc.kind} · ${doc.theme} · mis à jour le ${doc.updated}\nSource : ${doc.url}\n\n${doc.description}\n\n`
      const sections = doc.body.split(/^(?=## )/m)
      if (partie) {
        const want = fold(partie)
        const found = sections.filter((s) => fold(s.split('\n')[0]).includes(want))
        if (!found.length) return `${head}Aucune partie « ${partie} ». Parties : ${sections.map((s) => s.split('\n')[0].replace(/^## /, '')).join(' · ')}`
        return clip(head + found.join('\n\n'), MAX)
      }
      if (doc.body.length <= MAX) return head + doc.body
      const toc = sections.map((s) => `- ${s.split('\n')[0].replace(/^## /, '') || '(introduction)'} (${Math.round(s.length / 1000)} k caractères)`)
      return `${head}Fiche longue : lis les parties utiles avec le paramètre partie.\n\nParties :\n${toc.join('\n')}\n\n${clip(doc.body, MAX / 2, 'Demande une partie précise.')}`
    }
  })
]
