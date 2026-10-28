import * as z from 'zod'
import { fetchJson, HttpError } from '../http'
import { keychain } from '../keychain'
import { base, clip, fold, tool, ToolError } from './tool'

/**
 * Légifrance through PISTE, the State's API gateway. Its terms forbid sharing credentials, so
 * every user brings their own (free) PISTE application, kept in the keychain as an API key:
 * client id as the username, client secret as the password. legifrance.gouv.fr itself blocks
 * automated reading.
 */

/** Codes by official name, with their Légifrance text ids (from the references of the Service-Public pages). */
const CODES: Array<[string, string]> = [
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

/** "Code civil", "civil", "LEGITEXT…" → the code's official name and text id; null when unknown or ambiguous. */
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

let token: { value: string; until: number; clientId: string } | null = null

async function accessToken(): Promise<string> {
  const creds = keychain.api('piste')
  if (!creds?.username || !creds.password)
    throw new ToolError(
      'Légifrance is not set up. Tell the user how: create a free account on piste.gouv.fr, accept the terms of the Légifrance API there, then store their application’s client_id and client_secret in Marianne as an API key whose address is piste.gouv.fr (request_setup, target legifrance). Meanwhile, cite articles with their legifrance.gouv.fr link without reading them.'
    )
  if (token && token.clientId === creds.username && Date.now() < token.until) return token.value
  const sandbox = base('legifrance').includes('sandbox')
  const url = `https://${sandbox ? 'sandbox-oauth' : 'oauth'}.piste.gouv.fr/api/oauth/token`
  const r = await fetchJson<{ access_token: string; expires_in: number }>(url, {
    form: { grant_type: 'client_credentials', client_id: creds.username, client_secret: creds.password, scope: 'openid' }
  }).catch((err: Error) => {
    throw new ToolError(
      `PISTE refused the sign-in (${err.message}): the client_id or client_secret in the keychain may be wrong (request_setup, target legifrance).`
    )
  })
  token = { value: r.access_token, until: Date.now() + (r.expires_in - 60) * 1000, clientId: creds.username }
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

const COLLECTIONS = ['CODE_DATE', 'LODA_DATE', 'JURI', 'CETAT', 'CONSTIT', 'KALI', 'JORF', 'CNIL', 'CIRC', 'ALL'] as const
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

interface Excerpt {
  id: string
  num?: string
  legalStatus?: string
  values?: string[]
}

interface SearchResult {
  titles?: Array<{ id: string; cid?: string; title: string; legalStatus?: string }>
  sections?: Array<{ title?: string; extracts?: Excerpt[] }>
  extracts?: Excerpt[]
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
    name: 'search_legifrance',
    title: 'Légifrance search',
    source: 'legifrance',
    readOnly: true,
    description:
      'Searches Légifrance (official API): articles of the codes in force (collection CODE_DATE, optionally in one code), laws and decrees (LODA_DATE), judicial case law (JURI) and administrative (CETAT), Conseil constitutionnel decisions (CONSTIT), collective agreements (KALI), Journal officiel (JORF). Returns LEGIARTI ids to read with read_article.',
    input: {
      query: z.string().min(2).describe('Keywords, in French'),
      collection: z.enum(COLLECTIONS).default('CODE_DATE'),
      code: z.string().optional().describe('Name of the code, for CODE_DATE, e.g. "Code civil"'),
      limit: z.number().int().min(1).max(20).default(8)
    },
    run: async ({ query, collection, code, limit }) => {
      const filtres: unknown[] = []
      if (collection === 'CODE_DATE') {
        filtres.push({ facette: 'DATE_VERSION', singleDate: today() })
        // The facet wants the exact official name, capital and accents included.
        if (code) filtres.push({ facette: 'NOM_CODE', valeurs: [findCode(code)?.name ?? code.trim()] })
      }
      const r = await call<{ totalResultNumber: number; results: SearchResult[] }>('/search', {
        fond: collection,
        recherche: {
          champs: [{ typeChamp: 'ALL', operateur: 'ET', criteres: [{ typeRecherche: 'TOUS_LES_MOTS_DANS_UN_CHAMP', valeur: query, operateur: 'ET' }] }],
          filtres,
          pageNumber: 1,
          pageSize: limit,
          operateur: 'ET',
          sort: 'PERTINENCE',
          typePagination: 'DEFAUT'
        }
      })
      if (!r.results?.length) return `No Légifrance result (${collection}) for « ${query} ».`
      const lines = r.results.map((res) => {
        const t = res.titles?.[0]
        const extracts = [...(res.sections ?? []).flatMap((s) => s.extracts ?? []), ...(res.extracts ?? [])]
          .slice(0, 4)
          .map(
            (e) =>
              `  - ${e.num ? `art. ${e.num} ` : ''}(${e.id}${e.legalStatus ? ` · ${e.legalStatus.toLowerCase()}` : ''}) ${strip((e.values ?? []).join(' … ')).slice(0, 240)}`
          )
        return `- **${t?.title ?? '(untitled)'}** (${t?.id ?? '?'}${t?.legalStatus ? ` · ${t.legalStatus.toLowerCase()}` : ''})${extracts.length ? `\n${extracts.join('\n')}` : ''}`
      })
      return `${r.totalResultNumber} Légifrance results (${collection}), the most relevant:\n\n${lines.join('\n')}`
    }
  }),

  tool({
    name: 'read_article',
    title: 'Légifrance article',
    source: 'legifrance',
    readOnly: true,
    description:
      'The text in force of a law article: by its LEGIARTI id, or by code and number (code "Code du travail", number "L1237-1"). Gives its dates in force and the Légifrance link to cite.',
    input: {
      id: z.string().optional().describe('LEGIARTI… id'),
      code: z.string().optional().describe('Name of the code, or its LEGITEXT id'),
      number: z.string().optional().describe('Article number, e.g. "1240" or "L. 1237-1"')
    },
    run: async ({ id, code, number }) => {
      let r: { article?: Article | null }
      if (id) r = await call('/consult/getArticle', { id: id.trim().toUpperCase() })
      else if (code && number) {
        const found = findCode(code)
        if (!found) throw new ToolError(`Unknown code « ${code} ». Known codes: ${CODES.map(([c]) => c).join(', ')}. Or give a LEGITEXT id.`)
        r = await call('/consult/getArticleWithIdAndNum', { id: found.id, num: articleNumber(number) })
      } else throw new ToolError('Give a LEGIARTI id, or a code and an article number.')
      const a = r.article
      if (!a) throw new ToolError('Article not found.')
      const text = a.texteHtml ? strip(a.texteHtml) : (a.texte ?? '')
      const titles = a.textTitles?.map((t) => t.titre ?? t.titreTxt?.[0]?.titre).filter(Boolean)[0] ?? ''
      // No end: a far-future date (year 2999, "3…" in milliseconds).
      const until = a.dateFin && !String(a.dateFin).startsWith('3') ? ` until ${date(a.dateFin)}` : ''
      return clip(
        `# ${titles} · article ${a.num}\n\n${a.fullSectionsTitre ? `${a.fullSectionsTitre}\n\n` : ''}${a.etat.toLowerCase()} · in force from ${date(a.dateDebut)}${until}\nSource: https://www.legifrance.gouv.fr/codes/article_lc/${a.id}\n\n${text}${a.nota ? `\n\nNota: ${strip(a.nota)}` : ''}`,
        20_000
      )
    }
  })
]
