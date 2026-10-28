import { monthDay, type Company, type Deadline, type DomainId, type Dossier } from '../../shared/dossier'

/**
 * Deadlines computed from the personal file: rules (documents expiring, URSSAF declarations,
 * company accounts, technical inspection…), the official calendar (dates published each year),
 * and the deadlines the user or the agent added. Pure: tested in test/rules.test.ts.
 */

export interface CalendarItem {
  id: string
  domain: DomainId
  title: string
  /** MM-DD, every year. */
  monthDay: string
  /** always · proprietaire (owns a property) · entreprise (has a company subject to it) */
  applies: 'always' | 'proprietaire' | 'entreprise'
  indicative?: boolean
  service?: string
  demarche?: string
  source?: string
}

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
const PIECES: Record<string, { title: string; domain: DomainId; demarche?: string; lead?: number }> = {
  cni: { title: 'votre carte d’identité expire : prendre rendez-vous pour la renouveler', domain: 'identite', demarche: 'renouveler-papiers' },
  passeport: { title: 'votre passeport expire : prendre rendez-vous pour le renouveler', domain: 'identite', demarche: 'renouveler-papiers' },
  titre_sejour: { title: 'demander le renouvellement de votre titre de séjour, au plus tard 2 mois avant son expiration', domain: 'identite', lead: 60 },
  permis: { title: 'votre permis de conduire (titre) expire : le renouveler', domain: 'mobilite' },
  carte_vitale: { title: 'votre carte vitale arrive à échéance', domain: 'sante' }
}

function microDeclarations(c: Company, from: number, to: number): Deadline[] {
  const monthly = c.periodicite === 'mensuelle'
  if (!monthly && c.periodicite !== 'trimestrielle') return []
  const out: Deadline[] = []
  const created = parse(c.creation)
  const name = c.denomination || 'micro-entreprise'
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
      domain: 'entreprises',
      title: isFirst
        ? `première déclaration de chiffre d’affaires à l’urssaf : du début d’activité (${frDay(created)}) à la fin du ${monthly ? `mois de ${label}` : label} (${name})`
        : `déclarer le chiffre d’affaires ${monthly ? `de ${label}` : `du ${label}`} à l’urssaf (${name})`,
      date: iso(due),
      source: 'regle',
      status: 'a_faire',
      serviceId: 'urssaf-ae',
      demarcheId: 'declarer-ca-micro'
    })
  }
  return out
}

function companyAccounts(c: Company, from: number, to: number): Deadline[] {
  if (c.regime !== 'societe_is' && c.regime !== 'societe_ir') return []
  const out: Deadline[] = []
  const end = monthDay(c.cloture || '12-31')
  if (!end) return []
  const [mm, dd] = end
  const created = parse(c.creation)
  const name = c.denomination || 'société'
  for (let year = new Date(from).getUTCFullYear() - 1; year <= new Date(to).getUTCFullYear(); year++) {
    // 29 February is the 28th in other years.
    const closing = utc(year, mm, Math.min(dd, monthLength(year, mm - 1)))
    // No financial year closed before the company existed.
    if (!isNaN(created) && closing < created) continue
    // Accounts approved within six months of the closing, filed within a month of the approval.
    const approval = addMonths(closing, 6)
    const filing = addMonths(approval, 1)
    for (const [key, date, title] of [
      [`comptes:${c.id}:${year}:approbation`, approval, `faire approuver les comptes de l’exercice clos le ${frDay(closing)} (${name})`],
      [`comptes:${c.id}:${year}:depot`, filing, `déposer les comptes annuels au greffe (${name})`]
    ] as Array<[string, number, string]>) {
      if (date < from - 31 * DAY || date > to) continue
      out.push({ key, domain: 'entreprises', title, date: iso(date), source: 'regle', status: 'a_faire', indicative: true })
    }
  }
  return out
}

function inspections(d: Dossier, from: number, to: number): Deadline[] {
  const out: Deadline[] = []
  for (const v of d.vehicules) {
    const first = parse(v.premiereImmatriculation)
    const last = parse(v.dernierControle)
    const vehicle = `${v.modele || v.immatriculation}`.trim()
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
      key: `ct:${v.id}:${iso(due)}`,
      domain: 'mobilite',
      title: late
        ? `contrôle technique du véhicule ${vehicle} en retard : il était dû le ${frDay(due)}`
        : `contrôle technique du véhicule ${vehicle}${estimated ? ' (date estimée : renseignez la date du dernier contrôle)' : ''}`,
      date: iso(late ? from : due),
      source: 'regle',
      status: 'a_faire',
      indicative: estimated || undefined,
      sourceUrl: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2878'
    })
  }
  return out
}

function insurance(d: Dossier, from: number, to: number): Deadline[] {
  const out: Deadline[] = []
  for (const l of d.logements.filter((x) => x.statut === 'locataire')) {
    const start = parse(l.debutBail)
    if (isNaN(start)) continue
    const s = new Date(start)
    for (let year = new Date(from).getUTCFullYear(); year <= new Date(to).getUTCFullYear(); year++) {
      const date = utc(year, s.getUTCMonth() + 1, s.getUTCDate())
      if (date < from - 31 * DAY || date > to || date <= start) continue
      out.push({
        key: `assurance:${l.id}:${year}`,
        domain: 'logement',
        title: 'transmettre au bailleur l’attestation d’assurance habitation de l’année',
        date: iso(date),
        source: 'regle',
        status: 'a_faire',
        indicative: true
      })
    }
  }
  return out
}

function pieces(d: Dossier, from: number, to: number): Deadline[] {
  return d.pieces
    .filter((p) => p.expiration && PIECES[p.type])
    .map((p) => ({ p, t: parse(p.expiration) }))
    .filter(({ t }) => !isNaN(t) && t >= from - 365 * DAY && t <= to + 365 * DAY)
    .map(({ p, t }) => {
      const info = PIECES[p.type]
      const holder = p.titulaire === 'moi' ? '' : d.household.find((m) => m.id === p.titulaire)?.prenom
      const title = info.lead ? `${info.title} : il expire le ${frDay(t)}` : info.title
      return {
        key: `piece:${p.id}:${p.expiration}`,
        domain: info.domain,
        title: holder ? `${title} (${holder})` : title,
        date: iso(t - (info.lead ?? 0) * DAY),
        source: 'regle' as const,
        status: 'a_faire' as const,
        demarcheId: info.demarche,
        serviceId: info.domain === 'identite' || info.domain === 'mobilite' ? 'ants' : undefined
      }
    })
}

function calendar(d: Dossier, items: CalendarItem[], from: number, to: number): Deadline[] {
  const owner = d.logements.some((l) => l.statut === 'proprietaire')
  const hasCompany = (year: number) => d.entreprises.some((c) => c.regime !== 'association' && (!c.creation || Number(c.creation.slice(0, 4)) < year))
  const out: Deadline[] = []
  for (const item of items) {
    const [mm, dd] = item.monthDay.split('-').map(Number)
    for (let year = new Date(from).getUTCFullYear(); year <= new Date(to).getUTCFullYear(); year++) {
      const date = utc(year, mm, dd)
      if (date < from - 31 * DAY || date > to) continue
      if (item.applies === 'proprietaire' && !owner) continue
      if (item.applies === 'entreprise' && !hasCompany(year)) continue
      out.push({
        key: `calendrier:${item.id}:${year}`,
        domain: item.domain,
        title: item.title,
        date: iso(date),
        source: 'calendrier',
        status: 'a_faire',
        indicative: item.indicative,
        serviceId: item.service,
        demarcheId: item.demarche,
        sourceUrl: item.source
      })
    }
  }
  return out
}

/** Every deadline from `now` minus a month to `days` ahead, sorted by date, with their status. */
export function computeDeadlines(d: Dossier, items: CalendarItem[], now = new Date(), days = 400): Deadline[] {
  const from = utc(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const to = from + days * DAY
  const computed = [
    ...pieces(d, from, to),
    ...d.entreprises.filter((c) => c.regime === 'micro').flatMap((c) => microDeclarations(c, from, to)),
    ...d.entreprises.flatMap((c) => companyAccounts(c, from, to)),
    ...inspections(d, from, to),
    ...insurance(d, from, to),
    ...calendar(d, items, from, to)
  ]
  const manual: Deadline[] = d.deadlines.map((m) => ({
    key: m.id,
    domain: m.domain,
    title: m.title,
    date: m.date,
    source: m.source,
    status: 'a_faire',
    note: m.note
  }))
  return [...computed, ...manual]
    .map((x) => ({ ...x, status: d.deadlineStatus[x.key] ?? x.status }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}
