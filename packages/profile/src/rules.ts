import type { CalendarItem } from '@marianne/content'
import type { DomainId, ServiceDeadline } from '@marianne/sdk'
import { monthDay, type Company, type Deadline, type IdDocumentType, type Profile } from './profile'

/**
 * Deadlines computed from the profile: rules (documents expiring, URSSAF declarations, company
 * accounts, technical inspection…), the official calendar (dates published each year), and the
 * deadlines the user or the agent added. Pure: tested in test/profile.test.ts.
 */

const DAY = 86_400_000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d)
const parse = (s: string) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? utc(Number(m[1]), Number(m[2]), Number(m[3])) : NaN
}
/** Last day of month `m` (1-12, may overflow into the next years). */
const endOfMonth = (y: number, m: number) => utc(y, m + 1, 0)
/** Number of days of month `m0` (0-11, may overflow). */
const monthLength = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
/** Same day `months` later, clamped to the end of a shorter month; the end of a month stays one. */
function addMonths(t: number, months: number): number {
  const d = new Date(t)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + months
  const day = d.getUTCDate() === monthLength(y, d.getUTCMonth()) ? 31 : d.getUTCDate()
  return Date.UTC(y, m, Math.min(day, monthLength(y, m)))
}
const frDay = (t: number) => iso(t).split('-').reverse().join('/')

/** Documents that expire; `lead`: days before the expiry by which the renewal must be requested. */
const ID_DOCUMENTS: Record<IdDocumentType, { title: string; domain: DomainId; procedure?: string; lead?: number }> = {
  id_card: { title: 'votre carte d’identité expire : prendre rendez-vous pour la renouveler', domain: 'identity', procedure: 'renew-id-documents' },
  passport: { title: 'votre passeport expire : prendre rendez-vous pour le renouveler', domain: 'identity', procedure: 'renew-id-documents' },
  residence_permit: { title: 'demander le renouvellement de votre titre de séjour, au plus tard 2 mois avant son expiration', domain: 'identity', lead: 60 },
  driving_licence: { title: 'votre permis de conduire (titre) expire : le renouveler', domain: 'mobility' },
  health_card: { title: 'votre carte vitale arrive à échéance', domain: 'health' }
}

function microDeclarations(c: Company, from: number, to: number): Deadline[] {
  const monthly = c.frequency === 'monthly'
  if (!monthly && c.frequency !== 'quarterly') return []
  const out: Deadline[] = []
  const created = parse(c.created)
  const name = c.name || 'micro-entreprise'
  // The first declaration covers the start of activity up to the end of the month (or quarter) of
  // its 90th day: the periods before are declared with it.
  const day90 = new Date(created + 89 * DAY)
  const firstEnd = isNaN(created) ? NaN : endOfMonth(day90.getUTCFullYear(), monthly ? day90.getUTCMonth() + 1 : Math.ceil((day90.getUTCMonth() + 1) / 3) * 3)
  const start = new Date(from - 62 * DAY)
  // Periods by their last month: every month, or March, June, September, December.
  const step = monthly ? 1 : 3
  const first = monthly ? start.getUTCMonth() + 1 : Math.ceil((start.getUTCMonth() + 1) / 3) * 3
  for (let i = 0; i < 40; i++) {
    const y = start.getUTCFullYear()
    const m = first + i * step
    // A period is declared by the end of the month after it: 30/04, 31/07, 31/10, 31/01 by quarter.
    const periodEnd = endOfMonth(y, m)
    const due = endOfMonth(y, m + 1)
    if (due > to) break
    if (due < from - 31 * DAY || (!isNaN(firstEnd) && periodEnd < firstEnd)) continue
    const period = new Date(periodEnd)
    const year = period.getUTCFullYear()
    const q = Math.ceil((period.getUTCMonth() + 1) / 3)
    const label = monthly
      ? period.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      : `${q === 1 ? '1er' : `${q}e`} trimestre ${year}`
    const isFirst = periodEnd === firstEnd
    out.push({
      key: `urssaf:${c.id}:${monthly ? iso(periodEnd).slice(0, 7) : `${year}-T${q}`}`,
      domain: 'business',
      title: isFirst
        ? `première déclaration de chiffre d’affaires à l’urssaf : du début d’activité (${frDay(created)}) à la fin du ${monthly ? `mois de ${label}` : label} (${name})`
        : `déclarer le chiffre d’affaires ${monthly ? `de ${label}` : `du ${label}`} à l’urssaf (${name})`,
      date: iso(due),
      source: 'rule',
      status: 'todo',
      siteId: 'urssaf-ae',
      procedureId: 'declare-micro-turnover'
    })
  }
  return out
}

function companyAccounts(c: Company, from: number, to: number): Deadline[] {
  if (c.regime !== 'corporate_tax' && c.regime !== 'income_tax') return []
  const out: Deadline[] = []
  const end = monthDay(c.yearEnd || '12-31')
  if (!end) return []
  const [mm, dd] = end
  const created = parse(c.created)
  const name = c.name || 'société'
  for (let year = new Date(from).getUTCFullYear() - 1; year <= new Date(to).getUTCFullYear(); year++) {
    // 29 February is the 28th in other years.
    const closing = utc(year, mm, Math.min(dd, monthLength(year, mm - 1)))
    // No financial year closed before the company existed.
    if (!isNaN(created) && closing < created) continue
    // Accounts approved within six months of the closing, filed within a month of the approval.
    const approval = addMonths(closing, 6)
    const filing = addMonths(approval, 1)
    for (const [key, date, title] of [
      [`accounts:${c.id}:${year}:approval`, approval, `faire approuver les comptes de l’exercice clos le ${frDay(closing)} (${name})`],
      [`accounts:${c.id}:${year}:filing`, filing, `déposer les comptes annuels au greffe (${name})`]
    ] as Array<[string, number, string]>) {
      if (date < from - 31 * DAY || date > to) continue
      out.push({ key, domain: 'business', title, date: iso(date), source: 'rule', status: 'todo', indicative: true })
    }
  }
  return out
}

function inspections(p: Profile, from: number, to: number): Deadline[] {
  const out: Deadline[] = []
  for (const v of p.vehicles) {
    const first = parse(v.firstRegistration)
    const last = parse(v.lastInspection)
    const vehicle = `${v.model || v.plate}`.trim()
    // First inspection in the 6 months before the 4th anniversary, then every 2 years.
    let due = !isNaN(last) ? addMonths(last, 24) : !isNaN(first) ? addMonths(first, 48) : NaN
    if (isNaN(due)) continue
    // Without the last inspection, the probable one: every 2 years from the first.
    const estimated = isNaN(last)
    if (estimated) while (due < from - 62 * DAY) due = addMonths(due, 24)
    if (due > to) continue
    // An inspection overdue stays, today, until it's done.
    const late = !estimated && due < from
    out.push({
      key: `inspection:${v.id}:${iso(due)}`,
      domain: 'mobility',
      title: late
        ? `contrôle technique du véhicule ${vehicle} en retard : il était dû le ${frDay(due)}`
        : `contrôle technique du véhicule ${vehicle}${estimated ? ' (date estimée : renseignez la date du dernier contrôle)' : ''}`,
      date: iso(late ? from : due),
      source: 'rule',
      status: 'todo',
      indicative: estimated || undefined,
      sourceUrl: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2878'
    })
  }
  return out
}

function insurance(p: Profile, from: number, to: number): Deadline[] {
  const out: Deadline[] = []
  for (const x of p.properties.filter((y) => y.status === 'tenant')) {
    const start = parse(x.leaseStart)
    if (isNaN(start)) continue
    const s = new Date(start)
    for (let year = new Date(from).getUTCFullYear(); year <= new Date(to).getUTCFullYear(); year++) {
      const date = utc(year, s.getUTCMonth() + 1, s.getUTCDate())
      if (date < from - 31 * DAY || date > to || date <= start) continue
      out.push({
        key: `insurance:${x.id}:${year}`,
        domain: 'housing',
        title: 'transmettre au bailleur l’attestation d’assurance habitation de l’année',
        date: iso(date),
        source: 'rule',
        status: 'todo',
        indicative: true
      })
    }
  }
  return out
}

function idDocuments(p: Profile, from: number, to: number): Deadline[] {
  return p.idDocuments
    .filter((x) => x.expires && ID_DOCUMENTS[x.type])
    .map((x) => ({ x, t: parse(x.expires) }))
    .filter(({ t }) => !isNaN(t) && t >= from - 365 * DAY && t <= to + 365 * DAY)
    .map(({ x, t }) => {
      const info = ID_DOCUMENTS[x.type]
      const holder = x.holder === 'me' ? '' : p.household.find((m) => m.id === x.holder)?.firstName
      const title = info.lead ? `${info.title} : il expire le ${frDay(t)}` : info.title
      return {
        key: `id-document:${x.id}:${x.expires}`,
        domain: info.domain,
        title: holder ? `${title} (${holder})` : title,
        date: iso(t - (info.lead ?? 0) * DAY),
        source: 'rule' as const,
        status: 'todo' as const,
        procedureId: info.procedure,
        siteId: info.domain === 'identity' || info.domain === 'mobility' ? 'ants' : undefined
      }
    })
}

function calendar(p: Profile, items: CalendarItem[], from: number, to: number): Deadline[] {
  const owner = p.properties.some((x) => x.status === 'owner')
  const hasCompany = (year: number) => p.companies.some((c) => c.regime !== 'association' && (!c.created || Number(c.created.slice(0, 4)) < year))
  const out: Deadline[] = []
  for (const item of items) {
    const [mm, dd] = item.monthDay.split('-').map(Number)
    for (let year = new Date(from).getUTCFullYear(); year <= new Date(to).getUTCFullYear(); year++) {
      const date = utc(year, mm, dd)
      if (date < from - 31 * DAY || date > to) continue
      if (item.applies === 'owner' && !owner) continue
      if (item.applies === 'company' && !hasCompany(year)) continue
      out.push({
        key: `calendar:${item.id}:${year}`,
        domain: item.domain,
        title: item.title,
        date: iso(date),
        source: 'calendar',
        status: 'todo',
        indicative: item.indicative,
        siteId: item.site,
        procedureId: item.procedure,
        sourceUrl: item.source
      })
    }
  }
  return out
}

/** Every deadline from `now` minus a month to `days` ahead, sorted by date, with their status. */
export function computeDeadlines(p: Profile, items: CalendarItem[], now = new Date(), days = 400): Deadline[] {
  const from = utc(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const to = from + days * DAY
  const computed = [
    ...idDocuments(p, from, to),
    ...p.companies.filter((c) => c.regime === 'micro').flatMap((c) => microDeclarations(c, from, to)),
    ...p.companies.flatMap((c) => companyAccounts(c, from, to)),
    ...inspections(p, from, to),
    ...insurance(p, from, to),
    ...calendar(p, items, from, to)
  ]
  const manual: Deadline[] = p.deadlines.map((m) => ({
    key: m.id,
    domain: m.domain,
    title: m.title,
    date: m.date,
    source: m.source,
    status: 'todo',
    note: m.note
  }))
  return [...computed, ...manual]
    .map((x) => ({ ...x, status: p.deadlineStatus[x.key] ?? x.status }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

/**
 * The deadlines the services report (a toll to pay), as the user's. A service reports only what
 * is still to do: one already past stays, today, like an overdue inspection.
 */
export function serviceDeadlines(list: Array<ServiceDeadline & { service: string }>, now = new Date(), days = 400): Deadline[] {
  const from = utc(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const out: Deadline[] = []
  for (const d of list) {
    const due = parse(d.due.slice(0, 10))
    if (isNaN(due) || due > from + days * DAY) continue
    const late = due < from
    const note = [late && `en retard : l’échéance était le ${frDay(due)}`, d.detail].filter(Boolean).join(' · ')
    out.push({
      key: `service:${d.service}:${d.id}`,
      domain: d.domain,
      title: d.title,
      date: late ? iso(from) : d.due,
      source: 'service',
      status: 'todo',
      ...(note ? { note } : {}),
      service: d.service,
      ...(d.params ? { params: d.params } : {})
    })
  }
  return out
}
