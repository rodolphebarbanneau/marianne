import * as z from 'zod'
import { fold } from '../data/assemblee'
import { fetchJson, HttpError } from '../http'
import { vault } from '../vault'
import { base, clip, tool, ToolError } from './tool'

/**
 * Légifrance through PISTE, the State's API gateway. Its terms forbid sharing credentials, so
 * every user brings their own (free) PISTE app, stored in the keychain: client id as the
 * username, client secret as the password. legifrance.gouv.fr itself blocks automated reads.
 */

/** Codes by official name, with their Légifrance text ids (from the references of the Service-Public fiches). */
export const CODES: Array<[string, string]> = [
  ['Code civil', 'LEGITEXT000006070721'],
  ['Code du travail', 'LEGITEXT000006072050'],
  ['Code de la route', 'LEGITEXT000006074228'],
  ["Code de l'entrée et du séjour des étrangers et du droit d'asile", 'LEGITEXT000006070158'],
  ['Code général de la fonction publique', 'LEGITEXT000044416551'],
  ['Code de la sécurité sociale', 'LEGITEXT000006073189'],
  ['Code de procédure civile', 'LEGITEXT000006070716'],
  ['Code pénal', 'LEGITEXT000006070719'],
  ['Code de procédure pénale', 'LEGITEXT000006071154'],
  ["Code de la construction et de l'habitation", 'LEGITEXT000006074096'],
  ['Code de la santé publique', 'LEGITEXT000006072665'],
  ['Code de la consommation', 'LEGITEXT000006069565'],
  ['Code de la sécurité intérieure', 'LEGITEXT000025503132'],
  ['Code général des impôts', 'LEGITEXT000006069577'],
  ["Code des procédures civiles d'exécution", 'LEGITEXT000025024948'],
  ["Code de l'action sociale et des familles", 'LEGITEXT000006074069'],
  ["Code des relations entre le public et l'administration", 'LEGITEXT000031366350'],
  ["Code de l'environnement", 'LEGITEXT000006074220'],
  ['Code monétaire et financier', 'LEGITEXT000006072026'],
  ["Code de l'urbanisme", 'LEGITEXT000006074075'],
  ['Code électoral', 'LEGITEXT000006070239'],
  ['Code général des collectivités territoriales', 'LEGITEXT000006070633'],
  ['Code de justice administrative', 'LEGITEXT000006070933'],
  ["Code de l'éducation", 'LEGITEXT000006071191'],
  ['Code de la justice pénale des mineurs', 'LEGITEXT000039086952'],
  ['Code rural et de la pêche maritime', 'LEGITEXT000006071367'],
  ['Code des assurances', 'LEGITEXT000006073984'],
  ['Code de commerce', 'LEGITEXT000005634379'],
  ["Code de l'organisation judiciaire", 'LEGITEXT000006071164'],
  ["Code de l'énergie", 'LEGITEXT000023983208'],
  ['Code des douanes', 'LEGITEXT000006071570']
]

const key = (name: string) => fold(name.trim()).replace(/[’`]/g, "'")

/** "Code civil", "civil", "LEGITEXT…" → the code's official name and text id. */
export function findCode(name: string): { name: string; id: string } | null {
  const n = name.trim()
  if (/^LEGITEXT\d+$/i.test(n)) {
    const id = n.toUpperCase()
    return { name: CODES.find(([, v]) => v === id)?.[0] ?? id, id }
  }
  const k = key(n)
  const exact = CODES.find(([c]) => key(c) === k)
  const found = exact ? [exact] : CODES.filter(([c]) => key(c).includes(k))
  return found.length === 1 ? { name: found[0][0], id: found[0][1] } : null
}

/** "L. 1237-1", "art L1237-1" → "L1237-1" (the API rejects spaces and dots). */
export const articleNumber = (n: string) => n.replace(/^art(icle)?\.?\s*/i, '').replace(/[.\s]/g, '')

let token: { value: string; until: number; key: string } | null = null

async function accessToken(): Promise<string> {
  const creds = vault.api('piste')
  if (!creds?.username || !creds.password)
    throw new ToolError(
      "Légifrance n'est pas configuré. Explique à l'utilisateur : créer gratuitement un compte sur piste.gouv.fr, y accepter les conditions de l'API Légifrance, puis ranger le client_id et le client_secret de son application dans Marianne → réglages → trousseau → « clé api » (adresse : piste.gouv.fr). En attendant, cite les articles avec leur lien legifrance.gouv.fr sans les lire."
    )
  const key = creds.username
  if (token && token.key === key && Date.now() < token.until) return token.value
  const sandbox = base('legifrance').includes('sandbox')
  const url = `https://${sandbox ? 'sandbox-oauth' : 'oauth'}.piste.gouv.fr/api/oauth/token`
  const r = await fetchJson<{ access_token: string; expires_in: number }>(url, {
    form: { grant_type: 'client_credentials', client_id: creds.username, client_secret: creds.password, scope: 'openid' }
  }).catch((err: Error) => {
    throw new ToolError(`Connexion à PISTE refusée (${err.message}). Vérifie le client_id et le client_secret dans le trousseau.`)
  })
  token = { value: r.access_token, until: Date.now() + (r.expires_in - 60) * 1000, key }
  return token.value
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const send = async () =>
    fetchJson<T>(`${base('legifrance')}${path}`, { json: body, headers: { Authorization: `Bearer ${await accessToken()}` }, timeoutMs: 30_000 })
  try {
    return await send()
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      token = null
      return send()
    }
    throw err
  }
}

const FONDS = ['CODE_DATE', 'LODA_DATE', 'JURI', 'CETAT', 'CONSTIT', 'KALI', 'JORF', 'CNIL', 'CIRC', 'ALL'] as const
const today = () => new Date().toISOString().slice(0, 10)
const date = (ms?: string | number | null) => (ms ? new Date(Number(ms)).toISOString().slice(0, 10) : '')
const strip = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

interface SearchResult {
  titles?: Array<{ id: string; cid?: string; title: string; legalStatus?: string }>
  sections?: Array<{ title?: string; extracts?: Array<{ id: string; num?: string; legalStatus?: string; values?: string[] }> }>
  extracts?: Array<{ id: string; num?: string; legalStatus?: string; values?: string[] }>
  date?: string
  nature?: string
}

interface Article {
  id: string
  num: string
  etat: string
  texte?: string
  texteHtml?: string
  nota?: string
  dateDebut?: string
  dateFin?: string
  textTitles?: Array<{ titre?: string; titreTxt?: Array<{ titre: string }> }>
  fullSectionsTitre?: string
}

export const legifranceTools = [
  tool({
    name: 'recherche_legifrance',
    title: 'Légifrance · recherche',
    source: 'legifrance',
    readOnly: true,
    description:
      'Recherche dans Légifrance (API officielle) : articles des codes en vigueur (fond CODE_DATE, éventuellement dans un code précis), lois et décrets (LODA_DATE), jurisprudence judiciaire (JURI) et administrative (CETAT), décisions du Conseil constitutionnel (CONSTIT), conventions collectives (KALI), Journal officiel (JORF). Renvoie les identifiants LEGIARTI à lire avec article_legifrance.',
    input: {
      recherche: z.string().min(2),
      fond: z.enum(FONDS).default('CODE_DATE'),
      code: z.string().optional().describe('Nom du code pour CODE_DATE, ex. "Code civil"'),
      limite: z.number().int().min(1).max(20).default(8)
    },
    run: async ({ recherche, fond, code, limite }) => {
      const filtres: unknown[] = []
      if (fond === 'CODE_DATE') {
        filtres.push({ facette: 'DATE_VERSION', singleDate: today() })
        // The facet wants the exact official name, capital and accents included.
        if (code) filtres.push({ facette: 'NOM_CODE', valeurs: [findCode(code)?.name ?? code.trim()] })
      }
      const r = await call<{ totalResultNumber: number; results: SearchResult[] }>('/search', {
        fond,
        recherche: {
          champs: [{ typeChamp: 'ALL', operateur: 'ET', criteres: [{ typeRecherche: 'TOUS_LES_MOTS_DANS_UN_CHAMP', valeur: recherche, operateur: 'ET' }] }],
          filtres,
          pageNumber: 1,
          pageSize: limite,
          operateur: 'ET',
          sort: 'PERTINENCE',
          typePagination: 'DEFAUT'
        }
      })
      if (!r.results?.length) return `Aucun résultat Légifrance (${fond}) pour « ${recherche} ».`
      const lines = r.results.map((res) => {
        const t = res.titles?.[0]
        const extracts = [...(res.sections ?? []).flatMap((s) => s.extracts ?? []), ...(res.extracts ?? [])]
          .slice(0, 4)
          .map(
            (e) =>
              `  - ${e.num ? `art. ${e.num} ` : ''}(${e.id}${e.legalStatus ? ` · ${e.legalStatus.toLowerCase()}` : ''}) ${strip((e.values ?? []).join(' … ')).slice(0, 240)}`
          )
        return `- **${t?.title ?? '(sans titre)'}** (${t?.id ?? '?'}${t?.legalStatus ? ` · ${t.legalStatus.toLowerCase()}` : ''})${extracts.length ? `\n${extracts.join('\n')}` : ''}`
      })
      return `${r.totalResultNumber} résultats Légifrance (${fond}), les plus pertinents :\n\n${lines.join('\n')}`
    }
  }),

  tool({
    name: 'article_legifrance',
    title: 'Légifrance · article',
    source: 'legifrance',
    readOnly: true,
    description:
      'Lit le texte en vigueur d’un article : par son identifiant LEGIARTI, ou par code + numéro (ex. code "Code du travail", numero "L1237-1"). Indique les dates de vigueur et le lien Légifrance à citer.',
    input: {
      id: z.string().optional().describe('Identifiant LEGIARTI…'),
      code: z.string().optional().describe('Nom du code ou identifiant LEGITEXT'),
      numero: z.string().optional().describe('Numéro d’article, ex. "1240" ou "L. 1237-1"')
    },
    run: async ({ id, code, numero }) => {
      let r: { article?: Article | null }
      if (id) r = await call('/consult/getArticle', { id: id.trim().toUpperCase() })
      else if (code && numero) {
        const found = findCode(code)
        if (!found) throw new ToolError(`Code inconnu : « ${code} ». Codes connus : ${CODES.map(([c]) => c).join(', ')}. Ou passe un identifiant LEGITEXT.`)
        r = await call('/consult/getArticleWithIdAndNum', { id: found.id, num: articleNumber(numero) })
      } else throw new ToolError('Indique un identifiant LEGIARTI, ou un code et un numéro d’article.')
      const a = r.article
      if (!a) throw new ToolError('Article introuvable.')
      const text = a.texteHtml ? strip(a.texteHtml) : (a.texte ?? '')
      const titles = a.textTitles?.map((t) => t.titre ?? t.titreTxt?.[0]?.titre).filter(Boolean)[0] ?? ''
      return clip(
        `# ${titles} · article ${a.num}\n\n${a.fullSectionsTitre ? `${a.fullSectionsTitre}\n\n` : ''}${a.etat.toLowerCase()} · en vigueur du ${date(a.dateDebut)}${a.dateFin && !String(a.dateFin).startsWith('3') ? ` au ${date(a.dateFin)}` : ''}\nSource : https://www.legifrance.gouv.fr/codes/article_lc/${a.id}\n\n${text}${a.nota ? `\n\nNota : ${strip(a.nota)}` : ''}`,
        20_000
      )
    }
  })
]
