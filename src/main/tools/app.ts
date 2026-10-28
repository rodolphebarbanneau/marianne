import * as z from 'zod'
import { DOMAINS, domainInfo } from '../../shared/domains'
import type { DomainId } from '../../shared/dossier'
import { fold } from '../data/assemblee'
import { browser } from '../browser'
import { serviceReady } from '../../shared/setup'
import { dossier } from '../dossier/store'
import { skills } from '../skills'
import { vault } from '../vault'
import { tool, ToolError } from './tool'

const LOGIN: Record<string, string> = { franceconnect: 'FranceConnect', compte: 'compte personnel', aucun: 'sans connexion' }

export const appTools = [
  tool({
    name: 'sites_publics',
    title: 'Sites publics',
    readOnly: true,
    description:
      "Catalogue des sites de l'administration utiles aux particuliers (impôts, caf, ameli, France Travail, ANTS, retraite, justice…), par domaine : à quoi ils servent, comment on s'y connecte, leur identifiant (pour la cible compte:<id>), s'ils sont configurés dans le dossier, et si l'utilisateur a une connexion dans son trousseau (sans jamais la révéler).",
    input: {
      domaine: z.enum(DOMAINS.map((d) => d.id) as [DomainId, ...DomainId[]]).optional(),
      recherche: z.string().optional()
    },
    run: async ({ domaine, recherche }) => {
      const words = fold(recherche ?? '')
        .split(/\s+/)
        .filter(Boolean)
      const list = dossier
        .services()
        .filter((s) => !domaine || s.domain === domaine)
        .filter((s) => words.every((w) => fold(`${s.name} ${s.description} ${s.url}`).includes(w)))
      if (!list.length) throw new ToolError('Aucun site du catalogue ne correspond.')
      const d = dossier.get()
      return list
        .map((s) => {
          const saved = vault.hasLogin(s.url) ? ' · connexion dans le trousseau' : ''
          const configured = s.fields?.length || s.needsNir ? (serviceReady(d, s) ? ' · configuré' : ' · non configuré') : ''
          return `- **${s.name}** (id ${s.id}, ${domainInfo(s.domain).short}) · ${LOGIN[s.login]}${configured}${saved}\n  ${s.description}\n  ${s.url}`
        })
        .join('\n')
    }
  }),

  tool({
    name: 'ouvrir_site',
    title: 'Ouvrir un site',
    tokens: false,
    description:
      "Ouvre une page dans le navigateur intégré de Marianne, pour que l'utilisateur fasse une démarche ou se connecte à son espace personnel (son trousseau remplit le formulaire de connexion à sa demande). Il peut ensuite t'envoyer la page affichée, ou te demander de remplir le formulaire (lire_formulaire). Ouvre la page la plus précise possible (formulaire, simulateur, espace de connexion).",
    input: {
      url: z.string().url().describe('Adresse https de la page'),
      raison: z.string().optional().describe('Ce que l’utilisateur doit y faire, en une phrase')
    },
    run: async ({ url, raison }) => {
      if (!/^https:\/\//i.test(url)) throw new ToolError('Seules les adresses https sont ouvertes.')
      browser.open(url)
      await browser.settled()
      // Where the page ended up, after redirects.
      const { url: shown, title } = browser.state()
      return `Page ouverte dans le navigateur de Marianne : ${shown || url}${title ? ` (« ${title} »)` : ''}${raison ? `\nÀ faire : ${raison}` : ''}\n${vault.hasLogin(shown || url) ? "L'utilisateur a une connexion enregistrée pour ce site : il peut la remplir depuis la barre du navigateur." : "Pas de connexion enregistrée pour ce site : l'utilisateur peut l'ajouter au trousseau (cible trousseau, ou la page du domaine)."}\nQuand il aura la bonne page sous les yeux, il pourra te l'envoyer avec le bouton « envoyer au dialogue ».`
    }
  }),

  tool({
    name: 'competence',
    title: 'Compétence',
    readOnly: true,
    description:
      'Lit un guide de méthode (compétence) par son nom, parmi ceux listés dans tes instructions. Lis le guide adapté avant de traiter une demande de ce type.',
    input: { nom: z.string() },
    run: async ({ nom }) => {
      const body = skills.read(nom.trim())
      if (!body)
        throw new ToolError(
          `Compétence inconnue ou désactivée : « ${nom} ». Disponibles : ${skills
            .enabled()
            .map((s) => s.name)
            .join(', ')}.`
        )
      return body
    }
  })
]
