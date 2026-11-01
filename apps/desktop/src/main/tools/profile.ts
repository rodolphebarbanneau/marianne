import { contextView, setupLabel, setupPage, today } from '@marianne/profile'
import * as z from 'zod'
import type { DomainId } from '../../shared/types'
import { approvals } from '../approvals'
import { content } from '../content'
import { deadlines } from '../deadlines'
import { keychain } from '../keychain'
import { searchAddress } from '../lookup'
import { documents } from '../profile/documents'
import { profile } from '../profile/store'
import { isEnabled } from '../public/sources'
import { normalizeValues, opId, plan, PROPOSALS, type Place, type ProposalKind } from './proposals'
import { clip, DOMAIN_IDS, plural, tool, TOKEN, ToolError } from './tool'

/** The engine's access to the user's profile: its context, the cards to change or set it up, deadlines and documents. */

/** The settings pages, by id, as the setup card names them ("renseigner …"). */
const SETTINGS_PAGES: Record<string, string> = {
  identity: 'votre identité',
  household: 'votre foyer et vos entités',
  documents: 'vos documents',
  space: 'l’emplacement de votre archive',
  security: 'votre phrase de passe',
  accounts: 'vos comptes',
  sites: 'vos sites et accès',
  engines: 'vos moteurs',
  browser: 'le navigateur',
  approvals: 'vos autorisations',
  privacy: 'la confidentialité',
  data: 'les données publiques',
  services: 'les services',
  display: 'l’affichage',
  shortcuts: 'les raccourcis clavier',
  skills: 'les compétences',
  about: 'les mises à jour'
}

/** The settings page and the card's label for a setup target; null when there is no such target. */
export function setupCard(target: string): { page: string; label: string } | null {
  // The source must be on (public data), then its PISTE key stored (sites and API).
  if (target === 'legifrance') return { page: isEnabled('legifrance') ? 'sites' : 'data', label: 'votre accès Légifrance' }
  // The news sources are a section of Réglages › Identité.
  if (target === 'sources') return { page: 'identity#sources', label: 'vos sources d’information' }
  const label = setupLabel(target, content.get().sites)
  const page = setupPage(target)
  if (label && page) return { page, label }
  return SETTINGS_PAGES[target] ? { page: target, label: SETTINGS_PAGES[target] } : null
}

/** Where the address was found, for its INSEE code and coordinates; none when the source is off or unreachable. */
async function locate(data: Record<string, string>): Promise<Place | undefined> {
  if (!isEnabled('adresse') || !data.street || !data.postcode) return undefined
  const found = await searchAddress(`${data.street} ${data.postcode} ${data.city ?? ''}`).catch(() => [])
  const match = found.find((a) => a.postcode === data.postcode)
  return match?.inseeCode ? { inseeCode: match.inseeCode, lat: match.lat, lon: match.lon } : undefined
}

const KINDS = [...(Object.keys(PROPOSALS) as ProposalKind[]), 'journal'] as const

export const profileTools = [
  tool({
    name: 'profile',
    title: 'Profile',
    readOnly: true,
    description:
      'The user’s profile without their identifiers: age, commune, household, situation, linked entities (companies, employers, vehicles, homes), the public-service accounts set up by domain, the coming deadlines, and what is not set up yet (with its request_setup target). Identifiers appear as tokens such as [[nir]] or [[tax_number]], replaced by the app on the user’s side: use them as they are in letters, forms and tool arguments. Check it before any personal question.',
    input: { domain: z.enum(DOMAIN_IDS).optional().describe('Only the accounts, deadlines and gaps of one domain') },
    run: async ({ domain }) =>
      contextView(profile.get(), {
        sites: content.get().sites,
        tokens: profile.tokens(),
        deadlines: deadlines(),
        hasLogin: (s) => keychain.hasLogin(s.url),
        domain
      })
  }),

  tool({
    name: 'request_setup',
    title: 'Setup request',
    description:
      'When the answer needs something the user has not set up (an account’s number, the address, a business…), shows a card that takes them to the settings page where they fill it in. Targets: those the profile tool lists as not set up (address, id_documents, companies, employers, vehicles, properties, notes, account:<site id> such as account:impots); legifrance (access to the law texts); or a settings page: identity, household, documents, space, security, accounts, sites, engines, browser, approvals, privacy, data, services, sources, display, shortcuts, skills, about. Never ask for an identifier in the conversation: use this tool.',
    input: {
      target: z.string().describe('e.g. "account:impots", "address", "sites"'),
      reason: z.string().describe('Why it is needed, in one sentence to the user (in French)')
    },
    run: async ({ target, reason }, ctx) => {
      const card = setupCard(target.trim())
      if (!card) throw new ToolError(`Unknown target: ${target}.`)
      const shown = approvals.setup(ctx.folderId, { page: card.page, label: card.label, reason })
      return shown
        ? `Card shown: « renseigner ${card.label} » (settings page ${card.page}). Say in one sentence what to fill in there, answer with what you can already say, and stop: the user comes back once it is done.`
        : `No card could be shown: tell the user to fill in ${card.label} in Marianne's settings (marianne:settings/${card.page}).`
    }
  }),

  tool({
    name: 'propose',
    title: 'Proposal',
    description:
      'Proposes a change to the profile: the user sees a card with the exact values and accepts or refuses; you get the outcome. Adding or updating a deadline may go without a card when they allowed it ahead. Kinds and fields: deadline (title, date YYYY-MM-DD, domain, note); company (siren, name, legalForm, activity, created, address, role director|partner|entrepreneur|other, regime micro|sole_trader|corporate_tax|income_tax|association, frequency monthly|quarterly, vat exempt|simplified|normal, yearEnd MM-DD); employer (name, siren, position, contract permanent|fixed_term|temporary|apprenticeship|civil_service|other, start, end, idcc); vehicle (plate, model, firstRegistration, lastInspection, critair); property (address, inseeCode, use main_home|second_home|rental, status tenant|owner|hosted, rent, leaseStart, landlord); id_document (type id_card|passport|driving_licence|residence_permit|health_card, number, issued, expires, holder "me" or a household member id); account (siteId and the site’s fields, e.g. tax_number); person (civility mr|ms, birthName, usedName, firstNames, birthDate, birthPlace, birthCountry, nationality, nir, iban, familyStatus, workStatus, phone, email; operation update); address (street, complement, postcode, city, since; operation update); household_member (relation spouse|child|other, firstName, lastName, birthDate, dependent); journal (domain, text: a record of a formality done, saved without a card). Tokens [[…]] are accepted. To update or delete, give the id (from profile or deadlines).',
    input: {
      kind: z.enum(KINDS),
      operation: z.enum(['add', 'update', 'delete']).default('add'),
      id: z.string().optional(),
      data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
      reason: z.string().describe('Why, in one sentence for the user (in French)')
    },
    run: async ({ kind, operation, id, data, reason }, ctx) => {
      const values = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v).trim()]))
      if (kind === 'journal') {
        if (!DOMAIN_IDS.includes(values.domain as DomainId) || !values.text)
          throw new ToolError(`journal needs a domain (${DOMAIN_IDS.join(', ')}) and a text.`)
        profile.journal(values.domain as DomainId, values.text)
        return 'Recorded in the journal.'
      }
      const unresolved = Object.values(values).filter((v) => TOKEN.test(v))
      if (unresolved.length) throw new ToolError(`Tokens with no value in the profile: ${unresolved.join(', ')}. Use request_setup so the user fills them in.`)
      const normalized = normalizeValues(kind, values)
      const place = kind === 'address' ? await locate(normalized) : undefined
      const proposal = plan(kind, operation, id, normalized, profile.get(), content.get().sites, place)
      // Only a deadline added or updated can be allowed ahead: identity, numbers, the address, accounts,
      // documents, entities, the household and any deletion take a card every time.
      const deadline = kind === 'deadline' && operation !== 'delete'
      const { decision, ahead } = await approvals.ask(
        ctx.folderId,
        { action: 'profile', deadline },
        { kind: 'proposal', title: proposal.title, reason, fields: proposal.fields },
        { run: !!ctx.run }
      )
      if (decision === 'refused') throw new ToolError('The user refused: nothing was changed. Do not propose it again unless they ask.')
      if (decision === 'expired') throw new ToolError('No answer from the user (or no conversation to show the card in): nothing was changed.')
      // Applied to the profile as it is now: the user may have changed it while the card waited.
      let current: typeof proposal
      try {
        current = plan(kind, operation, id, normalized, profile.get(), content.get().sites, place)
      } catch (err) {
        throw new ToolError(`The profile changed while the card waited, nothing was saved: ${(err as Error).message}`)
      }
      profile.apply(current.op)
      const saved = opId(current.op)
      return `${ahead ? 'Saved without a card, as the user allowed ahead' : 'Accepted and saved'} (${kind}, ${operation}${saved ? `, id ${saved}` : ''}).`
    }
  }),

  tool({
    name: 'deadlines',
    title: 'Deadlines',
    readOnly: true,
    description:
      'The user’s deadlines: computed from their profile (URSSAF declarations, annual accounts, documents expiring, technical inspection…), from the official calendar, those they added, and those the services that are on know of (a toll to pay), with their status and key.',
    input: {
      domain: z.enum(DOMAIN_IDS).optional(),
      days: z.number().int().min(1).max(730).default(120),
      all: z.boolean().default(false).describe('Include those done or ignored')
    },
    run: async ({ domain, days, all }) => {
      const day = (offset: number) => today(new Date(Date.now() + offset * 86_400_000))
      const [since, until] = [day(-31), day(days)]
      const list = deadlines(new Date(), days).filter(
        (x) => (!domain || x.domain === domain) && (all || x.status === 'todo') && x.date >= since && x.date <= until
      )
      if (!list.length) return 'No deadline in that period.'
      return list
        .map(
          (x) =>
            `- ${x.date} · ${x.domain} · ${x.title}${x.indicative ? ' (indicative date)' : ''}${x.status !== 'todo' ? ` [${x.status}]` : ''}${x.procedureId ? ` · procedure ${x.procedureId}` : ''}${x.siteId ? ` · site ${x.siteId}` : ''} · key ${x.key}`
        )
        .join('\n')
    }
  }),

  tool({
    name: 'documents',
    title: 'Documents',
    readOnly: true,
    description:
      'The documents of the user’s archive (tax notices, certificates, payslips, letters…), by domain, with their id. Those of a folder are its pièces (see folder).',
    input: { domain: z.enum(DOMAIN_IDS).optional() },
    run: async ({ domain }, ctx) => {
      const list = documents.list().filter((x) => !domain || x.domain === domain)
      if (!list.length) return 'No document. The user can add some in the settings (marianne:settings/documents) or drop them in the conversation.'
      const lines = list.map(
        (x) =>
          `- ${x.id} · ${x.domain} · ${x.type} · ${x.title} · ${x.date} · ${x.fileName}${x.folderId && x.folderId === ctx.folderId ? ' · pièce of this folder' : ''}`
      )
      return `${plural(list.length, 'document')}:\n${lines.join('\n')}`
    }
  }),

  tool({
    name: 'read_document',
    title: 'Document reading',
    readOnly: true,
    description:
      'The text of a document of the archive (PDF with a text layer, text files), identifiers replaced by tokens. Images and scans can’t be read this way.',
    input: { id: z.string() },
    run: async ({ id }) => {
      const meta = documents.get(id)
      if (!meta) throw new ToolError('Unknown document.')
      const text = await documents.text(id)
      if (text === null)
        return `« ${meta.title} » is an image or a scan without text. Ask the user to attach it to the conversation if they agree to send it to you as it is.`
      return clip(`# ${meta.title} (${meta.type}, ${meta.date})\n\n${text}`, 40_000)
    }
  })
]
