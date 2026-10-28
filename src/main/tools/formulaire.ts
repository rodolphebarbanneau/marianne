import * as z from 'zod'
import { actions } from '../actions'
import { browser, type FormField } from '../browser'
import { tool, ToolError } from './tool'

/**
 * Filling forms of public-service sites in the built-in browser: the agent reads the fields,
 * proposes values (tokens resolved locally), the user confirms on a card, Marianne fills them in.
 * Passwords and files are never touched, and the form is never submitted: the user does it.
 */

/** The form each conversation read last: fills apply to that page only. */
const lastRead = new Map<string, { url: string; fields: FormField[] }>()

const describe = (f: FormField) =>
  `- ${f.id} · ${f.label || '(sans libellé)'} · ${f.type}${f.required ? ' · requis' : ''}${f.value ? ` · actuel « ${f.value.slice(0, 60)} »` : ''}${f.options?.length ? ` · options : ${f.options.slice(0, 15).join(' | ')}` : ''}`

export const formTools = [
  tool({
    name: 'lire_formulaire',
    title: 'Lecture du formulaire',
    readOnly: true,
    description:
      "Les champs du formulaire affiché dans le navigateur de Marianne (ouvert avec ouvrir_site), avec un id par champ, leur libellé, leur type, les options et les valeurs actuelles. Les mots de passe et les fichiers n'y figurent pas. À appeler avant remplir_formulaire, et de nouveau si la page change.",
    input: {},
    run: async (_args, ctx) => {
      const fields = await browser.readForm().catch((err: Error) => {
        throw new ToolError(err.message)
      })
      const read = { url: browser.currentUrl(), fields }
      lastRead.set(ctx.conversationId ?? '', read)
      if (!fields.length) return `Aucun champ à remplir sur ${read.url}. L'utilisateur doit peut-être se connecter ou aller jusqu'au formulaire.`
      return `Formulaire de ${read.url} (${fields.length} champs) :\n${fields.map(describe).join('\n')}`
    }
  }),

  tool({
    name: 'remplir_formulaire',
    title: 'Remplissage du formulaire',
    description:
      "Remplit des champs du formulaire lu par lire_formulaire, après confirmation de l'utilisateur sur une carte qui montre chaque valeur. Utilise les jetons [[nir]], [[numero_fiscal]], [[nom]]… pour ses identifiants : Marianne les remplace localement. Pour une liste ou des boutons radio, donne le libellé exact d'une option. Ne remplit jamais de mot de passe et ne valide jamais le formulaire : dis à l'utilisateur de vérifier puis d'envoyer lui-même.",
    input: {
      champs: z.array(z.object({ id: z.string(), valeur: z.string() })).min(1),
      raison: z.string().describe('Ce que ce remplissage fait, en une phrase pour l’utilisateur')
    },
    run: async ({ champs, raison }, ctx) => {
      const read = lastRead.get(ctx.conversationId ?? '')
      if (!read || read.url !== browser.currentUrl()) throw new ToolError('Lis d’abord le formulaire de la page actuelle avec lire_formulaire.')
      const byId = new Map(read.fields.map((f) => [f.id, f]))
      const unknown = champs.filter((c) => !byId.has(c.id)).map((c) => c.id)
      if (unknown.length) throw new ToolError(`Champs inconnus : ${unknown.join(', ')}. Relis le formulaire.`)
      const unresolved = champs.filter((c) => /\[\[[a-z0-9_.]+\]\]/i.test(c.valeur))
      if (unresolved.length)
        throw new ToolError(
          `Jetons sans valeur dans le dossier : ${unresolved.map((c) => c.valeur).join(', ')}. Utilise demander_configuration pour que l'utilisateur les renseigne.`
        )
      const host = new URL(read.url).hostname.replace(/^www\./, '')
      const decision = await actions.request(ctx.conversationId, {
        kind: 'form',
        title: `remplir ${champs.length} champ${champs.length > 1 ? 's' : ''} · ${host}`,
        reason: raison,
        fields: champs.map((c) => ({ label: byId.get(c.id)!.label || c.id, value: c.valeur }))
      })
      if (decision === 'refused') return "L'utilisateur a refusé : rien n'a été rempli."
      if (decision === 'expired') return "Pas de réponse de l'utilisateur : rien n'a été rempli."
      // The page may have changed while the card waited: fill only the one the user saw.
      if (browser.currentUrl() !== read.url) throw new ToolError('La page du navigateur a changé depuis la lecture : rien n’a été rempli. Relis le formulaire.')
      const { filled, missing } = await browser.fillForm(Object.fromEntries(champs.map((c) => [c.id, c.valeur])))
      return `${filled.length} champ(s) rempli(s)${missing.length ? ` ; non remplis (option introuvable ou champ disparu) : ${missing.join(', ')}` : ''}. L'utilisateur doit vérifier puis envoyer le formulaire lui-même.`
    }
  })
]
